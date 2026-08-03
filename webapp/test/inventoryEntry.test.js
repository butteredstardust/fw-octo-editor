// The RowHandle a new inventory row carries is what the game resolves the item through.
// itemData.test.js proves the *catalog* records the right DataTable per item; this proves
// buildEntry actually writes that table into the blob entry. Both halves are needed: a
// correct catalog written into the wrong field is still an unresolvable row.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEntry } = require('../services/gvas/inventory-write');
const { ITEM_DATA_TABLE, WEAPON_DATA_TABLE, DANGLY_DATA_TABLE } = require('../services/gvas/constants');
const catalog = require('../public/catalog.json');

const DANGLY_DROPPED = '/Game/Blueprints/Data/DanglyDetailsData_DroppedWeapons.DanglyDetailsData_DroppedWeapons';
const DANGLY_EQUIPMENT = '/Game/Blueprints/Data/DanglyDetailsData.DanglyDetailsData';

test('each map gets its own RowHandle key carrying RowName and Quantity', () => {
  const item = buildEntry('Items', 'Item.Ammo.45ACP', 7);
  assert.equal(item.key, 'Item.Ammo.45ACP');
  assert.equal(item.value.ItemRowHandle_0.RowName_0, 'Item.Ammo.45ACP');
  assert.equal(item.value.Quantity_0, 7);

  const weapon = buildEntry('Base Weapons', 'PST10', 1);
  assert.equal(weapon.value.WeaponRowHandle_0.RowName_0, 'PST10');
  assert.equal(weapon.value.ItemRowHandle_0, undefined);

  const dangly = buildEntry('Damaged Weapons', 'LMG01_Broken', 1);
  assert.equal(dangly.value.DanglyRowHandle_0.RowName_0, 'LMG01_Broken');
  assert.equal(dangly.value.WeaponRowHandle_0, undefined);
});

// The regression this whole change exists to prevent: rig equipment and broken weapons
// both live in Danglies_0, so picking the DataTable from the map alone writes a handle
// the game cannot resolve for one of the two.
test('Danglies entries take their DataTable from the catalog, not from the map', () => {
  const broken = buildEntry('Damaged Weapons', 'LMG01_Broken', 1);
  const rig = buildEntry('Damaged Weapons', 'RIG_EQUIPMENT_ExoLegs', 1);
  assert.equal(broken.value.DanglyRowHandle_0.DataTable_0, DANGLY_DROPPED);
  assert.equal(rig.value.DanglyRowHandle_0.DataTable_0, DANGLY_EQUIPMENT);
  assert.notEqual(broken.value.DanglyRowHandle_0.DataTable_0, rig.value.DanglyRowHandle_0.DataTable_0);
});

test('Items and Base Weapons entries also carry their catalog DataTable', () => {
  const ammo = buildEntry('Items', 'Item.Ammo.45ACP', 1);
  assert.equal(ammo.value.ItemRowHandle_0.DataTable_0, catalog['Item.Ammo.45ACP'].dataTablePath);
  const weapon = buildEntry('Base Weapons', 'PST10', 1);
  assert.equal(weapon.value.WeaponRowHandle_0.DataTable_0, catalog.PST10.dataTablePath);
});

// Only ids the catalog does not cover may fall back to the per-map constant.
test('unknown ids fall back to the map default DataTable', () => {
  assert.equal(catalog.__not_a_real_item__, undefined);
  assert.equal(buildEntry('Items', '__not_a_real_item__', 1).value.ItemRowHandle_0.DataTable_0, ITEM_DATA_TABLE);
  assert.equal(buildEntry('Base Weapons', '__not_a_real_item__', 1).value.WeaponRowHandle_0.DataTable_0, WEAPON_DATA_TABLE);
  assert.equal(buildEntry('Damaged Weapons', '__not_a_real_item__', 1).value.DanglyRowHandle_0.DataTable_0, DANGLY_DATA_TABLE);
});

// An unrecognized sourceMap must not silently produce a Weapons/Danglies handle.
test('unrecognized source maps build a plain Items entry', () => {
  const entry = buildEntry('Nonsense', 'Item.Ammo.45ACP', 3);
  assert.ok(entry.value.ItemRowHandle_0);
  assert.equal(entry.value.DanglyRowHandle_0, undefined);
});
