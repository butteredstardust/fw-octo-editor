const { runShell } = require('../../utils/validation');
const gvasService = require('../gvasService');
const { getSavePaths } = require('./paths');
const { toNumber, sqlStr, requireChangedRows } = require('./validators');
const { withWriteReceipt } = require('./receipt');
const { listCharacters } = require('./characters');
const { getCurrencies } = require('./currencies');
const QUEST_DATA = require('../../data/quests.canonical.json');

// Best-effort friendly quest data (see scripts/generate-quest-data.js and
// data/quest-map-overrides.json). Most save quest tags have no automatic
// correlation to a wiki page, so only the hand-reviewed subset in tagMap
// resolves to real wiki data; everything else falls back to a prettified
// version of the raw tag so the UI never shows nothing.
function questFriendlyData(tag) {
  const page = QUEST_DATA.tagMap[tag];
  const wiki = page ? QUEST_DATA.quests[page] : null;
  if (wiki) return { name: wiki.name, wiki };
  return { name: tag.replace(/^Quest\./, '').replace(/\./g, ' '), wiki: null };
}

// ---- Dashboard aggregation ----

async function getSelectedCharacterTag(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT Value FROM UserSettings WHERE Key = 'SelectedCharacterTag' LIMIT 1`
  ]);
  return results.length ? results[0].trim() : null;
}

// Extract a weapon slot's data from the parsed uesave PlayerLoadout JSON.
// Returns the weapon RowName, nickname, and the list of attached parts
// (each: { category, item, index }). The rig nickname is read from RigNickname_0.
function parseLoadoutWeaponSlot(props, slotKey) {
  const slot = props[slotKey];
  if (!slot) return null;
  const handle = slot.WeaponRowHandle_0 || slot.WeaponRowHandle || {};
  const rowName = handle.RowName_0 || handle.RowName || null;
  if (!rowName || rowName === 'None') return null;

  const nickKey = slotKey.replace('Weapon', 'Nickname'); // PrimaryWeapon -> PrimaryNickname
  const nickname = props[nickKey] != null ? props[nickKey] : null;

  const partsKey = slotKey.replace('Weapon', 'PartsChanged'); // PrimaryWeapon -> PrimaryPartsChanged
  const partsRaw = props[partsKey];
  const attachments = Array.isArray(partsRaw)
    ? partsRaw.map(p => ({
        category: p.AttachmentCategory_0 || p.AttachmentCategory || null,
        item: p.ItemRowName_0 || p.ItemRowName || null,
        index: p.DefaultIndex_0 != null ? p.DefaultIndex_0 : (p.DefaultIndex != null ? p.DefaultIndex : null)
      })).filter(a => a.item && a.item !== 'None')
    : [];

  return { weapon: rowName, nickname: nickname || null, attachments };
}

async function getLoadout(key) {
  // Parse PlayerLoadout via uesave (accurate, type-safe) instead of an ASCII
  // heuristic. Falls back to nulls if the blob is unavailable.
  let props;
  try {
    const json = await gvasService.readNamedBlobJson(key, 'PlayerLoadout');
    props = (json && json.root && json.root.properties) || {};
  } catch (err) {
    return { primary: null, secondary: null, throwable: null, throwMechanism: null, rig: null, error: err.message };
  }
  // Rig nickname lives inside the BackpackRig_0 struct (not a top-level prop).
  const backpack = props['BackpackRig_0'] || {};
  const rig = backpack['RigNickname_0'] != null ? backpack['RigNickname_0'] : null;
  const rigRow = props['RigRow_0'] != null ? props['RigRow_0'] : null;
  // ThrowWeapon_0 points at WeaponsDetailsData and currently resolves to the
  // internal GRL00 throw mechanism. It does not identify the player-visible
  // grenade/throwable selection. No such selection is persisted in the parsed
  // PlayerLoadout, PlayerCustomRigs, VaultInventory, or KnownItems blobs, so do
  // not expose GRL00 as an equipped item.
  const throwMechanism = parseLoadoutWeaponSlot(props, 'ThrowWeapon_0') || parseLoadoutWeaponSlot(props, 'ThrowWeapon');
  return {
    primary: parseLoadoutWeaponSlot(props, 'PrimaryWeapon_0') || parseLoadoutWeaponSlot(props, 'PrimaryWeapon'),
    secondary: parseLoadoutWeaponSlot(props, 'SecondaryWeapon_0') || parseLoadoutWeaponSlot(props, 'SecondaryWeapon'),
    throwable: null,
    throwMechanism: throwMechanism ? { internalRow: throwMechanism.weapon, quantity: 1 } : null,
    rig,
    rigRow,
    error: null
  };
}

async function getQuests(key) {
  const dbPath = getSavePaths()[0];
  const [questRows, stepRows] = await Promise.all([
    runShell(dbPath, key, [`SELECT QuestID, QuestName, Status FROM Quests ORDER BY QuestID`]),
    runShell(dbPath, key, [`SELECT QuestID, QuestStepID, Value FROM QuestSteps`])
  ]);

  // Per-quest objective progress: map of QuestID -> [{ step, value }]
  const stepsByQuest = {};
  for (const row of stepRows) {
    const [qid, step, value] = row.split('|');
    const id = parseInt(qid, 10);
    (stepsByQuest[id] = stepsByQuest[id] || []).push({
      step: parseInt(step, 10),
      value: parseInt(value, 10)
    });
  }

  return questRows.map(r => {
    const [qid, name, status] = r.split('|');
    const id = parseInt(qid, 10);
    const s = parseInt(status, 10);
    const steps = stepsByQuest[id] || [];
    // Total progress toward objectives (max step value seen this session).
    const progress = steps.reduce((m, x) => Math.max(m, x.value), 0);
    let state = 'not_started';
    if (s === 3) state = 'complete';
    else if (s === 2) state = 'ready';        // conditions met, awaiting turn-in
    else if (s === 1) state = 'in_progress';
    const tag = name.trim();
    const friendly = questFriendlyData(tag);
    return { id, tag, name: friendly.name, wiki: friendly.wiki, status: s, state, steps, progress };
  });
}

// EXPERIMENTAL: mark a quest as ready to turn in by setting Quests.Status = 2.
// The game gates the turn-in prompt on Status (0=not started, 1=in progress,
// 2=conditions met / ready to turn in, 3=complete). We mirror that. Note the
// game also tracks objective progress in ScopedCounterValues; if the game
// re-validates counters on load and finds them below target it may flip
// Status back to 1. That is a safe (non-corrupting) no-op revert, but final
// in-game acceptance must be confirmed via a staged test.
async function setQuestReady(key, questId) {
  const dbPath = getSavePaths()[0];
  const id = toNumber(questId, 'questId');
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Invalid quest id: ${questId}`);

  return withWriteReceipt(dbPath, key, async () => {
    const mutation = await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      `UPDATE Quests SET Status = 2 WHERE QuestID = ${id}`,
      `SELECT changes()`,
      `COMMIT`
    ]);
    const changedRows = requireChangedRows(mutation[0], 1, 'Quest ready update');

    const updated = await runShell(dbPath, key, [
      `SELECT QuestName, Status FROM Quests WHERE QuestID = ${id}`
    ]);
    if (updated.length !== 1) throw Object.assign(new Error('Quest verification failed'), { status: 422 });
    const [name, status] = updated[0].split('|');
    if (Number.parseInt(status, 10) !== 2) throw Object.assign(new Error('Quest ready verification failed'), { status: 422 });
    return {
      questId: id,
      name: (name || '').trim(),
      status: parseInt(status, 10),
      state: parseInt(status, 10) === 2 ? 'ready' : 'unknown',
      changedRows,
      targetVerification: { questId: id, status: 2, passed: true }
    };
  });
}

async function getInventoryCounts(key) {
  const items = await gvasService.listInventoryItems(key);
  return items
    .filter(i => i.quantity > 0)
    .map(i => ({ name: i.name, quantity: i.quantity, validLayout: i.validLayout }));
}

async function searchInventory(key, query) {
  const dbPath = getSavePaths()[0];
  const q = query != null ? sqlStr(String(query), 'query') : '';
  const sql = q
    ? `SELECT Name, length(Value) as BlobSize FROM BinaryData WHERE Name = 'TempInventory' AND Value LIKE '%${q}%'`
    : `SELECT Name, length(Value) as BlobSize FROM BinaryData WHERE Name = 'TempInventory'`;
  const results = await runShell(dbPath, key, [sql]);
  return results.map(r => {
    const parts = r.split('|');
    return {
      name: parts[0],
      blobSize: parts[1] ? parseInt(parts[1], 10) : null,
      preview: parts[1] ? parts[1].substring(0, 200) : null
    };
  });
}

async function getDashboardData(key) {
  const selectedTag = await getSelectedCharacterTag(key);
  let character = null;
  if (selectedTag) {
    const chars = await listCharacters(key);
    const match = chars.find(c => c.name === selectedTag);
    if (match) {
      character = {
        tag: match.name,
        level: match.level,
        xp: match.xp,
        characterId: match.characterId,
        shortName: match.name.replace('Pawn.Player.', '')
      };
    }
  }

  const [loadout, quests, inventory, currencies] = await Promise.all([
    getLoadout(key),
    getQuests(key),
    getInventoryCounts(key),
    getCurrencies(key)
  ]);

  return { character, loadout, quests, inventory, currencies };
}

module.exports = {
  questFriendlyData,
  getSelectedCharacterTag,
  parseLoadoutWeaponSlot,
  getLoadout,
  getQuests,
  setQuestReady,
  getInventoryCounts,
  searchInventory,
  getDashboardData
};
