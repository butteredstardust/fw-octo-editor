// inventory-read.js
// Read-only structured TempInventory item access: parses the blob via uesave
// (with a structural-parser fallback if uesave is unavailable), normalizes
// entries to unique named rows, and exposes the full raw top-level map model.
// See inventory-write.js for quantity updates / additions, and codec.js for
// the underlying blob/JSON plumbing this builds on.

const binaryParser = require('../binaryParser');
const { INVENTORY_MAPS } = require('./constants');
const { readTempInventoryBlob, blobToJson, requireByteIdenticalRoundTrip } = require('./codec');

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
// sourceMap handling in inventory-write.js); this just makes the collision
// visible in logs instead of silently producing a merged total that can't be
// safely edited as a single value.
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
      // eslint-disable-next-line no-console -- surfaces a real data anomaly to whoever is running the server; no logger in this app
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
    // Fallback so the app still works if uesave is absent: a structural
    // parser (not a heuristic) covering all three maps -- see
    // binaryParser.js's header comment for how it's verified.
    const blob = await readTempInventoryBlob(key);
    const { items, errors } = binaryParser.parseInventoryBlob(blob);
    if (errors.length) {
      // eslint-disable-next-line no-console -- surfaces a real data anomaly to whoever is running the server; no logger in this app
      console.warn(`[gvasService] fallback inventory parser: ${errors.length} entr${errors.length === 1 ? 'y' : 'ies'} failed structural validation and were omitted`, errors.slice(0, 5));
    }
    return normalizeItems(items);
  }
}

async function checkInventoryRoundTrip(key) {
  const blob = await readTempInventoryBlob(key);
  const json = await requireByteIdenticalRoundTrip(blob);
  const entries = extractItems(json);
  const maps = Object.keys((json && json.root && json.root.properties) || {}).filter(name => /^(Items|Weapons|Danglies|Containers|Rigs|Frames|Owning)/.test(name));
  return { compatible: true, byteIdentical: true, bytes: blob.length, inventoryEntries: entries.length, maps };
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

module.exports = {
  extractEntryNameAndQty,
  extractItems,
  normalizeItems,
  listInventoryItems,
  checkInventoryRoundTrip,
  readAllMaps,
  normalizeTopLevelProperty
};
