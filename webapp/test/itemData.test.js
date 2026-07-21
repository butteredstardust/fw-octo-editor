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
