// Shared across inventory-read.js, inventory-write.js, and rigs.js.

// Shared across inventory-write.js (validateInventoryInput / addInventoryItem)
// and rigs.js (applyHighQualitySetToProps quantity overflow guard).
const MAX_INVENTORY_QUANTITY = 2147483647;

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

// DataTable paths shared by the inventory maps (one per map, per the blob).
const ITEM_DATA_TABLE = '/Game/Blueprints/Data/ItemDetailsData.ItemDetailsData';
const WEAPON_DATA_TABLE = '/Game/Blueprints/Data/WeaponsDetailsData.WeaponsDetailsData';
const DANGLY_DATA_TABLE = '/Game/Blueprints/Data/DanglyDetailsData_DroppedWeapons.DanglyDetailsData_DroppedWeapons';

module.exports = {
  MAX_INVENTORY_QUANTITY,
  INVENTORY_MAPS,
  SOURCE_MAP_TO_PROP,
  PROP_TO_SOURCE_MAP,
  ITEM_DATA_TABLE,
  WEAPON_DATA_TABLE,
  DANGLY_DATA_TABLE
};
