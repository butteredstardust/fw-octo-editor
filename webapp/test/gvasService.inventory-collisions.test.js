const test = require('node:test');
const assert = require('node:assert/strict');
const { extractItems, normalizeItems, findMapsForItem, resolveUpdateTargets } = require('../services/gvasService');

// Mirrors a real collision found in a live 100%-progress save: the same
// RowName held separate entries in Items_0 (qty 2) and Weapons_0 (qty 5)
// at once. Danglies_0 stays empty here to also exercise the "only one map"
// (non-ambiguous) path via a second, uncontested item.
function propsFixture() {
  return {
    Items_0: [
      { key: 'WPN_RFL01_MAG_545_08', value: { ItemRowHandle_0: { RowName_0: 'WPN_RFL01_MAG_545_08' }, Quantity_0: 2 } },
      { key: 'Bandage', value: { ItemRowHandle_0: { RowName_0: 'Bandage' }, Quantity_0: 10 } }
    ],
    Weapons_0: [
      { key: 'WPN_RFL01_MAG_545_08', value: { WeaponRowHandle_0: { RowName_0: 'WPN_RFL01_MAG_545_08' }, Quantity_0: 5 } }
    ],
    Danglies_0: []
  };
}

test('extractItems reads every map and labels each entry with its source', () => {
  const entries = extractItems({ root: { properties: propsFixture() } });
  assert.equal(entries.length, 3);
  const bandage = entries.find(e => e.name === 'Bandage');
  assert.deepEqual(bandage, { key: 'Bandage', name: 'Bandage', quantity: 10, sourceMap: 'Items' });
  const collisionEntries = entries.filter(e => e.name === 'WPN_RFL01_MAG_545_08');
  assert.equal(collisionEntries.length, 2);
  assert.deepEqual(new Set(collisionEntries.map(e => e.sourceMap)), new Set(['Items', 'Base Weapons']));
});

test('normalizeItems merges a cross-map collision into one summed, ranked row and logs it', () => {
  const entries = extractItems({ root: { properties: propsFixture() } });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  let rows;
  try {
    rows = normalizeItems(entries);
  } finally {
    console.warn = originalWarn;
  }
  const collision = rows.find(r => r.name === 'WPN_RFL01_MAG_545_08');
  assert.equal(collision.quantity, 7); // 2 + 5 -- the lossy merge this test documents
  assert.equal(collision.sourceMap, 'Base Weapons'); // higher-ranked label wins for display
  assert.equal(rows.find(r => r.name === 'Bandage').quantity, 10);
  assert.ok(warnings.some(w => w.includes('WPN_RFL01_MAG_545_08') && w.includes('collision')));
  assert.ok(!warnings.some(w => w.includes('Bandage')));
});

test('findMapsForItem reports every map an item appears in', () => {
  const props = propsFixture();
  assert.deepEqual(findMapsForItem(props, 'WPN_RFL01_MAG_545_08').sort(), ['Items_0', 'Weapons_0']);
  assert.deepEqual(findMapsForItem(props, 'Bandage'), ['Items_0']);
  assert.deepEqual(findMapsForItem(props, 'Nonexistent'), []);
});

test('resolveUpdateTargets refuses to guess across an ambiguous multi-map collision', () => {
  const props = propsFixture();
  assert.throws(
    () => resolveUpdateTargets(props, 'WPN_RFL01_MAG_545_08', undefined),
    err => err.status === 409 && /multiple inventory maps/.test(err.message)
  );
});

test('resolveUpdateTargets honors an explicit sourceMap even when the item is ambiguous', () => {
  const props = propsFixture();
  assert.deepEqual(resolveUpdateTargets(props, 'WPN_RFL01_MAG_545_08', 'Base Weapons'), ['Weapons_0']);
  assert.deepEqual(resolveUpdateTargets(props, 'WPN_RFL01_MAG_545_08', 'Items'), ['Items_0']);
});

test('resolveUpdateTargets needs no sourceMap when there is only one match', () => {
  const props = propsFixture();
  assert.deepEqual(resolveUpdateTargets(props, 'Bandage', undefined), ['Items_0']);
});

test('resolveUpdateTargets fails closed for an item that is not present anywhere', () => {
  const props = propsFixture();
  assert.throws(() => resolveUpdateTargets(props, 'Nonexistent', undefined), /not found/);
});
