const STRUCTURAL_NAMES = new Set([
  'ItemDetailsData','Item','Ammo','Junk','JunkFood','FirstAid','Tools',
  'None','StructProperty','IntProperty','FloatProperty','NameProperty',
  'BoolProperty','ArrayProperty','MapProperty','ByteProperty','EnumProperty',
  'StrProperty','TextProperty','SetProperty','ObjectProperty',
  'ItemRowHandle','DataTableRowHandle','Quantity','RowName','SavedItem',
  'DataTable','Map','Array','SoftObject','Vector','Rotator','Transform',
  'Guid','Color','Plane','LinearColor','Box','Sphere','Capsule',
  'AttachmentCategory','CustomizationType','Slot','Tag','Name',
  'Description','Icon','Mesh','StaticMesh','SkeletalMesh','Material',
  'Texture','Sound','Particle','Blueprint','Class','Object',
  'Property','Guid','Version','Schema','Group','Query','Counter',
  'Window','Scope','Character','Player','Pawn','Weapon','Magazine',
  'Optic','Scope','Grip','Light','Laser','Muzzle','Barrel','Stock',
  'Handguard','Receiver','Charging','Gas','Trigger','PistolGrip',
  'Magazine','Ammo','Ammunition','Caliber','Round','Bullet',
  'Medical','Food','Drink','Tool','Part','Component','Material',
  'Scrap','Loot','Rare','Common','Uncommon','Legendary','Epic',
  'Backpack','Vault','Stash','Container','Inventory','Loadout',
  'Customization','Rig','Loadout','QuickSlot','Hotbar',
  'Drone_Debris','Drone_FastTravel','Debris','Loot_Eurasia','Loot_Europa',
  'WeaponsDetailsData','fixedweapons','WeaponParts','WeaponPart',
  'Accessories','Accessory','Attachment','Attachments','Modification',
  'Mod','Upgrade','Upgrades','Perk','Perks','Skill','Skills',
  'Quest','Quests','Objective','Objectives','Mission','Missions',
  'PDA','Map','Coordinates','Location','Waypoint','Marker',
  'Vehicle','Car','Truck','Bike','Boat','Helicopter','Drone',
  'Turret','Trap','Mine','Explosive','Grenade','Smoke','Flash',
  'Armor','Helmet','Vest','Pants','Boots','Gloves','Mask','GasMask',
  'Backpack','Vest','ChestRig','Holster','Belt','Pouch',
  'Consumable','Consumables','Food','Drink','Water','Medical',
  'Bandage','Tourniquet','Meds','Pills','Injection','Surgery',
  'Crafting','Recipe','Blueprint','Ingredient','Ingredients',
  'Resource','Resources','Scrap','Parts','Components','Materials',
  'Fuel','Battery','Batteries','Electronics','Wires','Cables',
  'Metal','Steel','Aluminum','Copper','Titanium','Carbon',
  'Plastic','Rubber','Glass','Ceramic','Wood','Leather','Cloth',
  'Chemicals','Medicine','Drugs','Stim','Adrenaline','Morphine',
  'Alcohol','Beer','Vodka','Whiskey','Wine','Moonshine',
  'Tobacco','Cigarettes','Cigars','Matches','Lighter',
  'Money','Cash','Credits','Currency','Tokens','Barter',
  'Key','Keys','Card','Cards','Lock','Lockpick','Crowbar',
  'Flashlight','Lantern','Torch','Light','Glowstick',
  'Radio','Walkie','Headset','Earpiece','Binoculars','Scope',
  'NVG','NightVision','Thermal','RangeFinder','GPS','Compass',
  'Watch','Clock','Timer','Stopwatch','Alarm',
  'Camera','Photo','Film','Memory','USB','Drive','Disk',
  'Book','Note','Letter','Document','Map','Blueprint','Plan',
  'Art','Painting','Sculpture','Statue','Figurine','Toy',
  'Music','Instrument','Guitar','Piano','Drum','Trumpet',
  'Game','Console','Handheld','Arcade','Pinball',
  'Sport','Ball','Bat','Glove','Net','Goal','Bike',
  'Tool','Hammer','Screwdriver','Wrench','Pliers','Drill','Saw',
  'Axe','Knife','Sword','Machete','Club','Bat','Pipe',
  'Rope','Chain','Lock','Tape','Glue','Duct','Wire',
  'Bag','Sack','Box','Case','Container','Crate','Barrel',
  'Can','Bottle','Jar','Tube','Pack',
  'Drone','Drone_FastTravel','Drone_Debris','Loot_Eurasia','Loot_Europa',
  'BotLeft','BotRight','Left_Dangly','Right_Dangly','TopLeft','TopRight',
  'Medium','Large','Small','Tiny','Huge','Giant','Massive',
  'Dangly','Belt','Shoulder','Chest','Back','Head','Face',
  'RIG','Rig','Equipped','Equip','EquipSlot','Slot',
  'ENuggets','x28','ACP','PICOPT','PICSCP','PICFGR','PICLAM','PICFLL',
  'ATTMD','WPN_','RFL','SMG','PST','RFL','LMG','SNP','SHG',
  'IFF_Eurasia','IFF_Europa','IFF_Euruska',
  'Bar_','Food','Drink','Med','Tool','Part','Mat','Loot','RareLoot',
  'Quest_','Signal','Scrambler','JunkFood','Plans','Tobacco'
]);

function parseAllItems(hex) {
  const bytes = Buffer.from(hex, 'hex');
  const ascii = bytes.toString('ascii');
  const candidates = {};

  function recordItem(name, qOffset) {
    if (qOffset + 4 > bytes.length) return;
    const intType = ascii.indexOf('IntProperty\x00', qOffset - 60 < 0 ? 0 : qOffset - 60);
    if (intType < 0) return;
    const sizeOffset = intType + 'IntProperty\x00'.length + 4;
    const propSize = bytes.readInt32LE(sizeOffset);
    const guidFlag = bytes[intType + 'IntProperty\x00'.length + 8];
    const quantity = bytes.readUInt32LE(qOffset);
    if (!candidates[qOffset]) {
      candidates[qOffset] = { Item: name, Quantity: quantity, QuantityOffset: qOffset, PropertySize: propSize, GuidFlag: guidFlag };
    } else if (name.length > candidates[qOffset].Item.length) {
      candidates[qOffset].Item = name;
      candidates[qOffset].Quantity = quantity;
    }
  }

  const regex = /[A-Za-z_][A-Za-z0-9_]{2,}/g;
  let match;
  while ((match = regex.exec(ascii)) !== null) {
    const name = match[0];
    if (STRUCTURAL_NAMES.has(name)) continue;
    if (/^[A-Z0-9_]{1,2}$/.test(name)) continue;

    // Forward search: the Quantity IntProperty sits just after the item name
    // (the common layout for weapons, grenades, parts, loot, etc.).
    const qAfter = ascii.indexOf('Quantity\x00', match.index);
    if (qAfter >= 0 && (qAfter - match.index) <= 80) {
      const intType = ascii.indexOf('IntProperty\x00', qAfter);
      if (intType >= 0 && (intType - qAfter) <= 40) {
        const qOffset = intType + 'IntProperty\x00'.length + 9;
        recordItem(name, qOffset);
      }
    }
  }

  // Backward search: ammo entries (Item.Ammo.*) carry their Quantity IntProperty
  // ~50 bytes BEFORE the dotted item key, and the key itself is not captured by
  // the base regex (it contains dots). Scan for the dotted keys explicitly and
  // pair each with the nearest preceding Quantity.
  const ammoRegex = /Item\.Ammo\.[A-Za-z0-9_]+/g;
  let am;
  while ((am = ammoRegex.exec(ascii)) !== null) {
    const qBefore = ascii.lastIndexOf('Quantity\x00', am.index - 1);
    if (qBefore >= 0 && (am.index - qBefore) <= 80) {
      const intType = ascii.indexOf('IntProperty\x00', qBefore);
      if (intType >= 0 && (intType - qBefore) <= 40) {
        const qOffset = intType + 'IntProperty\x00'.length + 9;
        recordItem(am[0], qOffset);
      }
    }
  }

  return Object.values(candidates);
}

const { runShell } = require('../utils/validation');
const config = require('./configService');

const SAVE_PREFIX = '0002524f464349c086ad775367f0b95a';

// Resolve the save path from the (optional) user override directory, falling
// back to the built-in default live save directory.
function getSavePath() {
  const dir = config.getSaveDir();
  const sep = dir.endsWith('\\') || dir.endsWith('/') ? '' : require('path').sep;
  return `${dir}${sep}${SAVE_PREFIX}.dat`;
}

async function readTempInventoryBlob(key) {
  const dbPath = getSavePath();
  const results = await runShell(dbPath, key, [
    `SELECT hex(Value) FROM BinaryData WHERE Name = 'TempInventory' LIMIT 1`
  ]);
  if (!results.length) throw new Error('TempInventory not found in BinaryData');
  const hex = results[0].trim();
  return { hex };
}

async function writeTempInventoryBlob(key, hex) {
  const dbPath = getSavePath();
  await runShell(dbPath, key, [
    `BEGIN IMMEDIATE`,
    `UPDATE BinaryData SET Value = X'${hex}' WHERE Name = 'TempInventory'`,
    `COMMIT`
  ]);
}

async function listInventoryItems(key) {
  const { hex } = await readTempInventoryBlob(key);
  const items = parseAllItems(hex);
  return items.map(item => ({
    name: item.Item,
    quantity: item.Quantity,
    validLayout: item.PropertySize === 4 && item.GuidFlag === 0
  }));
}

module.exports = {
  readTempInventoryBlob,
  writeTempInventoryBlob,
  listInventoryItems,
  parseAllItems
};

