const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInventoryInput } = require('../services/gvasService');

test('inventory quantities require safe non-negative integers', () => {
  assert.equal(validateInventoryInput('Item.Test', '42', 'Items'), 42);
  for (const value of [-1, 1.5, '12junk', NaN, Infinity, 2147483648]) {
    assert.throws(() => validateInventoryInput('Item.Test', value, 'Items'));
  }
});

test('inventory identifiers and source maps fail closed', () => {
  assert.throws(() => validateInventoryInput('', 1, 'Items'));
  assert.throws(() => validateInventoryInput('bad\nitem', 1, 'Items'));
  assert.throws(() => validateInventoryInput('Item.Test', 1, 'Unknown'));
});
