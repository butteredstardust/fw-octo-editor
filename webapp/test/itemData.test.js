const test = require('node:test');
const assert = require('node:assert/strict');
const canonical = require('../data/items.canonical.json');
const catalog = require('../public/catalog.json');
const audit = require('../data/item-map-audit.json');
test('canonical item map has unique exact save IDs and structured metadata', () => {
  assert.equal(canonical.schemaVersion, 1); const entries = Object.entries(canonical.items); assert.ok(entries.length > 300);
  for (const [id, item] of entries) { assert.equal(item.id, id); assert.doesNotMatch(id, /<br>/i); assert.ok(['Items', 'Weapons', 'DamagedWeapons'].includes(item.inventoryMap)); assert.ok(Array.isArray(item.taxonomy.tags)); assert.equal(typeof item.match.confidence, 'number'); assert.ok(Array.isArray(item.sources) && item.sources.length > 0); }
});
test('frontend catalog is a complete compatible projection of canonical data', () => {
  assert.deepEqual(Object.keys(catalog).sort(), Object.keys(canonical.items).sort());
  for (const [id, item] of Object.entries(canonical.items)) { assert.equal(catalog[id].wiki, item.displayName); assert.equal(catalog[id].top, item.taxonomy.group); assert.equal(catalog[id].inventoryMap, item.inventoryMap); assert.deepEqual(catalog[id].taxonomyTags, item.taxonomy.tags); }
});
test('audit exposes unresolved and excluded wiki records', () => { assert.equal(audit.schemaVersion, 1); assert.equal(audit.counts.canonical, Object.keys(canonical.items).length); assert.ok(Array.isArray(audit.unresolvedIds)); assert.ok(audit.excludedWikiRows.some(row => row.reason === 'composite-wiki-cell')); });
test('reviewed Sentient Drill mapping preserves its wiki portrait filename', () => { const item = canonical.items.RareLoot_47_SentientDrill; assert.equal(item.displayName, 'Sentient Drill'); assert.equal(item.wiki.imageFile, 'T_Portrait_JunkEcon_85_SentientDrill.png'); assert.equal(item.match.reviewed, true); assert.equal(item.match.confidence, 1); });
test('G-L 19 is an authoritative addable base weapon', () => {
  const item = canonical.items.PST10;
  assert.ok(item);
  assert.equal(item.displayName, 'G-L 19');
  assert.equal(item.inventoryMap, 'Weapons');
  assert.equal(item.internalTag, 'Inventory.Weapon.PST10');
  assert.equal(item.match.confidence, 1);
});
// The GVAS "Damaged Weapons" map (Danglies_0) holds rows from two different
// DataTables, so inventoryMap alone cannot build a resolvable RowHandle.
test('every canonical item carries the DataTable its RowHandle must reference', () => {
  const known = new Set([
    '/Game/Blueprints/Data/ItemDetailsData.ItemDetailsData',
    '/Game/Blueprints/Data/WeaponsDetailsData.WeaponsDetailsData',
    '/Game/Blueprints/Data/DanglyDetailsData_DroppedWeapons.DanglyDetailsData_DroppedWeapons',
    '/Game/Blueprints/Data/DanglyDetailsData.DanglyDetailsData'
  ]);
  for (const [id, item] of Object.entries(canonical.items)) {
    assert.ok(known.has(item.dataTablePath), `${id} has unknown dataTablePath ${item.dataTablePath}`);
    assert.equal(catalog[id].dataTablePath, item.dataTablePath);
  }
});
test('rig equipment and broken weapons share a map but not a DataTable', () => {
  const rig = canonical.items.RIG_EQUIPMENT_ExoLegs;
  const broken = canonical.items.LMG01_Broken;
  assert.equal(rig.inventoryMap, 'DamagedWeapons');
  assert.equal(broken.inventoryMap, 'DamagedWeapons');
  assert.equal(rig.dataTablePath, '/Game/Blueprints/Data/DanglyDetailsData.DanglyDetailsData');
  assert.equal(broken.dataTablePath, '/Game/Blueprints/Data/DanglyDetailsData_DroppedWeapons.DanglyDetailsData_DroppedWeapons');
  assert.notEqual(rig.dataTablePath, broken.dataTablePath);
});
test('game DataTable additions are attributed and free of unfinished rows', () => {
  const added = audit.addedFromGameDataTableIds;
  assert.ok(Array.isArray(added) && added.length > 0);
  for (const id of added) {
    const item = canonical.items[id];
    assert.ok(item, `${id} was reported added but is absent from the catalog`);
    assert.ok(item.sources.some(source => source.startsWith('game-datatables-')));
    assert.doesNotMatch(item.displayName || '', /placeholder/i);
  }
});
