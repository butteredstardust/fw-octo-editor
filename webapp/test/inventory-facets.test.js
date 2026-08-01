const test = require('node:test');
const assert = require('node:assert/strict');

let buildFacetIndex, createSectionExpansionState, setSelectOptions;

test.before(async () => {
  ({ buildFacetIndex, createSectionExpansionState, setSelectOptions } = await import('../public/modules/features/inventory/facets.mjs'));
});

test('facet indexes dedupe and sort known categories, unknowns, and subcategories', () => {
  const rows = [
    { cat: 'Other', sub: '' },
    { cat: 'Weapons', sub: 'Rifle' },
    { cat: 'Ammo', sub: 'Grenades' },
    { cat: 'Weapons', sub: 'Pistol' },
    { cat: 'Zeta', sub: 'Tools' },
    { cat: 'Ammo', sub: 'Grenades' }
  ];
  const facets = buildFacetIndex(rows, {
    categoryOf: row => row.cat,
    subcategoryOf: row => row.sub,
    categoryOrder: ['Weapons', 'Ammo', 'Other']
  });
  assert.deepEqual(facets.categories, ['Weapons', 'Ammo', 'Other', 'Zeta']);
  assert.deepEqual(facets.subcategories.Weapons, ['Pistol', 'Rifle']);
  assert.deepEqual(facets.subcategories.Ammo, ['Grenades']);
  assert.deepEqual(facets.subcategories.Other, ['—']);
});

test('select option rendering escapes values and rejects stale selections', () => {
  const select = { innerHTML: '', value: '' };
  assert.equal(setSelectOptions(select, ['Safe', '<img>'], { selected: 'Safe' }), 'Safe');
  assert.equal(select.value, 'Safe');
  assert.match(select.innerHTML, /&lt;img&gt;/);
  assert.equal(setSelectOptions(select, ['Next'], { selected: 'stale' }), '');
  assert.equal(select.value, '');
});

test('section expansion state is independent, initializes once, and resets explicitly', () => {
  const first = createSectionExpansionState();
  const second = createSectionExpansionState();
  first.initialize(['A', 'B']);
  second.initialize(['A', 'B'], { expandAll: true });
  assert.equal(first.isOpen('A'), true);
  assert.equal(first.isOpen('B'), false);
  assert.equal(second.isOpen('B'), true);

  first.toggle('B');
  first.initialize(['A']);
  first.initialize(['A', 'B']);
  assert.equal(first.isOpen('B'), true);
  first.setAll(['A'], false);
  assert.equal(first.isOpen('A'), false);
  assert.equal(first.isOpen('B'), false);
  first.reset();
  first.initialize(['B'], { expandAll: true });
  assert.equal(first.isOpen('B'), true);
});
