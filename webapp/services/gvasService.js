// gvasService.js
// Structured GVAS read/edit engine built on trumank/uesave (Rust, UE5-aware).
//
// The TempInventory blob is a GVAS v3 / UE5 file stored (encrypted) inside the
// SQLite3MC .dat. After decryption via the DB key, we shell out to uesave.exe
// (to-json / from-json) to parse and re-serialize the blob losslessly. This gives
// us a correct, type-safe model of the inventory (and the other maps) instead of
// the heuristic byte-scan in binaryParser.
//
// Verified: uesave round-trips our blob byte-identically (SHA256 matches), and
// quantity edits persist through to-json -> edit -> from-json.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { runShell, runIntegrityCheck, validateForeignKeys } = require('../utils/validation');
const binaryParser = require('./binaryParser');
// NOTE: saveService requires gvasService (circular dep), so require it lazily
// inside functions to avoid an empty exports object at module-load time.
const config = require('./configService');
const rigCatalogData = require('../data/rigs.json');
const MAX_INVENTORY_QUANTITY = 2147483647;
const RIG_DATA_TABLE = '/Game/Blueprints/Data/BackpackRigDataV2.BackpackRigDataV2';
const CONTAINER_DATA_TABLE = '/Game/Blueprints/Data/InventoryContainerData.InventoryContainerData';

const SAVE_PREFIX = '0002524f464349c086ad775367f0b95a';

// Built CLI from tools/uesave-src. Override via env GVAS_UESAVE_BIN.
const DEFAULT_UESAVE = path.join(
  process.cwd(),
  '..',
  'tools',
  'uesave-src',
  'target',
  'release',
  'uesave.exe'
);
const UESAVE_BIN = process.env.GVAS_UESAVE_BIN
|| (fs.existsSync(DEFAULT_UESAVE) ? DEFAULT_UESAVE : null);

// Resolve save paths from the (optional) user override directory, falling back
// to the built-in default live save directory.
function getSavePaths() {
  const dir = config.getSaveDir();
  return [
    `${SAVE_PREFIX}.dat`,
    `${SAVE_PREFIX}.knowngood.dat`,
    `${SAVE_PREFIX}.knowngood.old.dat`
  ].map(f => path.join(dir, f));
}

function runUesave(args, inputBuffer) {
  return new Promise((resolve, reject) => {
    if (!UESAVE_BIN || !fs.existsSync(UESAVE_BIN)) {
      return reject(new Error('uesave.exe not found. Build tools/uesave-src or set GVAS_UESAVE_BIN.'));
    }
    const child = spawn(UESAVE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', err => reject(new Error(`uesave spawn error: ${err.message}`)));
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`uesave exited ${code}: ${stderr || stdout}`));
      resolve(stdout);
    });
    if (inputBuffer) {
      child.stdin.write(inputBuffer);
    }
    child.stdin.end();
  });
}

async function readTempInventoryBlob(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT hex(Value) FROM BinaryData WHERE Name = 'TempInventory' LIMIT 1`
  ]);
  if (!results.length) throw new Error('TempInventory not found in BinaryData');
  return Buffer.from(results[0].trim(), 'hex');
}

async function writeTempInventoryBlob(key, blobBuffer) {
  const dbPath = getSavePaths()[0];
  const hex = blobBuffer.toString('hex');
  await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE BinaryData SET Value = X'${hex}' WHERE Name = 'TempInventory'`,
    `COMMIT`
  ]);
}

// Read the raw bytes of any named GVAS blob from BinaryData.
async function readNamedBlob(key, blobName) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT hex(Value) FROM BinaryData WHERE Name = '${blobName}' LIMIT 1`
  ]);
  if (!results.length) throw new Error(`${blobName} not found in BinaryData`);
  return Buffer.from(results[0].trim(), 'hex');
}

// Write one or more named GVAS blobs back to BinaryData in a single
// transaction, so a multi-blob edit (e.g. TempInventory + KnownItems)
// commits atomically or not at all.
async function writeNamedBlobs(key, blobsByName) {
  const dbPath = getSavePaths()[0];
  const statements = ['BEGIN IMMEDIATE'];
  for (const [name, buffer] of Object.entries(blobsByName)) {
    statements.push(`UPDATE BinaryData SET Value = X'${buffer.toString('hex')}' WHERE Name = '${name}'`);
  }
  statements.push('COMMIT');
  await runShell(dbPath, key, statements);
}

// Read + parse ANY named GVAS blob from BinaryData via uesave (e.g. PlayerLoadout).
// Returns the full uesave JSON object (root.properties...). Throws if not found.
async function readNamedBlobJson(key, blobName) {
  const blob = await readNamedBlob(key, blobName);
  return blobToJson(blob);
}

// Parse a decrypted GVAS blob buffer into the full uesave JSON object.
async function blobToJson(blobBuffer) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gvas-'));
  const inPath = path.join(tmp, 'in.blob');
  const outPath = path.join(tmp, 'out.json');
  fs.writeFileSync(inPath, blobBuffer);
  try {
    await runUesave(['to-json', '-i', inPath, '-o', outPath, '--no-warn'], null);
    return JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

// Re-serialize a uesave JSON object back into a GVAS blob buffer.
async function jsonToBlob(jsonObj) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gvas-'));
  const inPath = path.join(tmp, 'in.json');
  const outPath = path.join(tmp, 'out.blob');
  fs.writeFileSync(inPath, JSON.stringify(jsonObj));
  try {
    await runUesave(['from-json', '-i', inPath, '-o', outPath], null);
    return fs.readFileSync(outPath);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

async function requireByteIdenticalRoundTrip(blob) {
  if (!UESAVE_BIN || !fs.existsSync(UESAVE_BIN)) throw Object.assign(new Error('uesave.exe is required for inventory writes'), { status: 503 });
  const json = await blobToJson(blob);
  const roundTripped = await jsonToBlob(json);
  if (!roundTripped.equals(blob)) throw Object.assign(new Error('uesave byte-round-trip compatibility check failed; inventory writes are disabled'), { status: 503 });
  return json;
}

async function checkInventoryRoundTrip(key) {
  const blob = await readTempInventoryBlob(key);
  const json = await requireByteIdenticalRoundTrip(blob);
  const entries = extractItems(json);
  const maps = Object.keys((json && json.root && json.root.properties) || {}).filter(name => /^(Items|Weapons|Danglies|Containers|Rigs|Frames|Owning)/.test(name));
  return { compatible: true, byteIdentical: true, bytes: blob.length, inventoryEntries: entries.length, maps };
}

function validateInventoryInput(itemName, quantity, sourceMap) {
  if (typeof itemName !== 'string' || !itemName || /[\0\r\n]/.test(itemName)) throw Object.assign(new Error('itemId must be non-empty text without control characters'), { status: 400 });
  const amount = Number(quantity);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_INVENTORY_QUANTITY) throw Object.assign(new Error(`quantity must be an integer from 0 to ${MAX_INVENTORY_QUANTITY}`), { status: 400 });
  if (sourceMap != null && !Object.hasOwn(SOURCE_MAP_TO_PROP, sourceMap)) throw Object.assign(new Error('Unknown inventory sourceMap'), { status: 400 });
  return amount;
}

// Maps whose entries are individual inventory items the player owns. The
// TempInventory blob stores base weapons in Weapons_0, destroyed (broken)
// weapons in Danglies_0, and everything else (parts, ammo, consumables, drones)
// in Items_0. The app must read ALL of them or base weapons like RPK (RFL01B)
// silently disappear from the inventory. Each map entry is a StructProperty
// whose value carries a *RowHandle_0 (DataTable + RowName) and a Quantity_0.
const INVENTORY_MAPS = {
  Items_0: 'Items',
  Weapons_0: 'Base Weapons',
  Danglies_0: 'Damaged Weapons'
};

// The handle key differs per map (ItemRowHandle_0 / WeaponRowHandle_0 /
// DanglyRowHandle_0), but every entry exposes a RowName_0 and Quantity_0.
function extractEntryNameAndQty(value) {
  const qty =
    value.Quantity_0 != null ? value.Quantity_0
    : (value.Quantity != null ? value.Quantity : null);
  const handle =
    value.ItemRowHandle_0 || value.ItemRowHandle ||
    value.WeaponRowHandle_0 || value.WeaponRowHandle ||
    value.DanglyRowHandle_0 || value.DanglyRowHandle || {};
  const rowName = handle.RowName_0 || handle.RowName || null;
  return { rowName, qty };
}

// Extract every item entry across the inventory maps from a parsed uesave JSON.
// Each returned entry carries its sourceMap so the UI can label/segment it.
function extractItems(json) {
  const props = json && json.root && json.root.properties;
  if (!props) return [];
  const out = [];
  for (const [mapKey, sourceMap] of Object.entries(INVENTORY_MAPS)) {
    const map = props[mapKey] || props[mapKey.replace(/_0$/, '')];
    if (!map) continue;
    const entries = Array.isArray(map) ? map : Object.values(map);
    for (const entry of entries) {
      const value = entry.value || {};
      const { rowName, qty } = extractEntryNameAndQty(value);
      out.push({
        key: entry.key,
        name: rowName || entry.key,
        quantity: qty,
        sourceMap
      });
    }
  }
  return out;
}

// Normalize to unique names with summed quantities. The game can store the same
// RowName under multiple entries; the UI wants one row per item. When an item
// exists in more than one source map we keep the most specific label (Base
// Weapons / Damaged Weapons win over the generic Items bucket) for display,
// but this is a lossy merge -- e.g. a real 100%-progress save was found with
// WPN_RFL01_MAG_545_08 holding qty 2 in Items_0 AND qty 5 in Weapons_0
// simultaneously, which this collapses into one "qty 7, Base Weapons" row.
// updateInventoryItem() refuses to blind-write such collisions (see its
// sourceMap handling below); this just makes the collision visible in logs
// instead of silently producing a merged total that can't be safely edited
// as a single value.
function normalizeItems(entries) {
  const RANK = { 'Base Weapons': 2, 'Damaged Weapons': 1, 'Items': 0 };
  const byName = new Map();
  const sourceMapsByName = new Map();
  for (const e of entries) {
    if (e.quantity == null) continue;
    const cur = byName.get(e.name) || { name: e.name, quantity: 0, sourceMap: e.sourceMap };
    cur.quantity += e.quantity;
    if ((RANK[e.sourceMap] || 0) > (RANK[cur.sourceMap] || 0)) {
      cur.sourceMap = e.sourceMap;
    }
    byName.set(e.name, cur);
    const seen = sourceMapsByName.get(e.name) || new Set();
    seen.add(e.sourceMap);
    sourceMapsByName.set(e.name, seen);
  }
  for (const [name, seen] of sourceMapsByName) {
    if (seen.size > 1) {
      console.warn(`[gvasService] inventory ID collision: "${name}" appears in multiple maps (${[...seen].join(', ')}); displayed quantity is a merged sum and cannot be set as a single value -- use a sourceMap-specific update`);
    }
  }
  return [...byName.values()].map(i => ({
    name: i.name,
    quantity: i.quantity,
    validLayout: true,
    sourceMap: i.sourceMap
  }));
}

// READ: structured inventory via uesave, with binaryParser fallback.
async function listInventoryItems(key) {
  try {
    const blob = await readTempInventoryBlob(key);
    const json = await blobToJson(blob);
    const entries = extractItems(json);
    if (entries.length === 0) throw new Error('uesave returned no items');
    return normalizeItems(entries);
  } catch {
    // Fallback to the heuristic parser so the app still works if uesave is absent.
    // The legacy parser only sees Items_0, so base/damaged weapons are omitted.
    const blob = await readTempInventoryBlob(key);
    const hex = blob.toString('hex');
    const items = binaryParser.parseAllItems(hex);
    return items.map(item => ({
      name: item.Item,
      quantity: item.Quantity,
      validLayout: item.PropertySize === 4 && item.GuidFlag === 0,
      sourceMap: 'Items'
    }));
  }
}

// READ: the Vault (home stash) -- a separate GVAS blob (BinaryData.Name =
// 'VaultInventory') from TempInventory, so items and currency stored here
// never show up in listInventoryItems()/getCurrencies(). VaultItems_0 keys
// are gameplay tags ("Inventory.Weapon.PST06" / "Inventory.Item.X"), unlike
// TempInventory's bare RowNames ("PST06") -- stripped here so the frontend
// can resolve names through the same catalog/weapon lookups it already uses.
async function getVaultInventory(key) {
  const json = await readNamedBlobJson(key, 'VaultInventory');
  const props = (json && json.root && json.root.properties) || {};
  const items = (props.VaultItems_0 || []).map(entry => {
    const tag = entry.key && entry.key.TagName_0;
    const name = String(tag || '').replace(/^Inventory\.(Weapon|Item)\./, '');
    return { name, tag, quantity: entry.value };
  });
  const currencyEntry = props.VaultCurrency_0 || {};
  const currencyRow = currencyEntry.CurrencyRow_0 || {};
  const currency = {
    rowName: currencyRow.RowName_0 || null,
    amount: currencyEntry.CurrencyAmount_0 != null ? currencyEntry.CurrencyAmount_0 : 0
  };
  return { items, currency };
}

// READ: full structured model of every top-level map (Items, Weapons, Danglies,
// Containers, Rigs, Frames, Owning Subsystem). Useful for future structured edits.
async function readAllMaps(key) {
  const blob = await readTempInventoryBlob(key);
  const json = await blobToJson(blob);
  const props = (json && json.root && json.root.properties) || {};
  const out = {};
  for (const [mapName, value] of Object.entries(props)) out[mapName] = normalizeTopLevelProperty(value);
  return out;
}

function normalizeTopLevelProperty(value) {
  if (!Array.isArray(value)) return value;
  if (value.every(entry => entry && typeof entry === 'object' && Object.hasOwn(entry, 'key') && Object.hasOwn(entry, 'value'))) {
    return value.map(entry => ({ key: entry.key, value: entry.value }));
  }
  return value.map(entry => (entry && typeof entry === 'object' ? { ...entry } : entry));
}

function getRigCatalog() {
  return rigCatalogData.rigs.map(rig => ({
    ...rig,
    slots: { ...rig.slots },
    compatibleCharacters: [...rig.compatibleCharacters],
    highQualityContainers: [...rig.highQualityContainers]
  }));
}

function getRigDefinition(rigId) {
  if (typeof rigId !== 'string' || !rigId || /[\0\r\n]/.test(rigId)) {
    throw Object.assign(new Error('rigId must be non-empty text without control characters'), { status: 400 });
  }
  const rig = rigCatalogData.rigs.find(candidate => candidate.id === rigId);
  if (!rig) throw Object.assign(new Error('Unknown rigId'), { status: 400 });
  return rig;
}

function requireRigMaps(props) {
  if (!props || !Array.isArray(props.Rigs_0)) {
    throw Object.assign(new Error('TempInventory Rigs_0 has an unsupported shape'), { status: 422 });
  }
  if (!Array.isArray(props.Containers_0)) {
    throw Object.assign(new Error('TempInventory Containers_0 has an unsupported shape'), { status: 422 });
  }
  if (!props.Containers_0.every(entry => entry && typeof entry === 'object' && Object.hasOwn(entry, 'key') && entry.value && typeof entry.value === 'object')) {
    throw Object.assign(new Error('TempInventory Containers_0 entries have an unsupported shape'), { status: 422 });
  }
  return props;
}

function ownedRigIds(props) {
  requireRigMaps(props);
  return new Set(props.Rigs_0.map(handle => handle && (handle.RowName_0 || handle.RowName)).filter(Boolean));
}

function containerQuantities(props) {
  requireRigMaps(props);
  const quantities = new Map();
  for (const entry of props.Containers_0) {
    const id = (entry.value.DefaultContainerRow_0 || entry.value.DefaultContainerRow || {}).RowName_0 || entry.key;
    const quantity = entry.value.Quantity_0 != null ? entry.value.Quantity_0 : entry.value.Quantity;
    if (typeof id === 'string' && Number.isSafeInteger(quantity)) quantities.set(id, (quantities.get(id) || 0) + quantity);
  }
  return quantities;
}

function applyRigOwnershipToProps(props, rigId) {
  const rig = getRigDefinition(rigId);
  requireRigMaps(props);
  if (ownedRigIds(props).has(rigId)) throw Object.assign(new Error(`${rig.name} is already owned`), { status: 409 });
  props.Rigs_0.push({ DataTable_0: RIG_DATA_TABLE, RowName_0: rigId });
  return rig;
}

function applyHighQualitySetToProps(props, rigId) {
  const rig = getRigDefinition(rigId);
  requireRigMaps(props);
  const before = containerQuantities(props);
  const changes = [];
  for (const containerId of rig.highQualityContainers) {
    let entry = props.Containers_0.find(candidate => candidate.key === containerId ||
      ((candidate.value.DefaultContainerRow_0 || candidate.value.DefaultContainerRow || {}).RowName_0 === containerId));
    const previous = before.get(containerId) || 0;
    if (previous >= MAX_INVENTORY_QUANTITY) {
      throw Object.assign(new Error(`${containerId} is already at the maximum quantity`), { status: 400 });
    }
    if (!entry) {
      entry = {
        key: containerId,
        value: {
          DefaultContainerRow_0: { DataTable_0: CONTAINER_DATA_TABLE, RowName_0: containerId },
          Quantity_0: 1
        }
      };
      props.Containers_0.push(entry);
    } else if (entry.value.Quantity_0 != null) {
      entry.value.Quantity_0 += 1;
    } else if (entry.value.Quantity != null) {
      entry.value.Quantity += 1;
    } else {
      entry.value.Quantity_0 = 1;
    }
    changes.push({ containerId, before: previous, after: previous + 1 });
  }
  return { rig, changes };
}

async function listRigs(key) {
  const blob = await readTempInventoryBlob(key);
  const json = await blobToJson(blob);
  const props = json && json.root && json.root.properties;
  requireRigMaps(props);
  const owned = ownedRigIds(props);
  const quantities = containerQuantities(props);
  const rigs = getRigCatalog().map(rig => ({
    ...rig,
    owned: owned.has(rig.id),
    highQualityContainerSet: rig.highQualityContainers.map(containerId => ({
      containerId,
      quantity: quantities.get(containerId) || 0
    }))
  }));
  return {
    schemaVersion: rigCatalogData.schemaVersion,
    sources: rigCatalogData.sources,
    ownedCount: rigs.filter(rig => rig.owned).length,
    totalCount: rigs.length,
    rigs
  };
}

async function writeRigMutation(key, mutateProps, verifyProps) {
  const getHashes = () => require('./saveService').getFileHashes();
  const dbPath = getSavePaths()[0];
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getHashes();
  const blob = await readTempInventoryBlob(key);
  const json = await requireByteIdenticalRoundTrip(blob);
  const props = json && json.root && json.root.properties;
  requireRigMaps(props);
  const result = mutateProps(props);
  const newBlob = await jsonToBlob(json);
  await writeTempInventoryBlob(key, newBlob);
  const installedBlob = await readTempInventoryBlob(key);
  if (!installedBlob.equals(newBlob)) throw Object.assign(new Error('TempInventory blob installation verification failed'), { status: 422 });
  const installedJson = await blobToJson(installedBlob);
  const installedProps = installedJson && installedJson.root && installedJson.root.properties;
  requireRigMaps(installedProps);
  const targetVerification = verifyProps(installedProps, result);
  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getHashes();
  return { result, targetVerification, beforeIntegrity, afterIntegrity, beforeFk, afterFk, beforeHashes, afterHashes };
}

async function addRigOwnership(key, rigId) {
  const rig = getRigDefinition(rigId);
  const mutation = await writeRigMutation(key,
    props => applyRigOwnershipToProps(props, rigId),
    props => {
      const matches = props.Rigs_0.filter(handle => (handle.RowName_0 || handle.RowName) === rigId).length;
      if (matches !== 1) throw Object.assign(new Error(`Rig ownership verification found ${matches}; expected 1`), { status: 422 });
      return { passed: true, byteRoundTrip: true, rigId, owned: true, entries: matches };
    });
  return {
    success: mutation.afterIntegrity.passed,
    added: true,
    rigId,
    rigName: rig.name,
    changedRows: 1,
    targetVerification: mutation.targetVerification,
    beforeIntegrity: mutation.beforeIntegrity,
    afterIntegrity: mutation.afterIntegrity,
    beforeFk: mutation.beforeFk,
    afterFk: mutation.afterFk,
    beforeHashes: mutation.beforeHashes,
    afterHashes: mutation.afterHashes,
    warnings: ['Structured rig ownership writes are experimental until confirmed in-game.']
  };
}

async function addHighQualityContainerSet(key, rigId) {
  const rig = getRigDefinition(rigId);
  const mutation = await writeRigMutation(key,
    props => applyHighQualitySetToProps(props, rigId),
    (props, result) => {
      const installed = containerQuantities(props);
      for (const change of result.changes) {
        if (installed.get(change.containerId) !== change.after) {
          throw Object.assign(new Error(`Container verification failed for ${change.containerId}`), { status: 422 });
        }
      }
      return { passed: true, byteRoundTrip: true, rigId, containers: result.changes };
    });
  return {
    success: mutation.afterIntegrity.passed,
    rigId,
    rigName: rig.name,
    setSize: rig.highQualityContainers.length,
    containers: mutation.result.changes,
    changedRows: 1,
    targetVerification: mutation.targetVerification,
    beforeIntegrity: mutation.beforeIntegrity,
    afterIntegrity: mutation.afterIntegrity,
    beforeFk: mutation.beforeFk,
    afterFk: mutation.afterFk,
    beforeHashes: mutation.beforeHashes,
    afterHashes: mutation.afterHashes,
    warnings: ['Structured rig container writes are experimental until confirmed in-game.']
  };
}

// EDIT: set the quantity for every entry whose RowName (or key) matches itemName.
// Returns validation info. Experimental until confirmed in-game.
// Map a client-facing sourceMap label back to the uesave property key, and
// vice versa. Lets the add/update endpoints target the right map.
const SOURCE_MAP_TO_PROP = {
  Items: 'Items_0',
  'Base Weapons': 'Weapons_0',
  'Damaged Weapons': 'Danglies_0'
};
const PROP_TO_SOURCE_MAP = {};
for (const [label, prop] of Object.entries(SOURCE_MAP_TO_PROP)) {
  PROP_TO_SOURCE_MAP[prop] = label;
  PROP_TO_SOURCE_MAP[prop.replace(/_0$/, '')] = label;
}

// Locate every map (by uesave property key) that contains an entry whose
// RowName/key matches itemName. Returns the list of property keys to mutate.
// NOTE: iterate the real uesave property keys (Items_0 / Weapons_0 /
// Danglies_0), NOT the SOURCE_MAP_TO_PROP labels — the labels are the
// client-facing sourceMap names and do not exist as blob properties, so
// scanning them always returned nothing (caused "Item not found" when no
// sourceMap hint was supplied, e.g. the Overview resource Set button).
function findMapsForItem(props, itemName) {
  const found = [];
  for (const propKey of Object.keys(INVENTORY_MAPS)) {
    const map = props[propKey] || props[propKey.replace(/_0$/, '')];
    if (!Array.isArray(map)) continue;
    if (map.some(e => (e.key === itemName) || (extractEntryNameAndQty(e.value || {}).rowName === itemName))) {
      found.push(propKey);
    }
  }
  return found;
}

// Decide which map(s) an update should target: the caller's sourceMap hint if
// given, else auto-detect by scanning every inventory map for the matching
// RowName. A name found in more than one map with no explicit sourceMap is
// ambiguous -- updateInventoryItem writes the same target quantity into every
// entry it touches, so silently accepting all matches would multiply the real
// total instead of setting it (confirmed against a real save: an entry named
// WPN_RFL01_MAG_545_08 existed in both Items_0 (qty 2) and Weapons_0 (qty 5)
// at once; see the normalizeItems() comment). Refuse rather than guess.
function resolveUpdateTargets(props, itemName, sourceMap) {
  let targetProps;
  if (sourceMap && SOURCE_MAP_TO_PROP[sourceMap] && Array.isArray(props[SOURCE_MAP_TO_PROP[sourceMap]])) {
    targetProps = [SOURCE_MAP_TO_PROP[sourceMap]];
  } else {
    targetProps = findMapsForItem(props, itemName);
  }
  if (!targetProps.length) throw new Error(`Item ${itemName} not found in TempInventory`);
  if (!sourceMap && targetProps.length > 1) {
    const labels = targetProps.map(p => PROP_TO_SOURCE_MAP[p] || p);
    throw Object.assign(new Error(`Item ${itemName} exists in multiple inventory maps (${labels.join(', ')}); specify sourceMap to update one of them instead of writing the same quantity into all of them`), { status: 409 });
  }
  return targetProps;
}

async function updateInventoryItem(key, itemName, quantity, sourceMap) {
  const getHashes = () => require('./saveService').getFileHashes();
  const dbPath = getSavePaths()[0];
  quantity = validateInventoryInput(itemName, quantity, sourceMap);
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getHashes();

  const blob = await readTempInventoryBlob(key);
  const json = await requireByteIdenticalRoundTrip(blob);
  const props = json && json.root && json.root.properties;

  const targetProps = resolveUpdateTargets(props, itemName, sourceMap);

  // Edit the REAL json nodes in place (mutating extractItems() output is a
  // no-op because that function strips the nested value object). Match by
  // RowName (or key) so every entry for an item is updated.
  let matched = 0;
  for (const propKey of targetProps) {
    for (const entry of props[propKey]) {
      const value = entry.value || {};
      const { rowName } = extractEntryNameAndQty(value);
      if ((rowName || entry.key) !== itemName) continue;
      if (value.Quantity_0 != null) value.Quantity_0 = quantity;
      else if (value.Quantity != null) value.Quantity = quantity;
      else value.Quantity_0 = quantity;
      matched++;
    }
  }
  if (matched === 0) throw new Error(`Item ${itemName} not found in TempInventory`);

  const newBlob = await jsonToBlob(json);
  await writeTempInventoryBlob(key, newBlob);
  const installedBlob = await readTempInventoryBlob(key);
  if (!installedBlob.equals(newBlob)) throw Object.assign(new Error('TempInventory blob installation verification failed'), { status: 422 });
  const installedJson = await blobToJson(installedBlob);
  const installedProps = installedJson && installedJson.root && installedJson.root.properties;
  let verifiedEntries = 0;
  for (const propKey of targetProps) {
    for (const entry of installedProps[propKey] || []) {
      const detail = extractEntryNameAndQty(entry.value || {});
      if ((detail.rowName || entry.key) === itemName) {
        verifiedEntries++;
        if (detail.qty !== quantity) throw Object.assign(new Error('Inventory quantity verification failed'), { status: 422 });
      }
    }
  }
  if (verifiedEntries !== matched) throw Object.assign(new Error(`Inventory entry verification found ${verifiedEntries}; expected ${matched}`), { status: 422 });

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getHashes();

  return {
    success: afterIntegrity.passed,
    itemId: itemName,
    quantity,
    sourceMap: PROP_TO_SOURCE_MAP[targetProps[0]] || 'Items',
    entriesMatched: matched,
    changedRows: 1,
    targetVerification: { itemId: itemName, quantity, entries: verifiedEntries, maps: targetProps.map(key => PROP_TO_SOURCE_MAP[key]), byteRoundTrip: true, passed: true },
    beforeIntegrity,
    afterIntegrity,
    beforeFk,
    afterFk,
    beforeHashes,
    afterHashes
  };
}

// DataTable paths shared by the inventory maps (one per map, per the blob).
const ITEM_DATA_TABLE = '/Game/Blueprints/Data/ItemDetailsData.ItemDetailsData';
const WEAPON_DATA_TABLE = '/Game/Blueprints/Data/WeaponsDetailsData.WeaponsDetailsData';
const DANGLY_DATA_TABLE = '/Game/Blueprints/Data/DanglyDetailsData_DroppedWeapons.DanglyDetailsData_DroppedWeapons';

// Build a new, correctly-shaped entry for the given map. The handle key and
// DataTable differ per map (ItemRowHandle_0 vs WeaponRowHandle_0 vs
// DanglyRowHandle_0), but each carries a RowName_0 + Quantity_0.
function buildEntry(sourceMap, itemName, quantity) {
  if (sourceMap === 'Base Weapons') {
    return {
      key: itemName,
      value: {
        WeaponRowHandle_0: { DataTable_0: WEAPON_DATA_TABLE, RowName_0: itemName },
        Quantity_0: quantity
      }
    };
  }
  if (sourceMap === 'Damaged Weapons') {
    return {
      key: itemName,
      value: {
        DanglyRowHandle_0: { DataTable_0: DANGLY_DATA_TABLE, RowName_0: itemName },
        Quantity_0: quantity
      }
    };
  }
  return {
    key: itemName,
    value: {
      ItemRowHandle_0: { DataTable_0: ITEM_DATA_TABLE, RowName_0: itemName },
      Quantity_0: quantity
    }
  };
}

// ADD: append a brand-new item row to the correct map (does not touch existing
// rows). If the item already exists, this is a no-op and returns added=false so
// the caller can decide whether to fall back to a quantity update instead.
// Experimental: the game may ignore or rewrite newly-added rows on load.
async function addInventoryItem(key, itemName, quantity, sourceMap) {
  const getHashes = () => require('./saveService').getFileHashes();
  const dbPath = getSavePaths()[0];
  quantity = validateInventoryInput(itemName, quantity, sourceMap);
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getHashes();

  const blob = await readTempInventoryBlob(key);
  const json = await requireByteIdenticalRoundTrip(blob);
  const props = json && json.root && json.root.properties;
  if (!props) throw new Error('Malformed TempInventory blob (no root.properties)');

  // Resolve the target map: caller hint first, then auto-detect if the id is
  // already present somewhere, else default to Items_0.
  let propKey = (sourceMap && SOURCE_MAP_TO_PROP[sourceMap]) || null;
  if (!propKey || !Array.isArray(props[propKey])) {
    const found = findMapsForItem(props, itemName);
    if (found.length) propKey = found[0];
    else propKey = props['Items_0'] ? 'Items_0' : 'Items';
  }
  const map = props[propKey];
  // NOTE: the maps deserialize as JSON ARRAYS of {key, value} entries (uesave
  // models a UE MapProperty as key/value pairs), NOT a plain object. Append via
  // push; never assign by key.
  if (!Array.isArray(map)) throw new Error('Target map not found / unexpected shape in TempInventory');

  // Reject if the item already exists (caller should use updateInventoryItem).
  if (map.some(e => (e.key === itemName) || (extractEntryNameAndQty(e.value || {}).rowName === itemName))) {
    return {
      success: true,
      added: false,
      itemId: itemName,
      quantity,
      sourceMap: PROP_TO_SOURCE_MAP[propKey] || 'Items',
      entriesMatched: 1,
      message: 'Item already present; use quantity update instead.',
      beforeIntegrity,
      afterIntegrity: beforeIntegrity,
      beforeFk,
      afterFk: beforeFk,
      beforeHashes,
      afterHashes: beforeHashes
    };
  }

  map.push(buildEntry(PROP_TO_SOURCE_MAP[propKey] || 'Items', itemName, quantity));

  const newBlob = await jsonToBlob(json);
  await writeTempInventoryBlob(key, newBlob);
  const installedBlob = await readTempInventoryBlob(key);
  if (!installedBlob.equals(newBlob)) throw Object.assign(new Error('TempInventory blob installation verification failed'), { status: 422 });
  const installedJson = await blobToJson(installedBlob);
  const installedMap = installedJson.root.properties[propKey] || [];
  const matches = installedMap.filter(entry => (extractEntryNameAndQty(entry.value || {}).rowName || entry.key) === itemName);
  if (matches.length !== 1 || extractEntryNameAndQty(matches[0].value || {}).qty !== quantity) throw Object.assign(new Error('Added inventory item verification failed'), { status: 422 });

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getHashes();

  return {
    success: afterIntegrity.passed,
    added: true,
    itemId: itemName,
    quantity,
    sourceMap: PROP_TO_SOURCE_MAP[propKey] || 'Items',
    entriesMatched: 1,
    changedRows: 1,
    targetVerification: { itemId: itemName, quantity, entries: 1, map: PROP_TO_SOURCE_MAP[propKey] || 'Items', byteRoundTrip: true, passed: true },
    beforeIntegrity,
    afterIntegrity,
    beforeFk,
    afterFk,
    beforeHashes,
    afterHashes
  };
}

async function ensureInventoryItems(key, requested) {
  if (!Array.isArray(requested) || !requested.length) throw Object.assign(new Error('No inventory items requested'), { status: 400 });
  const unique=new Map(); for(const item of requested){validateInventoryInput(item.itemId,1,item.sourceMap);unique.set(item.itemId,{itemId:item.itemId,sourceMap:item.sourceMap||'Items'});}
  const getHashes=()=>require('./saveService').getFileHashes(),dbPath=getSavePaths()[0];
  const beforeIntegrity=await runIntegrityCheck(dbPath,key),beforeFk=await validateForeignKeys(dbPath,key),beforeHashes=await getHashes();
  const blob=await readTempInventoryBlob(key),json=await requireByteIdenticalRoundTrip(blob),props=json?.root?.properties;if(!props)throw Object.assign(new Error('Malformed TempInventory blob'),{status:422});
  const added=[],preserved=[];for(const item of unique.values()){if(findMapsForItem(props,item.itemId).length){preserved.push(item.itemId);continue;}const propKey=SOURCE_MAP_TO_PROP[item.sourceMap]||'Items_0';if(!Array.isArray(props[propKey]))throw Object.assign(new Error('Unsupported inventory map'),{status:422});props[propKey].push(buildEntry(item.sourceMap,item.itemId,1));added.push(item.itemId);}
  if(!added.length)throw Object.assign(new Error('All recommended parts are already owned'),{status:409});

  // Weapon PARTS (sourceMap 'Items', the ItemDetailsData-backed bucket) are
  // the only category ever observed as a KnownItems row in a real save --
  // base weapons (Base Weapons/Damaged Weapons sourceMap) never appear
  // there. Adding a part's ownership without also marking it "discovered"
  // is exactly the kind of gap the "verify in-game" warning below used to
  // hedge blindly against: KnownItems and ownership are ~1:1 for parts in
  // a normal playthrough, so an owned-but-unknown part is untested
  // territory for whether the game lets you select it. Register it here.
  const newlyKnownIds = added.filter(id => unique.get(id).sourceMap === 'Items');
  let knownJson = null, knownAdded = [];
  if (newlyKnownIds.length) {
    const knownBlob = await readNamedBlob(key, 'KnownItems');
    knownJson = await requireByteIdenticalRoundTrip(knownBlob);
    const knownRows = knownJson?.root?.properties?.KnownItems_0;
    if (!Array.isArray(knownRows)) throw Object.assign(new Error('Malformed KnownItems blob'), { status: 422 });
    const alreadyKnown = new Set(knownRows.map(entry => entry.RowName_0));
    for (const id of newlyKnownIds) {
      if (!alreadyKnown.has(id)) { knownRows.push({ DataTable_0: ITEM_DATA_TABLE, RowName_0: id }); knownAdded.push(id); }
    }
  }

  const newBlob=await jsonToBlob(json);
  const newKnownBlob = knownAdded.length ? await jsonToBlob(knownJson) : null;
  const blobsToWrite = { TempInventory: newBlob };
  if (newKnownBlob) blobsToWrite.KnownItems = newKnownBlob;
  await writeNamedBlobs(key, blobsToWrite);

  const installed=await readTempInventoryBlob(key);if(!installed.equals(newBlob))throw Object.assign(new Error('TempInventory blob installation verification failed'),{status:422});
  const verified=normalizeItems(extractItems(await blobToJson(installed)));for(const id of added)if(!verified.some(item=>item.name===id&&item.quantity>=1))throw Object.assign(new Error('Added part verification failed'),{status:422});

  if (newKnownBlob) {
    const installedKnown = await readNamedBlob(key, 'KnownItems');
    if (!installedKnown.equals(newKnownBlob)) throw Object.assign(new Error('KnownItems blob installation verification failed'), { status: 422 });
    const verifiedKnownRows = (await blobToJson(installedKnown))?.root?.properties?.KnownItems_0 || [];
    const verifiedKnownIds = new Set(verifiedKnownRows.map(entry => entry.RowName_0));
    for (const id of knownAdded) if (!verifiedKnownIds.has(id)) throw Object.assign(new Error(`KnownItems verification failed for ${id}`), { status: 422 });
  }

  const afterIntegrity=await runIntegrityCheck(dbPath,key),afterFk=await validateForeignKeys(dbPath,key),afterHashes=await getHashes();
  return{success:afterIntegrity.passed,experimental:true,added,preserved,knownItemsAdded:knownAdded,changedRows:1,targetVerification:{added,preserved,knownItemsAdded:knownAdded,minimumQuantity:1,byteRoundTrip:true,passed:true},beforeIntegrity,afterIntegrity,beforeFk,afterFk,beforeHashes,afterHashes,warnings:['Structured TempInventory writes remain experimental; verify the parts in-game.']};
}

module.exports = {
  UESAVE_BIN,
  listInventoryItems,
  getVaultInventory,
  readAllMaps,
  listRigs,
  addRigOwnership,
  addHighQualityContainerSet,
  updateInventoryItem,
  addInventoryItem,
  ensureInventoryItems,
  readTempInventoryBlob,
  writeTempInventoryBlob,
  readNamedBlobJson,
  requireByteIdenticalRoundTrip,
  checkInventoryRoundTrip,
  validateInventoryInput,
  normalizeTopLevelProperty,
  getRigCatalog,
  applyRigOwnershipToProps,
  applyHighQualitySetToProps,
  extractItems,
  normalizeItems,
  findMapsForItem,
  resolveUpdateTargets
};
