'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInventoryBlob } = require('../services/binaryParser');

// Builds a synthetic buffer matching the verified GVAS scalar-property shape
// (see binaryParser.js's header comment): FString(name) + FString(type) +
// int32(arrayIndex=0) + int32(size) + u8(hasGuid=0) + value.
function fstring(text) {
  if (text === '') return Buffer.from([0, 0, 0, 0]);
  const bytes = Buffer.from(text + '\0', 'latin1');
  const len = Buffer.alloc(4);
  len.writeInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

function nameField(rowName) {
  const value = fstring(rowName);
  return Buffer.concat([
    fstring('RowName'), fstring('NameProperty'),
    Buffer.from([0, 0, 0, 0]), // ArrayIndex
    (() => { const b = Buffer.alloc(4); b.writeInt32LE(value.length, 0); return b; })(), // Size
    Buffer.from([0]), // HasPropertyGuid
    value
  ]);
}

function quantityField(qty) {
  const value = Buffer.alloc(4);
  value.writeInt32LE(qty, 0);
  return Buffer.concat([
    fstring('Quantity'), fstring('IntProperty'),
    Buffer.from([0, 0, 0, 0]), // ArrayIndex
    Buffer.from([4, 0, 0, 0]), // Size (always 4 for IntProperty)
    Buffer.from([0]), // HasPropertyGuid
    value
  ]);
}

// A single entry: <handleField marker><some filler bytes><RowName field><Quantity field>.
// The filler stands in for the DataTableRowHandle/DataTable/ObjectProperty
// sub-structure this parser deliberately never parses -- only the RowName/
// Quantity anchors matter.
function entry(handleField, rowName, qty, fillerSize = 40) {
  return Buffer.concat([
    fstring(handleField),
    Buffer.alloc(fillerSize, 0x99), // arbitrary filler, never interpreted
    nameField(rowName),
    Buffer.alloc(5, 0x99),
    quantityField(qty)
  ]);
}

test('parseInventoryBlob extracts entries across all three maps with correct sourceMap labels', () => {
  const buf = Buffer.concat([
    entry('ItemRowHandle', 'FirstAid', 59),
    entry('WeaponRowHandle', 'PST06', 1),
    entry('DanglyRowHandle', 'RFL01_Broken', 2)
  ]);
  const { items, errors } = parseInventoryBlob(buf);
  assert.equal(errors.length, 0);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(i => [i.name, i.quantity, i.sourceMap, i.validLayout]).sort(), [
    ['FirstAid', 59, 'Items', true],
    ['PST06', 1, 'Base Weapons', true],
    ['RFL01_Broken', 2, 'Damaged Weapons', true]
  ].sort());
});

test('parseInventoryBlob handles a dotted RowName (e.g. Item.Ammo.545) the old regex-based parser could not match', () => {
  const buf = entry('ItemRowHandle', 'Item.Ammo.545.Junk', 2540);
  const { items, errors } = parseInventoryBlob(buf);
  assert.equal(errors.length, 0);
  assert.deepEqual(items, [{ name: 'Item.Ammo.545.Junk', quantity: 2540, sourceMap: 'Items', validLayout: true }]);
});

test('parseInventoryBlob multiple entries in the same map are each extracted independently', () => {
  const buf = Buffer.concat([
    entry('ItemRowHandle', 'Bandage', 10),
    entry('ItemRowHandle', 'Water', 91)
  ]);
  const { items, errors } = parseInventoryBlob(buf);
  assert.equal(errors.length, 0);
  assert.deepEqual(items.map(i => [i.name, i.quantity]), [['Bandage', 10], ['Water', 91]]);
});

test('parseInventoryBlob reports a structural failure instead of guessing when RowName is missing', () => {
  // A handle marker with no RowName field anywhere nearby.
  const buf = Buffer.concat([fstring('ItemRowHandle'), Buffer.alloc(700, 0x99)]);
  const { items, errors } = parseInventoryBlob(buf);
  assert.equal(items.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].error, /RowName field not found/);
});

test('parseInventoryBlob reports a structural failure on an IntProperty size mismatch rather than misreading the value', () => {
  const good = nameField('Broken');
  const badQuantity = Buffer.concat([
    fstring('Quantity'), fstring('IntProperty'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from([8, 0, 0, 0]), // wrong declared size (should be 4)
    Buffer.from([0]),
    Buffer.alloc(8)
  ]);
  const buf = Buffer.concat([fstring('ItemRowHandle'), Buffer.alloc(10, 0x99), good, Buffer.alloc(5, 0x99), badQuantity]);
  const { items, errors } = parseInventoryBlob(buf);
  assert.equal(items.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].error, /IntProperty size mismatch/);
});
