const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runShell, runIntegrityCheck, validateForeignKeys } = require('../utils/validation');
const gvasService = require('./gvasService');
const config = require('./configService');
const HUB_UPGRADE_DATA = require('../data/hub-upgrades.json');
const MANAGED_HUB_TAGS = HUB_UPGRADE_DATA.upgrades.map(entry => entry.tag);
const QUEST_DATA = require('../data/quests.canonical.json');
const PRESTIGE_SKILLS_DATA = require('../data/prestige-skills.canonical.json');
// Extracted once from the 100% reference save via
// scripts/extract-prestige-reference.js -- see that script's header comment.
// Validated at load time so a corrupted/hand-edited canonical file fails
// fast at boot rather than silently writing wrong grants into a real save.
if (!Array.isArray(PRESTIGE_SKILLS_DATA.skills) || PRESTIGE_SKILLS_DATA.skills.length !== 28) {
  throw new Error(`prestige-skills.canonical.json is malformed: expected 28 skills, got ${PRESTIGE_SKILLS_DATA.skills && PRESTIGE_SKILLS_DATA.skills.length}`);
}
const PRESTIGE_SKILLS = PRESTIGE_SKILLS_DATA.skills.map(skill => {
  if (!/^PlayerSkill\.Prestige\.(Health|SpeedBuff)\.\d{2}$/.test(skill.name) || !Number.isInteger(skill.threshold)) {
    throw new Error(`prestige-skills.canonical.json has a malformed entry: ${JSON.stringify(skill)}`);
  }
  return skill;
});
const WEAPON_XP_REFERENCE = require('../data/weapon-xp-reference.canonical.json').weaponXp;

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

const SAVE_PREFIX = '0002524f464349c086ad775367f0b95a';

const SAVE_FILES = [
  `${SAVE_PREFIX}.dat`,
  `${SAVE_PREFIX}.knowngood.dat`,
  `${SAVE_PREFIX}.knowngood.old.dat`
];

// ---- Input validation for SQL interpolation -------------------------------
// Every write below builds SQL by interpolation. The frontend coerces inputs,
// but we re-validate server-side so a bad/missing value can never reach the
// SQLite shell as a literal (e.g. `SET Value = NaN`).

// Coerce to a finite number (integer-friendly). Throws if not a valid number.
function toNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw Object.assign(new Error(`Invalid ${label || 'number'}: expected a finite number, got ${JSON.stringify(value)}`), { status: 400 });
  }
  return n;
}

function toInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = toNumber(value, label);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw Object.assign(new Error(`Invalid ${label || 'integer'}: expected an integer from ${min} to ${max}`), { status: 400 });
  }
  return number;
}

function requireChangedRows(raw, expected, label) {
  const actual = Number.parseInt(String(raw || ''), 10);
  if (actual !== expected) throw Object.assign(new Error(`${label} changed ${actual} rows; expected ${expected}`), { status: 422 });
  return actual;
}

// Escape a single-quoted SQL string literal and reject embedded NULs. SQLite
// strings use '' doubling; this also blocks control characters that could
// break the shell command we pipe in.
function sqlStr(value, label) {
  if (typeof value !== 'string') {
    throw Object.assign(new Error(`Invalid ${label || 'string'}: expected text, got ${typeof value}`), { status: 400 });
  }
  if (value.includes('\0')) {
    throw Object.assign(new Error(`Invalid ${label || 'string'}: contains a NUL character, which is not allowed`), { status: 400 });
  }
  if (value.includes('\n') || value.includes('\r')) {
    throw Object.assign(new Error(`Invalid ${label || 'string'}: contains a newline character, which is not allowed`), { status: 400 });
  }
  return value.replace(/'/g, "''");
}

// Resolve save paths from the (optional) user override directory, falling back
// to the built-in default live save directory.
function getSavePaths() {
  const dir = config.getSaveDir();
  return SAVE_FILES.map(f => path.join(dir, f));
}

// Path to the live primary save file, for callers (e.g. a settings-page key
// verification check) that need to test a candidate key without duplicating
// the save-file naming convention.
function getPrimarySavePath() {
  return getSavePaths()[0];
}

async function getSchema(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ]);
  return results.map(r => ({ table: r }));
}

async function listCharacters(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT c.CharacterTypeID, c.CharacterGameplayTag, c.Level,
       (SELECT MAX(s.Value) FROM ScopedCounterValues s
          JOIN Names sc ON sc.NameID = s.ScopeID
          JOIN Names cc ON cc.NameID = s.CounterID
        WHERE sc.Name = 'Scope.Character.' || REPLACE(c.CharacterGameplayTag, 'Pawn.Player.', '')
          AND cc.Name = 'Counter.XP')
     FROM Characters c ORDER BY c.CharacterTypeID`
  ]);
  return results.map(r => {
    const parts = r.split('|');
    return {
      characterId: parts[0],
      name: parts[1],
      level: parseInt(parts[2], 10),
      xp: parts[3] != null && parts[3] !== '' ? parseFloat(parts[3]) : 0
    };
  });
}

async function updateCharacterLevel(key, characterId, level) {
  const dbPath = getSavePaths()[0];
  const lvl = toInteger(level, 'level', { min: 0, max: 1000 });
  const cid = toInteger(characterId, 'characterId', { min: 1 });
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const mutation = await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE Characters SET Level = ${lvl} WHERE CharacterTypeID = ${cid}`,
    `SELECT changes()`,
    `COMMIT`
  ]);
  const changedRows = requireChangedRows(mutation[0], 1, 'Character level update');
  const verification = await runShell(dbPath,key,[`SELECT Level FROM Characters WHERE CharacterTypeID = ${cid}`]);
  if (Number.parseInt(verification[0],10) !== lvl) throw Object.assign(new Error('Character level verification failed'),{status:422});

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();

  return {
    success: afterIntegrity.passed,
    changedRows,
    targetVerification: { characterId: cid, level: lvl, passed: true },
    beforeIntegrity,
    afterIntegrity,
    beforeFk,
    afterFk,
    beforeHashes,
    afterHashes
  };
}

async function setPrestige(key, characterId, targetLevel) {
  const dbPath = getSavePaths()[0];
  const lvl = toInteger(targetLevel, 'targetLevel', { min: 0, max: 50 });
  const cid = toInteger(characterId, 'characterId', { min: 1 });
  const grants = PRESTIGE_SKILLS.map(skill => ({
    rawName: skill.name,
    name: sqlStr(skill.name, 'skillName'),
    state: lvl >= skill.threshold ? 1 : 0
  }));

  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const mutation = await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE Characters SET Level = ${lvl} WHERE CharacterTypeID = ${cid}`,
    `SELECT changes()`,
    ...grants.flatMap(grant => [
      `INSERT INTO CharacterSkills(CharacterTypeID, SkillName, State) VALUES(${cid}, '${grant.name}', ${grant.state}) ON CONFLICT(CharacterTypeID, SkillName) DO UPDATE SET State = excluded.State`,
      `SELECT changes()`
    ]),
    `COMMIT`
  ]);
  requireChangedRows(mutation[0], 1, 'Prestige character update');
  mutation.slice(1).forEach((raw, index) => requireChangedRows(raw, 1, `Prestige grant ${grants[index].rawName}`));
  const verification = await runShell(dbPath, key, [
    `SELECT Level FROM Characters WHERE CharacterTypeID = ${cid}`,
    `SELECT SkillName, State FROM CharacterSkills WHERE CharacterTypeID = ${cid} AND SkillName LIKE 'PlayerSkill.Prestige.%' ORDER BY SkillName`
  ]);
  if (Number.parseInt(verification[0], 10) !== lvl || verification.length !== 29) throw Object.assign(new Error('Prestige verification failed'), { status: 422 });
  const actual = new Map(verification.slice(1).map(row => { const [name, state] = row.split('|'); return [name, Number.parseInt(state, 10)]; }));
  if (grants.some(grant => actual.get(grant.rawName) !== grant.state)) throw Object.assign(new Error('Prestige grant verification failed'), { status: 422 });
  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();

  return {
    success: afterIntegrity.passed,
    changedRows: 1 + grants.length,
    skillsUpdated: grants.length,
    targetVerification: { characterId: cid, level: lvl, prestigeRows: grants.length, activeGrants: grants.filter(g => g.state === 1).length, passed: true },
    beforeIntegrity,
    afterIntegrity,
    beforeFk,
    afterFk,
    beforeHashes,
    afterHashes
  };
}

async function listHubUpgrades(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT UpgradeTag, Permanent FROM PlayerUpgrades ORDER BY UpgradeTag`
  ]);
  return results.map(r => {
    const [tag, perm] = r.split('|');
    return { upgradeTag: tag, permanent: parseInt(perm, 10) };
  });
}

async function setHubUpgrades(key, tags) {
  const dbPath = getSavePaths()[0];
  if (!Array.isArray(tags)) throw new Error('tags must be an array');
  const requested=[...new Set(tags.map(tag=>String(tag)))];
  const unknown=requested.filter(tag=>!MANAGED_HUB_TAGS.includes(tag));
  if(unknown.length)throw Object.assign(new Error(`Unknown managed upgrade tags: ${unknown.join(', ')}`),{status:400});
  const safeTags = requested.map(t => sqlStr(t, 'upgradeTag'));
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const managedSql=MANAGED_HUB_TAGS.map(tag=>`'${sqlStr(tag,'managedUpgradeTag')}'`).join(',');
  const deleteCmd = safeTags.length > 0
    ? `DELETE FROM PlayerUpgrades WHERE UpgradeTag IN (${managedSql}) AND UpgradeTag NOT IN (${safeTags.map(t => `'${t}'`).join(',')})`
    : `DELETE FROM PlayerUpgrades WHERE UpgradeTag IN (${managedSql})`;

  const insertValues = safeTags.map(t => `('${t}', 0)`).join(',');
  const insertCmd = safeTags.length > 0
    ? `INSERT OR REPLACE INTO PlayerUpgrades (UpgradeTag, Permanent) VALUES ${insertValues}`
    : '';

  await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    deleteCmd,
    ...(requested.length > 0 ? [insertCmd] : []),
    `COMMIT`
  ]);
  const managedAfter=await runShell(dbPath,key,[`SELECT UpgradeTag FROM PlayerUpgrades WHERE UpgradeTag IN (${managedSql}) ORDER BY UpgradeTag`]);
  const actual=managedAfter.map(row=>row.trim()).filter(Boolean).sort();
  const expected=[...requested].sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Object.assign(new Error('Hub upgrade verification failed'),{status:422});

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();

  return {
    success: afterIntegrity.passed,
    tagsSet: requested.length,
    targetVerification: { requested:expected, actual, preservedUnknownTags: true, passed:true },
    beforeIntegrity,
    afterIntegrity,
    beforeFk,
    afterFk,
    beforeHashes,
    afterHashes
  };
}

async function listWeaponXp(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT ns.Name, sc.Value FROM ScopedCounterValues sc JOIN Names ns ON ns.NameID = sc.ScopeID WHERE ns.Name LIKE 'Scope.Weapon.%' ORDER BY ns.Name`
  ]);
  return results.map(r => {
    const [name, value] = r.split('|');
    return { weapon: name, xp: parseFloat(value) };
  });
}

// Reference 100% save weapon XP values, used as a per-weapon target baseline.
// Extracted once from the 100% reference save via
// scripts/extract-weapon-xp-reference.js (see that script's header comment;
// same fix as prestige-skills.canonical.json -- avoids a runtime dependency
// on reference/*.dat, which is gitignored and never bundled into release
// builds). key is accepted only for call-site/signature compatibility.
async function getReferenceWeaponXp(_key) {
  return { ...WEAPON_XP_REFERENCE };
}

async function setWeaponXp(key, weaponScope, xp) {
  const dbPath = getSavePaths()[0];
  const scope = sqlStr(String(weaponScope), 'weaponScope');
  const value = toInteger(xp, 'xp', { min: 0 });
  const nameResult = await runShell(dbPath, key, [
    `SELECT NameID FROM Names WHERE Name = '${scope}'`
  ]);
  const scopeNameId = nameResult[0] ? nameResult[0].trim() : null;

  if (!scopeNameId) {
    throw new Error(`Weapon scope not found: ${weaponScope}`);
  }

  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const mutation = await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE ScopedCounterValues SET Value = ${value}
       WHERE ScopeID = ${scopeNameId}
         AND WindowID = (SELECT NameID FROM Names WHERE Name = 'DataWindow.Persistent')
         AND CounterID = (SELECT NameID FROM Names WHERE Name = 'Counter.XP')`,
    `SELECT changes()`,
    `COMMIT`
  ]);
  const changedRows = requireChangedRows(mutation[0],1,'Weapon XP update');
  const verified = await runShell(dbPath,key,[`SELECT Value FROM ScopedCounterValues WHERE ScopeID=${scopeNameId} AND WindowID=(SELECT NameID FROM Names WHERE Name='DataWindow.Persistent') AND CounterID=(SELECT NameID FROM Names WHERE Name='Counter.XP')`]);
  if(Number.parseInt(verified[0],10)!==value)throw Object.assign(new Error('Weapon XP verification failed'),{status:422});

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();

  return {
    success: afterIntegrity.passed,
    weapon: weaponScope,
    xp,
    changedRows,
    targetVerification: { scope: weaponScope, window: 'DataWindow.Persistent', counter: 'Counter.XP', value, passed: true },
    beforeIntegrity,
    afterIntegrity,
    beforeFk,
    afterFk,
    beforeHashes,
    afterHashes
  };
}


// Bulk-set weapon XP for many scopes in a single write pass. Each item is
// validated (numeric xp, escaped scope) before interpolation. Returns a per-item
// status array plus an overall integrity/FK/hashes summary.
async function batchSetWeaponXp(key, items) {
  const dbPath = getSavePaths()[0];
  if(!Array.isArray(items)||items.length<1||items.length>250)throw Object.assign(new Error('items must contain 1 to 250 entries'),{status:400});
  // Label each field with its position/scope so a single bad entry in a
  // batch of up to 250 says exactly which one failed, instead of a bare
  // "Invalid xp" that leaves the caller to guess which item was the problem.
  const normalized=items.map((it,index)=>{
    const context=`item ${index+1} of ${items.length}, scope ${JSON.stringify(it.scope)}`;
    return {scope:sqlStr(String(it.scope),`scope (${context})`),originalScope:String(it.scope),value:toInteger(it.xp,`xp (${context})`,{min:0})};
  });
  if(new Set(normalized.map(it=>it.scope)).size!==normalized.length)throw Object.assign(new Error('Duplicate weapon scopes are not allowed'),{status:400});
  const scopeRows=await runShell(dbPath,key,[`SELECT Name,NameID FROM Names WHERE Name IN (${normalized.map(it=>`'${it.scope}'`).join(',')})`]);
  const ids=new Map(scopeRows.map(row=>{const [name,id]=row.split('|');return [name,id];}));
  const missing=normalized.filter(it=>!ids.has(it.originalScope)).map(it=>it.originalScope);
  if(missing.length)throw Object.assign(new Error(`Weapon scopes not found: ${missing.join(', ')}`),{status:422});
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const commands=['BEGIN IMMEDIATE'];
  for(const it of normalized){commands.push(`UPDATE ScopedCounterValues SET Value=${it.value} WHERE ScopeID=${ids.get(it.originalScope)} AND WindowID=(SELECT NameID FROM Names WHERE Name='DataWindow.Persistent') AND CounterID=(SELECT NameID FROM Names WHERE Name='Counter.XP')`);commands.push(`SELECT changes()`);}
  commands.push('COMMIT');
  const changes=await runShell(dbPath,key,commands);
  changes.forEach((raw,index)=>requireChangedRows(raw,1,`Weapon XP batch entry ${normalized[index]?.originalScope||index}`));
  const verifyRows=await runShell(dbPath,key,[`SELECT n.Name,s.Value FROM ScopedCounterValues s JOIN Names n ON n.NameID=s.ScopeID WHERE s.ScopeID IN (${normalized.map(it=>ids.get(it.originalScope)).join(',')}) AND s.WindowID=(SELECT NameID FROM Names WHERE Name='DataWindow.Persistent') AND s.CounterID=(SELECT NameID FROM Names WHERE Name='Counter.XP')`]);
  const verified=new Map(verifyRows.map(row=>{const [scope,value]=row.split('|');return[scope,Number.parseInt(value,10)];}));
  for(const it of normalized)if(verified.get(it.originalScope)!==it.value)throw Object.assign(new Error(`Weapon XP verification failed: ${it.originalScope}`),{status:422});
  const results=normalized.map(it=>({scope:it.originalScope,ok:true,value:it.value}));

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();
  return {
    success: afterIntegrity.passed,
    updated: results.filter(r => r.ok).length,
    failed: 0,
    changedRows: normalized.length,
    targetVerification: { passed:true, targets:results },
    results,
    beforeIntegrity, afterIntegrity, beforeFk, afterFk, beforeHashes, afterHashes
  };
}

// Vendor trust is stored as a continuous FactionScore per faction (the wiki's
// Untrusted/Neutral/Trusted tiers are derived from this at runtime). We read the
// canonical DataWindow.Persistent row and ignore the duplicate TugOfWar row.
async function listFactionScores(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT ns.Name, sc.Value FROM ScopedCounterValues sc
     JOIN Names ns ON ns.NameID = sc.ScopeID
     JOIN Names nw ON nw.NameID = sc.WindowID
     JOIN Names nc ON nc.NameID = sc.CounterID
     WHERE nc.Name = 'Counter.FactionScore'
       AND nw.Name = 'DataWindow.Persistent'
     ORDER BY ns.Name`
  ]);
  return results.map(r => {
    const [scope, value] = r.split('|');
    const faction = scope.replace(/^Scope\.Faction\./, '');
    return { faction, scope, score: parseFloat(value) };
  });
}

async function setFactionScore(key, scope, score) {
  const dbPath = getSavePaths()[0];
  const s = sqlStr(String(scope), 'scope');
  const value = toInteger(score, 'score', { min: -2147483648, max: 2147483647 });
  const nameResult = await runShell(dbPath, key, [
    `SELECT NameID FROM Names WHERE Name = '${s}'`
  ]);
  const scopeNameId = nameResult[0] ? nameResult[0].trim() : null;
  if (!scopeNameId) throw new Error(`Faction scope not found: ${scope}`);

  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const mutation = await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE ScopedCounterValues SET Value = ${value}
       WHERE ScopeID = ${scopeNameId}
          AND WindowID = (SELECT NameID FROM Names WHERE Name = 'DataWindow.Persistent')
          AND CounterID = (SELECT NameID FROM Names WHERE Name = 'Counter.FactionScore')`,
    `SELECT changes()`,
    `COMMIT`
  ]);
  const changedRows = requireChangedRows(mutation[0], 1, 'Faction score update');
  const verified = await runShell(dbPath, key, [`SELECT Value FROM ScopedCounterValues WHERE ScopeID = ${scopeNameId} AND WindowID = (SELECT NameID FROM Names WHERE Name = 'DataWindow.Persistent') AND CounterID = (SELECT NameID FROM Names WHERE Name = 'Counter.FactionScore')`]);
  if (verified.length !== 1 || Number(verified[0]) !== value) throw Object.assign(new Error('Faction score verification failed'), { status: 422 });

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();
  return { success: afterIntegrity.passed, scope, score: value, changedRows, targetVerification: { scope, score: value, passed: true }, beforeIntegrity, afterIntegrity, beforeFk, afterFk, beforeHashes, afterHashes };
}

// Trader availability flags live in UserSettings (e.g. Trader.Luca.Unlocked).
async function listTraderUnlocks(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT Key, Value FROM UserSettings WHERE Key LIKE 'Trader.%' OR Key LIKE 'Questgiver.%' ORDER BY Key`
  ]);
  return results.map(r => {
    const [k, v] = r.split('|');
    return { key: k, unlocked: parseInt(v, 10) === 1 };
  });
}

async function setTraderUnlock(key, settingKey, unlocked) {
  const dbPath = getSavePaths()[0];
  const k = sqlStr(String(settingKey), 'settingKey');
  if (typeof unlocked !== 'boolean') throw Object.assign(new Error('unlocked must be a boolean'), { status: 400 });
  const v = unlocked ? 1 : 0;
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const mutation = await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE UserSettings SET Value = ${v} WHERE Key = '${k}'`,
    `SELECT changes()`,
    `COMMIT`
  ]);
  const changedRows = requireChangedRows(mutation[0], 1, 'Trader unlock update');
  const verified = await runShell(dbPath, key, [`SELECT Value FROM UserSettings WHERE Key = '${k}'`]);
  if (verified.length !== 1 || Number.parseInt(verified[0], 10) !== v) throw Object.assign(new Error('Trader unlock verification failed'), { status: 422 });

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();
  return { success: afterIntegrity.passed, key: settingKey, unlocked, changedRows, targetVerification: { key: settingKey, unlocked, passed: true }, beforeIntegrity, afterIntegrity, beforeFk, afterFk, beforeHashes, afterHashes };
}

// Read-only: the six shop-type vendors (NPCVendorTypes -- distinct from the
// wiki-named VENDOR_ROSTER used for Trader.*/Questgiver.* unlock flags on the
// frontend; some of these 6 rows likely correspond to named roster NPCs, but
// which internal row is "Kane" vs "Luca" etc. isn't derivable from the save
// data alone, so this deliberately surfaces the raw vendor names rather than
// guessing a mapping). ResetTimestamp is each vendor's own "last restocked
// at" tick value (0 = never restocked). TimedEvents.VendorReset is a single
// shared NextOccurrence used across vendors, same mechanism as
// Recipe.RepairWeapon (see getRepairStatus() below) -- returned as-is since
// there's no verified interval/period to compute a countdown from.
async function getVendorEconomy(key) {
  const dbPath = getSavePaths()[0];
  const vendorRows = await runShell(dbPath, key, [
    `SELECT VendorID, RowName, ResetTimestamp FROM NPCVendorTypes ORDER BY RowName`
  ]);
  const consumedRows = await runShell(dbPath, key, [
    `SELECT v.RowName, it.RowName, c.Quantity FROM NPCVendorConsumedItems c
     JOIN NPCVendorTypes v ON v.VendorID = c.VendorID
     JOIN ItemTypes it ON it.ItemTypeID = c.ItemTypeID
     ORDER BY v.RowName, it.RowName`
  ]);
  const nextEventRows = await runShell(dbPath, key, [`SELECT NextOccurrence FROM TimedEvents WHERE Name = 'VendorReset'`]);

  const consumedByVendor = {};
  for (const row of consumedRows) {
    const [vendor, itemId, qty] = row.split('|');
    (consumedByVendor[vendor] = consumedByVendor[vendor] || []).push({ itemId, quantity: Number.parseInt(qty, 10) });
  }

  const vendors = vendorRows.map(row => {
    const [vendorId, name, rawTicks] = row.split('|');
    const ticks = Number(rawTicks);
    return {
      vendorId,
      name,
      lastReset: ticks > 0 ? ticksToDate(ticks).toISOString() : null,
      consumedItems: consumedByVendor[name] || []
    };
  });

  const nextResetTicks = nextEventRows.length ? Number(nextEventRows[0]) : null;
  return {
    vendors,
    nextResetEvent: nextResetTicks ? ticksToDate(nextResetTicks).toISOString() : null
  };
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

async function getFileHashes() {
  const paths = getSavePaths();
  const results = {};
  for (const p of paths) {
    try {
      const buf = fs.readFileSync(p);
      results[path.basename(p)] = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    } catch {
      results[path.basename(p)] = null;
    }
  }
  return results;
}

async function listCharacterDetails(key, characterId) {
  const dbPath = getSavePaths()[0];
  const cid = toNumber(characterId, 'characterId');

  // Resolve the gameplay tag for this character (e.g. Pawn.Player.Gunhead).
  const tagRows = await runShell(dbPath, key, [
    `SELECT CharacterGameplayTag FROM Characters WHERE CharacterTypeID = ${cid}`
  ]);
  const gameplayTag = tagRows[0] ? tagRows[0].trim() : null;
  if (!gameplayTag) throw new Error(`Character ${characterId} not found`);

  // XP: Scope.Character.<Name> + Counter.XP, present in multiple WindowIDs.
  // Report the maximum value (the "current" window may lag the saved one).
  const xpScopeId = await runShell(dbPath, key, [
    `SELECT NameID FROM Names WHERE Name = 'Scope.Character.${gameplayTag.replace(/^Pawn\.Player\./, '')}'`
  ]);
  const xpRows = await runShell(dbPath, key, [
    `SELECT Value FROM ScopedCounterValues WHERE ScopeID = ${xpScopeId[0].trim()} AND CounterID = (SELECT NameID FROM Names WHERE Name = 'Counter.XP')`
  ]);
  const xp = xpRows.length
    ? Math.max(...xpRows.map(r => parseFloat(r.split('|')[0])))
    : 0;

  // Skills: every CharacterSkills row for this character.
  const skillRows = await runShell(dbPath, key, [
    `SELECT SkillName, State FROM CharacterSkills WHERE CharacterTypeID = ${cid} ORDER BY SkillName`
  ]);
  const skills = skillRows.map(r => {
    const [name, state] = r.split('|');
    return { name, state: parseInt(state, 10) };
  });

  return { characterId, gameplayTag, xp, skills };
}

async function setCharacterXp(key, characterId, xp) {
  const dbPath = getSavePaths()[0];
  const cid = toInteger(characterId, 'characterId', { min: 1 });
  const tagRows = await runShell(dbPath, key, [
    `SELECT CharacterGameplayTag FROM Characters WHERE CharacterTypeID = ${cid}`
  ]);
  const gameplayTag = tagRows[0] ? tagRows[0].trim() : null;
  if (!gameplayTag) throw new Error(`Character ${characterId} not found`);

  const scopeId = await runShell(dbPath, key, [
    `SELECT NameID FROM Names WHERE Name = 'Scope.Character.${gameplayTag.replace(/^Pawn\.Player\./, '')}'`
  ]);
  const scopeNameId = scopeId[0] ? scopeId[0].trim() : null;
  if (!scopeNameId) throw new Error(`Character XP scope not found for ${gameplayTag}`);

  const value = toInteger(xp, 'xp', { min: 0 });
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const mutation = await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE ScopedCounterValues SET Value = ${value} WHERE ScopeID = ${scopeNameId} AND WindowID = (SELECT NameID FROM Names WHERE Name = 'DataWindow.Limit') AND CounterID = (SELECT NameID FROM Names WHERE Name = 'Counter.XP')`,
    `SELECT changes()`,
    `COMMIT`
  ]);
  const changedRows=requireChangedRows(mutation[0],1,'Character XP update');
  const verified=await runShell(dbPath,key,[`SELECT Value FROM ScopedCounterValues WHERE ScopeID=${scopeNameId} AND WindowID=(SELECT NameID FROM Names WHERE Name='DataWindow.Limit') AND CounterID=(SELECT NameID FROM Names WHERE Name='Counter.XP')`]);
  if(Number.parseInt(verified[0],10)!==value)throw Object.assign(new Error('Character XP verification failed'),{status:422});

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();

  return {
    success: afterIntegrity.passed,
    characterId,
    xp,
    changedRows,
    targetVerification:{characterId:cid,window:'DataWindow.Limit',counter:'Counter.XP',value,passed:true},
    beforeIntegrity, afterIntegrity, beforeFk, afterFk, beforeHashes, afterHashes
  };
}

async function setCharacterSkills(key, characterId, skills) {
  const dbPath = getSavePaths()[0];
  const cid = toInteger(characterId, 'characterId', { min: 1 });
  if (!Array.isArray(skills) || skills.length < 1 || skills.length > 250) throw Object.assign(new Error('skills must contain 1 to 250 entries'), { status: 400 });
  const normalized = skills.map(skill => {
    if (!skill || typeof skill.name !== 'string' || typeof skill.state !== 'boolean') throw Object.assign(new Error('Each skill requires a name and boolean state'), { status: 400 });
    return { rawName: skill.name, name: sqlStr(skill.name, 'skillName'), state: skill.state ? 1 : 0 };
  });
  if (new Set(normalized.map(s => s.rawName)).size !== normalized.length) throw Object.assign(new Error('Duplicate skill names are not allowed'), { status: 400 });
  const existing = await runShell(dbPath, key, [`SELECT SkillName FROM CharacterSkills WHERE CharacterTypeID = ${cid}`]);
  const existingNames = new Set(existing.map(row => row.trim()));
  const missing = normalized.filter(skill => !existingNames.has(skill.rawName));
  if (missing.length) throw Object.assign(new Error(`Unknown character skills: ${missing.map(s => s.rawName).join(', ')}`), { status: 422 });

  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const mutation = await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    ...normalized.flatMap(skill => [`UPDATE CharacterSkills SET State = ${skill.state} WHERE CharacterTypeID = ${cid} AND SkillName = '${skill.name}'`, `SELECT changes()`]),
    `COMMIT`
  ]);
  mutation.forEach((raw, index) => requireChangedRows(raw, 1, `Character skill ${normalized[index].rawName}`));
  const verified = await runShell(dbPath, key, normalized.map(skill => `SELECT State FROM CharacterSkills WHERE CharacterTypeID = ${cid} AND SkillName = '${skill.name}'`));
  if (verified.length !== normalized.length || normalized.some((skill, index) => Number.parseInt(verified[index], 10) !== skill.state)) throw Object.assign(new Error('Character skill verification failed'), { status: 422 });

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();

  return {
    success: afterIntegrity.passed,
    changedRows: normalized.length,
    skillsUpdated: normalized.length,
    targetVerification: { characterId: cid, skills: normalized.map(s => ({ name: s.rawName, state: s.state })), passed: true },
    beforeIntegrity, afterIntegrity, beforeFk, afterFk, beforeHashes, afterHashes
  };
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

  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const mutation = await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE Quests SET Status = 2 WHERE QuestID = ${id}`,
    `SELECT changes()`,
    `COMMIT`
  ]);
  const changedRows = requireChangedRows(mutation[0], 1, 'Quest ready update');

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();
  const updated = await runShell(dbPath, key, [
    `SELECT QuestName, Status FROM Quests WHERE QuestID = ${id}`
  ]);
  if (updated.length !== 1) throw Object.assign(new Error('Quest verification failed'), { status: 422 });
  const [name, status] = updated[0].split('|');
  if (Number.parseInt(status, 10) !== 2) throw Object.assign(new Error('Quest ready verification failed'), { status: 422 });
  return {
    success: afterIntegrity.passed,
    questId: id,
    name: (name || '').trim(),
    status: parseInt(status, 10),
    state: parseInt(status, 10) === 2 ? 'ready' : 'unknown',
    changedRows,
    targetVerification: { questId: id, status: 2, passed: true },
    beforeIntegrity, afterIntegrity, beforeFk, afterFk, beforeHashes, afterHashes
  };
}

async function getInventoryCounts(key) {
  const items = await gvasService.listInventoryItems(key);
  return items
    .filter(i => i.quantity > 0)
    .map(i => ({ name: i.name, quantity: i.quantity, validLayout: i.validLayout }));
}

// ---- Currencies (Currencies table) ----------------------------------------
// The save tracks a handful of currency-style counters in the Currencies table
// (RowName + Amount). We expose the two the player cares about: WaterBarrels
// (water) and TestCurrency (credits). Amount is an integer (INTEGER column).
const CURRENCY_ROWNAMES = ['WaterBarrels', 'TestCurrency'];

async function getCurrencies(key) {
  const dbPath = getSavePaths()[0];
  const list = CURRENCY_ROWNAMES.map(r => `'${sqlStr(r, 'rowName')}'`).join(',');
  const results = await runShell(dbPath, key, [
    `SELECT RowName, Amount FROM Currencies WHERE RowName IN (${list})`
  ]);
  const byName = {};
  for (const r of results) {
    const [rowName, amount] = r.split('|');
    byName[rowName] = parseInt(amount, 10) || 0;
  }
  // Always return both keys (default 0 if the row is missing).
  return {
    WaterBarrels: byName['WaterBarrels'] != null ? byName['WaterBarrels'] : 0,
    TestCurrency: byName['TestCurrency'] != null ? byName['TestCurrency'] : 0
  };
}

async function setCurrency(key, rowName, amount) {
  const dbPath = getSavePaths()[0];
  const r = sqlStr(String(rowName), 'rowName');
  if (!CURRENCY_ROWNAMES.includes(String(rowName))) throw Object.assign(new Error(`Unsupported currency: ${rowName}`),{status:400});
  const value = toInteger(amount, 'amount', { min: 0, max: 2147483647 });
  // Guard: the currency row must already exist (we only edit known rows).
  const existing = await runShell(dbPath, key, [
    `SELECT Amount FROM Currencies WHERE RowName = '${r}'`
  ]);
  if (!existing.length) {
    throw new Error(`Currency not found: ${rowName}`);
  }
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeHashes = await getFileHashes();

  const mutation=await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE Currencies SET Amount = ${value} WHERE RowName = '${r}'`,
    `SELECT changes()`,
    `COMMIT`
  ]);
  const changedRows=requireChangedRows(mutation[0],1,'Currency update');
  const verified=await runShell(dbPath,key,[`SELECT Amount FROM Currencies WHERE RowName='${r}'`]);
  if(Number.parseInt(verified[0],10)!==value)throw Object.assign(new Error('Currency verification failed'),{status:422});

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterHashes = await getFileHashes();
  return { success: afterIntegrity.passed, rowName, amount: value, changedRows, targetVerification:{rowName,amount:value,passed:true}, beforeIntegrity, afterIntegrity, beforeHashes, afterHashes };
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

// ---- Repair Bench (Recipe.RepairWeapon TimedEvent) ----

// Decode a .NET DateTime tick value into a JS Date (UTC).
// Ticks epoch is 0001-01-01; 1970-01-01 == 621355968000000000 ticks.
const DOTNET_EPOCH_TICKS = 621355968000000000;
function ticksToDate(ticks) {
  return new Date((ticks - DOTNET_EPOCH_TICKS) / 10000);
}
function dateToTicks(date) {
  return DOTNET_EPOCH_TICKS + Math.floor(date.getTime() * 10000);
}

// Faction IFF chips (LVL1-3 for each of the 3 factions) used to repair destroyed
// weapons of that faction. Required to repair: the matching destroyed weapon's IFF.
const IFF_TAGS = [
  'IFF_Eurasia_01', 'IFF_Eurasia_02', 'IFF_Eurasia_03',
  'IFF_Europa_01', 'IFF_Europa_02', 'IFF_Europa_03',
  'IFF_Euruskan_01', 'IFF_Euruskan_02', 'IFF_Euruskan_03'
];

async function getRepairStatus(key) {
  const dbPath = getSavePaths()[0];

  // Active repair job timer.
  const teRows = await runShell(dbPath, key, [
    `SELECT Name, NextOccurrence, Period, RepeatCount FROM TimedEvents WHERE Name = 'Recipe.RepairWeapon' LIMIT 1`
  ]);
  let repair = null;
  if (teRows.length) {
    const [name, next, period, repeat] = teRows[0].split('|');
    const ticks = parseInt(next, 10) || 0;
    const completion = ticksToDate(ticks);
    const now = Date.now();
    // A past completion time means the repair is already done and the item is
    // ready for the player to collect from the bench. A future time means the
    // job is still running on its timer.
    const ready = ticks > 0 && completion.getTime() <= now;
    repair = {
      name,
      rawTicks: ticks,
      completionIso: completion.toISOString(),
      period: parseInt(period, 10) || 0,
      repeatCount: parseInt(repeat, 10) || 0,
      active: !ready,
      ready,
      remainingMs: completion.getTime() - now
    };
  }

  // Repair Bench upgrade (terminal gate).
  const benchRows = await runShell(dbPath, key, [
    `SELECT UpgradeTag, Permanent FROM PlayerUpgrades WHERE UpgradeTag = 'Hub.Upgrade.Category.Crafting.WeaponRepairs' LIMIT 1`
  ]);
  const benchUnlocked = benchRows.length > 0;

  // Faction IFF chips on hand (from TempInventory blob). A repair only needs
  // the IFF of the destroyed weapon's origin faction; this shows what you have.
  const items = await gvasService.listInventoryItems(key);
  const inv = {};
  for (const it of items) inv[it.name] = it.quantity;

  const iffs = IFF_TAGS.map(tag => ({ tag, quantity: inv[tag] != null ? inv[tag] : 0 }));

  // On-hand counts of every destroyed-weapon counterpart the bench can repair.
  // Driven by the same recipe list the frontend uses to render cards.
  const DESTROYED_TAGS = [
    'GRL01_Broken', 'GRL02_Broken', 'HMG01_Broken', 'HRF01_Broken', 'HRF02_REAL_Broken',
    'HRF03_Broken', 'HRF04_Broken', 'LMG01_Broken', 'LMG02_Broken', 'LMG03_Broken',
    'LMG04_Broken', 'PST01_Broken', 'PST02_Broken', 'PST03_Broken', 'PST04_Broken',
    'PST05_Broken', 'PST06_Broken', 'PST07_Broken', 'PST10_Broken', 'RFL01_Broken',
    'RFL01B_Broken', 'RFL12_Broken', 'RFL15_Broken', 'RFL16_Broken', 'RFL19_Broken',
    'RFL20_Broken', 'RFL23_Broken', 'RFL29_Broken', 'RFL30_Broken', 'SHG01_Broken',
    'SHG03_Broken', 'SHG04_Broken', 'SHG05_Broken', 'SMG01_Broken', 'SMG02_Broken',
    'SMG03_Broken', 'SMG04_Broken', 'SMG05_Broken', 'SMG06_Broken', 'SMG07_Broken',
    'SMG08_Broken'
  ];
  const destroyed = {};
  for (const tag of DESTROYED_TAGS) destroyed[tag] = inv[tag] != null ? inv[tag] : 0;

  return { repair, benchUnlocked, iffs, destroyed };
}

// Mark the active repair as finished now: set its TimedEvents.NextOccurrence
// to the current time so it reads as "ready to collect" instead of still
// counting down. Does NOT delete the row (the game expects the record to exist
// once a repair has been started).
async function collectRepair(key) {
  const dbPath = getSavePaths()[0];
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getFileHashes();

  const nowTicks = dateToTicks(new Date());
  const mutation = await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE TimedEvents SET NextOccurrence = ${nowTicks} WHERE Name = 'Recipe.RepairWeapon'`,
    `SELECT changes()`,
    `COMMIT`
  ]);
  const changedRows = requireChangedRows(mutation[0], 1, 'Repair collection update');
  const verified = await runShell(dbPath, key, [`SELECT NextOccurrence FROM TimedEvents WHERE Name = 'Recipe.RepairWeapon'`]);
  if (verified.length !== 1 || verified[0].trim() !== String(nowTicks)) throw Object.assign(new Error('Repair collection verification failed'), { status: 422 });

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getFileHashes();

  return {
    success: afterIntegrity.passed,
    changedRows,
    targetVerification: { name: 'Recipe.RepairWeapon', nextOccurrence: nowTicks, passed: true },
    beforeIntegrity,
    afterIntegrity,
    beforeFk,
    afterFk,
    beforeHashes,
    afterHashes
  };
}

// Debug-only Tug-of-War scopes present in every save (a synthetic
// scaling-test map and an internal check-in test), never real playable
// content -- excluded from the territory-control display.
const TUG_OF_WAR_DEBUG_SCOPES = new Set(['TestMapTOWScaling', 'PlayerCheckinTests']);

// Read-only lifetime/combat/progression stats from ScopedCounterValues that
// no existing feature surfaces: overall player totals, damage/kills by
// faction (with a modded-vs-unmodded weapons split), per-character combat
// counts, per-map entry/extract/death counts, and per-location Tug-of-War
// territory control. DataWindow.Persistent carries the canonical value for
// everything except the TugOfWar.* territory scopes, which only ever exist
// under DataWindow.TugOfWar (see listFactionScores()'s comment on the same
// Persistent-vs-TugOfWar duplication elsewhere in this table).
async function getPlayerStats(key) {
  const dbPath = getSavePaths()[0];
  const rows = await runShell(dbPath, key, [
    `SELECT ns.Name, nw.Name, nc.Name, sc.Value FROM ScopedCounterValues sc
     JOIN Names ns ON ns.NameID = sc.ScopeID
     JOIN Names nw ON nw.NameID = sc.WindowID
     JOIN Names nc ON nc.NameID = sc.CounterID
     WHERE nw.Name IN ('DataWindow.Persistent', 'DataWindow.TugOfWar')`
  ]);

  const player = {};
  const damage = {};
  const factions = {};
  const characters = {};
  const mapsByName = new Map();
  const territoryByLocation = new Map();

  for (const raw of rows) {
    const [scope, window, counter, rawValue] = raw.split('|');
    const value = parseFloat(rawValue);

    if (scope === 'Scope.Player' && window === 'DataWindow.Persistent') {
      const key = counter.replace(/^Counter\./, '').toLowerCase();
      player[key] = value;
    } else if (scope.startsWith('Scope.Damage.') && window === 'DataWindow.Persistent') {
      const faction = scope.replace('Scope.Damage.', '');
      const entry = damage[faction] || (damage[faction] = {});
      if (counter === `Counter.Damage.${faction}`) entry.damage = value;
      else if (counter === `Counter.Damage.Kills.${faction}`) entry.kills = value;
      else if (counter === 'Counter.Damage.ModdedWeapons') entry.moddedDamage = value;
      else if (counter === 'Counter.Damage.UnModdedWeapons') entry.unmoddedDamage = value;
      else if (counter === 'Counter.Damage.Kills.ModdedWeapons') entry.moddedKills = value;
      else if (counter === 'Counter.Damage.Kills.UnModdedWeapons') entry.unmoddedKills = value;
    } else if (scope.startsWith('Scope.Faction.') && window === 'DataWindow.Persistent') {
      const faction = scope.replace('Scope.Faction.', '');
      const entry = factions[faction] || (factions[faction] = {});
      if (counter === 'Counter.Attacks') entry.attacks = value;
      else if (counter === 'Counter.Kills') entry.kills = value;
      // Counter.FactionScore is already covered by listFactionScores(); skip it here.
    } else if (scope.startsWith('Scope.Character.') && window === 'DataWindow.Persistent') {
      const character = scope.replace('Scope.Character.', '');
      const entry = characters[character] || (characters[character] = {});
      if (counter === 'Counter.Kills') entry.kills = value;
      else if (counter === 'Counter.Deaths') entry.deaths = value;
      else if (counter === 'Counter.Extractions') entry.extractions = value;
      // Counter.XP is already covered by listCharacters()/listCharacterDetails(); skip it here.
    } else if (scope === 'MapStatistics' && window === 'DataWindow.Persistent') {
      const match = /^MapStatistics\.(.+)\.(Entry|Extract|Death)$/.exec(counter);
      if (!match) continue;
      const [, map, kind] = match;
      const entry = mapsByName.get(map) || { map, entry: 0, extract: 0, death: 0 };
      entry[kind.toLowerCase()] = value;
      mapsByName.set(map, entry);
    } else if (scope.startsWith('TugOfWar.') && window === 'DataWindow.TugOfWar') {
      const location = scope.replace('TugOfWar.', '');
      if (TUG_OF_WAR_DEBUG_SCOPES.has(location)) continue;
      const match = /^AI\.Faction\.Factions\.(.+)$/.exec(counter);
      if (!match) continue;
      const entry = territoryByLocation.get(location) || { location, factions: {} };
      entry.factions[match[1]] = value;
      territoryByLocation.set(location, entry);
    }
  }

  return {
    player,
    damage,
    factions,
    characters,
    maps: [...mapsByName.values()].sort((a, b) => a.map.localeCompare(b.map)),
    territory: [...territoryByLocation.values()].sort((a, b) => a.location.localeCompare(b.location))
  };
}

module.exports = {
  toNumber,
  toInteger,
  sqlStr,
  requireChangedRows,
  getPlayerStats,
  getSchema,
  getPrimarySavePath,
  listCharacters,
  updateCharacterLevel,
  setPrestige,
  listCharacterDetails,
  setCharacterXp,
  setCharacterSkills,
  listHubUpgrades,
  setHubUpgrades,
  listWeaponXp,
  setWeaponXp,
  batchSetWeaponXp,
  getReferenceWeaponXp,
  listFactionScores,
  setFactionScore,
  listTraderUnlocks,
  setTraderUnlock,
  getVendorEconomy,
  searchInventory,
  getFileHashes,
  getDashboardData,
  getCurrencies,
  setCurrency,
  getRepairStatus,
  collectRepair,
  setQuestReady
};
