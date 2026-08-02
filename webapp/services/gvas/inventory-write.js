// inventory-write.js
// Structured TempInventory item mutations: quantity updates and
// canonical-catalog-gated additions. See inventory-read.js for parsing/
// normalization helpers this builds on, and codec.js for the underlying
// blob/JSON plumbing.

const { runIntegrityCheck, validateForeignKeys } = require('../../utils/validation');
const { getSavePaths } = require('./paths');
const {
  MAX_INVENTORY_QUANTITY,
  INVENTORY_MAPS,
  SOURCE_MAP_TO_PROP,
  PROP_TO_SOURCE_MAP,
  ITEM_DATA_TABLE,
  WEAPON_DATA_TABLE,
  DANGLY_DATA_TABLE
} = require('./constants');
const {
  readTempInventoryBlob,
  writeTempInventoryBlob,
  readNamedBlob,
  writeNamedBlobs,
  blobToJson,
  jsonToBlob,
  requireByteIdenticalRoundTrip
} = require('./codec');
const { extractEntryNameAndQty, extractItems, normalizeItems } = require('./inventory-read');

function validateInventoryInput(itemName, quantity, sourceMap) {
  if (typeof itemName !== 'string' || !itemName || /[\0\r\n]/.test(itemName)) throw Object.assign(new Error('itemId must be non-empty text without control characters'), { status: 400 });
  const amount = Number(quantity);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_INVENTORY_QUANTITY) throw Object.assign(new Error(`quantity must be an integer from 0 to ${MAX_INVENTORY_QUANTITY}`), { status: 400 });
  if (sourceMap != null && !Object.hasOwn(SOURCE_MAP_TO_PROP, sourceMap)) throw Object.assign(new Error('Unknown inventory sourceMap'), { status: 400 });
  return amount;
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
// at once; see the normalizeItems() comment in inventory-read.js). Refuse
// rather than guess.
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
  const getHashes = () => require('../saveService').getFileHashes();
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

// A map does not determine the DataTable. Danglies_0 ("Damaged Weapons") holds rows
// from BOTH DanglyDetailsData_DroppedWeapons (broken guns) and DanglyDetailsData (rig
// equipment, turret parts) — writing the wrong one produces a RowHandle the game cannot
// resolve. The catalog records the real table per item; the constants are the fallback
// for ids the catalog does not cover.
function dataTableFor(itemName, fallback) {
  const entry = require('../../public/catalog.json')[itemName];
  return (entry && typeof entry.dataTablePath === 'string' && entry.dataTablePath) || fallback;
}

// Build a new, correctly-shaped entry for the given map. The handle key differs per
// map (ItemRowHandle_0 vs WeaponRowHandle_0 vs DanglyRowHandle_0), but each carries a
// RowName_0 + Quantity_0.
function buildEntry(sourceMap, itemName, quantity) {
  if (sourceMap === 'Base Weapons') {
    return {
      key: itemName,
      value: {
        WeaponRowHandle_0: { DataTable_0: dataTableFor(itemName, WEAPON_DATA_TABLE), RowName_0: itemName },
        Quantity_0: quantity
      }
    };
  }
  if (sourceMap === 'Damaged Weapons') {
    return {
      key: itemName,
      value: {
        DanglyRowHandle_0: { DataTable_0: dataTableFor(itemName, DANGLY_DATA_TABLE), RowName_0: itemName },
        Quantity_0: quantity
      }
    };
  }
  return {
    key: itemName,
    value: {
      ItemRowHandle_0: { DataTable_0: dataTableFor(itemName, ITEM_DATA_TABLE), RowName_0: itemName },
      Quantity_0: quantity
    }
  };
}

// ADD: append a canonical brand-new row, or increment one exact existing row in
// its source map. Cross-map and duplicate-row ambiguity fails closed so merged
// display totals are never written into a single map. Experimental: the game
// may ignore or rewrite newly-added rows on load.
async function addInventoryItem(key, itemName, quantity, sourceMap) {
  const getHashes = () => require('../saveService').getFileHashes();
  const dbPath = getSavePaths()[0];
  quantity = validateInventoryInput(itemName, quantity, sourceMap);
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getHashes();

  const blob = await readTempInventoryBlob(key);
  const json = await requireByteIdenticalRoundTrip(blob);
  const props = json && json.root && json.root.properties;
  if (!props) throw new Error('Malformed TempInventory blob (no root.properties)');

  const foundMaps = findMapsForItem(props, itemName);
  if (foundMaps.length > 1 && !sourceMap) {
    const labels = foundMaps.map(key => PROP_TO_SOURCE_MAP[key] || key);
    throw Object.assign(new Error(`Item ${itemName} exists in multiple inventory maps (${labels.join(', ')}); specify sourceMap`), { status: 409 });
  }

  if (foundMaps.length === 0) {
    const catalog = require('../../public/catalog.json');
    const canonical = catalog[itemName];
    if (!canonical || typeof canonical.inventoryMap !== 'string') {
      throw Object.assign(new Error(`Item ${itemName} is not a canonical catalog entry approved for addition`), { status: 422 });
    }
    const canonicalMap = canonical.inventoryMap === 'Weapons' ? 'Base Weapons'
      : canonical.inventoryMap === 'DamagedWeapons' ? 'Damaged Weapons' : canonical.inventoryMap;
    if (sourceMap && sourceMap !== canonicalMap) {
      throw Object.assign(new Error(`Item ${itemName} must be added to canonical sourceMap ${canonicalMap}`), { status: 422 });
    }
    sourceMap = canonicalMap;
  }

  // Resolve the target map: caller hint first, then auto-detect if the id is
  // already present somewhere, else default to Items_0.
  let propKey = (sourceMap && SOURCE_MAP_TO_PROP[sourceMap]) || null;
  if (foundMaps.length && propKey && !foundMaps.includes(propKey)) {
    throw Object.assign(new Error(`Item ${itemName} exists in ${foundMaps.map(key => PROP_TO_SOURCE_MAP[key] || key).join(', ')}, not ${sourceMap}`), { status: 409 });
  }
  if (!propKey || !Array.isArray(props[propKey])) {
    if (foundMaps.length) propKey = foundMaps[0];
    else propKey = props['Items_0'] ? 'Items_0' : 'Items';
  }
  const map = props[propKey];
  // NOTE: the maps deserialize as JSON ARRAYS of {key, value} entries (uesave
  // models a UE MapProperty as key/value pairs), NOT a plain object. Append via
  // push; never assign by key.
  if (!Array.isArray(map)) throw new Error('Target map not found / unexpected shape in TempInventory');

  const existing = map.filter(e => (e.key === itemName) || (extractEntryNameAndQty(e.value || {}).rowName === itemName));
  if (existing.length > 1) throw Object.assign(new Error(`Item ${itemName} has ambiguous duplicate rows in ${PROP_TO_SOURCE_MAP[propKey] || propKey}`), { status: 409 });
  const added = existing.length === 0;
  let finalQuantity = quantity;
  if (added) {
    map.push(buildEntry(PROP_TO_SOURCE_MAP[propKey] || 'Items', itemName, quantity));
  } else {
    const value = existing[0].value || {};
    const current = extractEntryNameAndQty(value).qty;
    if (!Number.isSafeInteger(current)) throw Object.assign(new Error(`Item ${itemName} has an invalid existing quantity`), { status: 422 });
    finalQuantity = current + quantity;
    if (!Number.isSafeInteger(finalQuantity) || finalQuantity > MAX_INVENTORY_QUANTITY) throw Object.assign(new Error(`quantity must not exceed ${MAX_INVENTORY_QUANTITY}`), { status: 400 });
    if (Object.hasOwn(value, 'Quantity_0')) value.Quantity_0 = finalQuantity;
    else value.Quantity = finalQuantity;
  }

  const newBlob = await jsonToBlob(json);
  await writeTempInventoryBlob(key, newBlob);
  const installedBlob = await readTempInventoryBlob(key);
  if (!installedBlob.equals(newBlob)) throw Object.assign(new Error('TempInventory blob installation verification failed'), { status: 422 });
  const installedJson = await blobToJson(installedBlob);
  const installedMap = installedJson.root.properties[propKey] || [];
  const matches = installedMap.filter(entry => (extractEntryNameAndQty(entry.value || {}).rowName || entry.key) === itemName);
  if (matches.length !== 1 || extractEntryNameAndQty(matches[0].value || {}).qty !== finalQuantity) throw Object.assign(new Error('Added inventory item verification failed'), { status: 422 });

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getHashes();

  return {
    success: afterIntegrity.passed,
    added,
    itemId: itemName,
    quantity: finalQuantity,
    sourceMap: PROP_TO_SOURCE_MAP[propKey] || 'Items',
    entriesMatched: 1,
    changedRows: 1,
    targetVerification: { itemId: itemName, quantity: finalQuantity, incrementedBy: added ? 0 : quantity, entries: 1, map: PROP_TO_SOURCE_MAP[propKey] || 'Items', byteRoundTrip: true, passed: true },
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
  const getHashes=()=>require('../saveService').getFileHashes(),dbPath=getSavePaths()[0];
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
  validateInventoryInput,
  findMapsForItem,
  resolveUpdateTargets,
  updateInventoryItem,
  addInventoryItem,
  ensureInventoryItems
};
