import { RECIPE_DATA } from './recipe-data.mjs';

// Friendly metadata for playable characters, sourced from the wiki
// (https://theforeverwinter.wiki.gg/wiki/Characters). Keyed by the save's
// CharacterGameplayTag. Stats are baseline values at prestige 0 / level 1.
export const CHARACTER_META = {
  'Pawn.Player.Gunhead': {
    name: 'Gunhead', icon: '🤖', role: 'Heavy weapons platform',
    blurb: 'A cyborg chassis, not a normal scav. Highest health in the game and learns every weapon class to v5, but cannot perform melee executions and has no sprint speed skill.',
    health: 1500, walk: 2.85, sprint: 3.54,
    skills: ['PST Expert v5', 'RFL Expert v5', 'SMG Expert v5', 'SHG Expert v5', 'GRL Expert v5', 'HRF Expert v5', 'LMG Expert v5', 'HMG Expert v5', 'Weapon Variants (AK, RPD, AA12)']
  },
  'Pawn.Player.Shaman': {
    name: 'Shaman', icon: '🥁', role: 'CQC / shotgunner',
    blurb: 'Fast and agile. Excels with shotguns and SMGs; gains sprint speed and carry capacity. Lightest non-Gunhead frame.',
    health: 900, walk: 2.51, sprint: 5.27,
    skills: ['SHG Expert v5', 'SMG Expert v5', 'Sprinting Expert v4', 'Carry Capacity v4', 'Stamina Training v5']
  },
  'Pawn.Player.MaskMan': {
    name: 'Mask Man', icon: '😶', role: 'Rifle specialist',
    blurb: 'Balanced rifleman with heavy-rifle and grenade-launcher training. Solid all-rounder.',
    health: 1150, walk: 1.97, sprint: 4.11,
    skills: ['RFL Expert v5', 'GRL Training v4', 'HRF Training v4', 'LMG Training v4', 'Stamina Training v5']
  },
  'Pawn.Player.BagMan': {
    name: 'Bag Man', icon: '🎒', role: 'Support / hauler',
    blurb: 'The carrying king — highest carry capacity (v5) and strong weapon accuracy. Slowest sprinter.',
    health: 1000, walk: 2.19, sprint: 3.54,
    skills: ['Carry Capacity v5', 'RFL Expert v5', 'HRF Expert v5', 'LMG Expert v5', 'GRL Training v4', 'Stamina Training v5']
  },
  'Pawn.Player.Girl': {
    name: 'Scav Girl', icon: '👧', role: 'Agile skirmisher',
    blurb: 'The fastest character in the game (top sprint speed) and a pistol/SMG expert. Glass cannon with the lowest base health.',
    health: 800, walk: 1.9, sprint: 5.47,
    skills: ['PST Expert v5', 'SMG Expert v5', 'Sprinting Expert v5', 'Stamina Training v5', 'Rig Skills (Enhanced → Medium Gunrunner)']
  },
  'Pawn.Player.OldMan': {
    name: 'Old Man', icon: '👴', role: 'Medic / rifleman',
    blurb: 'Tanky support with Medical Expert (more health from consumables) plus rifle and heavy-rifle mastery and rig skills.',
    health: 2250, walk: 2.67, sprint: 3.92,
    skills: ['HRF Expert v5', 'Medical Expert v5', 'RFL Expert v5', 'Rig Skills (Medium → Heavy Container Gunrunner)', 'Stamina Training v5']
  }
};

// Prestige stat bonuses per the wiki (https://theforeverwinter.wiki.gg/wiki/Characters#Prestige).
// Index = prestige level (1-based). Each entry: [healthBonus, speedBonusPercent].
// The bonus is a cumulative total added to base health. It maxes out at level 24
// (1000 health / 15% speed); levels 25+ grant NO FURTHER gain, so they hold the
// level-24 values (they do NOT drop to 0).
const PRESTIGE_TABLE = {
  1: [40, 0], 2: [80, 0], 3: [120, 0], 4: [160, 0], 5: [200, 0],
  6: [240, 4], 7: [280, 4], 8: [320, 4], 9: [360, 4], 10: [400, 4],
  11: [440, 4], 12: [480, 8], 13: [520, 8], 14: [560, 8], 15: [600, 8],
  16: [640, 8], 17: [680, 12], 18: [720, 12], 19: [760, 12], 20: [800, 12],
  21: [840, 12], 22: [880, 12], 23: [920, 12], 24: [1000, 15]
};
export const PRESTIGE_CAP_LEVEL = 24;       // highest level that still grants a bonus
export const PRESTIGE_MAX_FOR_WARNING = 25;  // levels >= this grant no further stats

// XP required to reach each prestige level (wiki "XP Required" column) = the
// XP cap shown for that level. Index = prestige level (1-based).
export const PRESTIGE_XP_CAP = {
  1: 8000, 2: 9400, 3: 11100, 4: 13000, 5: 15300, 6: 17900, 7: 20900, 8: 24400, 9: 28500, 10: 33200,
  11: 38700, 12: 45100, 13: 52500, 14: 61100, 15: 71100, 16: 82700, 17: 96200, 18: 111800, 19: 130000, 20: 151000,
  21: 175600, 22: 204600, 23: 237000, 24: 275000, 25: 318000, 26: 356200, 27: 398900, 28: 446800, 29: 500400, 30: 560400,
  31: 627600, 32: 702900, 33: 787200, 34: 881700, 35: 987500, 36: 1106000, 37: 1238700, 38: 1387300, 39: 1553800, 40: 1740300,
  41: 1949100, 42: 2183000, 43: 2445000, 44: 2738400, 45: 3067000, 46: 3435000, 47: 3847200, 48: 4308900, 49: 4826000, 50: 5405100
};

export function prestigeBonus(level) {
  const raw = parseInt(level, 10) || 0;
  if (raw < 1) return { health: 0, speed: 0 };
  const lvl = Math.min(raw, PRESTIGE_CAP_LEVEL); // 25+ holds the level-24 max
  const [h, s] = PRESTIGE_TABLE[lvl] || [0, 0];
  return { health: h, speed: s };
}

// Friendly metadata for Innards (Hub) upgrades. Sourced from the wiki
// (https://theforeverwinter.wiki.gg/wiki/Innards). category: 'terminals'
// (functional) or 'welfare' (comfort). reqs = required materials [{qty, item}],
// credits = CR cost, time = build time, water = min water days (prereq chain
// unchanged). The 100% reference save confirms the UpgradeTag values.
export const HUB_UPGRADE_META = {
  // --- Terminals ---
  'Hub.Upgrade.Category.Crafting.Ammo': { category: 'terminals', group: 'Crafting Stations', name: 'Munitions Printer', icon: '🔫', water: 12,
    desc: 'Craft general and special ammo and grenades.',
    reqs: [{ qty: 1, item: 'Basic Pliers' }, { qty: 1, item: 'Leather Hole Punch' }, { qty: 1, item: 'Intermediate Tool Set' }, { qty: 6, item: 'Fuse' }, { qty: 6, item: 'Gunpowder' }], credits: 150000, time: '2 hours' },
  'Hub.Upgrade.Category.Crafting.WeaponParts': { category: 'terminals', group: 'Crafting Stations', name: 'Workshop', icon: '🛠️', water: 8,
    desc: 'Manufacture Railgun parts, Rig Equipment, Utility Drones, Drone Components.',
    reqs: [{ qty: 1, item: 'Sewing Kit' }, { qty: 1, item: "Scavenger's Tool Kit" }, { qty: 1, item: 'Old Tool Set' }, { qty: 6, item: 'Printing Resin' }, { qty: 6, item: 'Metal Fragments' }], credits: 75000, time: '2 hours' },
  'Hub.Upgrade.Category.Crafting.WeaponRepairs': { category: 'terminals', group: 'Crafting Stations', name: 'Repair Bench', icon: '🔧', water: 16,
    desc: 'Repair destroyed firearms (needs faction IFFs).',
    reqs: [{ qty: 1, item: 'Clamp' }, { qty: 1, item: 'Field Repair Kit' }, { qty: 3, item: 'Eurasian IFF Chip LVL1' }, { qty: 3, item: 'Europan IFF Chip LVL1' }, { qty: 3, item: 'Euruskan IFF Chip LVL1' }], credits: 150000, time: '1 hour' },
  'Hub.Upgrade.Category.Crafting.Booster': { category: 'terminals', group: 'Crafting Stations', name: 'Manufacture Booster', icon: '⚡', water: 50,
    desc: 'Reduces manufacture times for all crafting.',
    reqs: [{ qty: 1, item: 'Basic Pliers' }, { qty: 1, item: 'Leather Hole Punch' }, { qty: 1, item: 'Intermediate Tool Set' }, { qty: 6, item: 'Fuse' }, { qty: 6, item: 'Gunpowder' }], credits: 332800, time: '2 hours' },

  'Hub.Upgrade.Category.Water.V1': { category: 'terminals', group: 'Water Tank', name: 'Water Tank +16 Days', icon: '💧', water: 10,
    desc: 'Increase capacity to 71 days of water.',
    reqs: [{ qty: 1, item: 'Valve Adjustment Tool' }, { qty: 1, item: 'Intermediate Tool Set' }, { qty: 2, item: 'Pressure Gauge' }, { qty: 12, item: 'Metal Pipe' }, { qty: 15, item: 'Bolts' }], credits: 175000, time: '60 minutes' },
  'Hub.Upgrade.Category.Water.V2': { category: 'terminals', group: 'Water Tank', name: 'Water Tank +28 Days', icon: '💧', water: 20,
    desc: 'Increase capacity to 99 days of water.', prereq: 'Hub.Upgrade.Category.Water.V1',
    reqs: [{ qty: 1, item: 'Sledgehammer' }, { qty: 1, item: 'Mother Courage Codex' }, { qty: 3, item: 'Industrial Sealant' }, { qty: 3, item: 'Construction Drone' }, { qty: 8, item: 'Carbon Fiber' }], credits: 750000, time: '6 hours' },

  'Hub.Upgrade.Category.Water.WaterBot.Delivery.v1': { category: 'terminals', group: 'Water Bots', name: 'Water Bots V1', icon: '🤖', water: 25,
    desc: 'Delivers 1 day of water every 2 days. May attract Water Thieves!',
    reqs: [{ qty: 1, item: 'Screwdriver' }, { qty: 3, item: 'Machine Parts' }, { qty: 3, item: 'Liquid Cooling Unit' }, { qty: 5, item: 'Eurasian Drone Cortex' }, { qty: 5, item: 'Europan Drone Flight Controller' }], credits: 50000, time: '1 hour' },
  'Hub.Upgrade.Category.Water.WaterBot.Delivery.v2': { category: 'terminals', group: 'Water Bots', name: 'Water Bots V2', icon: '🤖', water: 50,
    desc: 'Delivers 1–3 extra days of water. Higher Thief risk.', prereq: 'Hub.Upgrade.Category.Water.WaterBot.Delivery.v1',
    reqs: [{ qty: 1, item: 'Organoid Memory Board' }, { qty: 1, item: 'Organoid Plug' }, { qty: 1, item: 'Organoid Outlet' }, { qty: 5, item: 'Processor Board' }, { qty: 6, item: 'Brawler Spinal Joint' }], credits: 250000, time: '6 hours' },
  'Hub.Upgrade.Category.Water.WaterBot.Delivery.v3': { category: 'terminals', group: 'Water Bots', name: 'Water Bots V3', icon: '🤖', water: 75,
    desc: 'Delivers 1–4 extra days of water. Highest Thief risk.', prereq: 'Hub.Upgrade.Category.Water.WaterBot.Delivery.v2',
    reqs: [{ qty: 1, item: 'Precision Tool Set' }, { qty: 1, item: 'Organoid Networking Board' }, { qty: 1, item: 'Orga Codex' }, { qty: 3, item: 'Multi-frequency Broadcaster' }, { qty: 6, item: 'EOD Armor Plate' }], credits: 750000, time: '12 hours' },

  'Hub.Upgrade.Category.Defense.Turrets.01': { category: 'terminals', group: 'Defense Turrets', name: 'Innards Defense Turrets V1', icon: '🎯', water: 25,
    desc: 'Install defense turrets vs invading forces.',
    reqs: [{ qty: 2, item: 'Motherboard' }, { qty: 3, item: 'Gunpowder' }, { qty: 5, item: 'Weapon Parts' }, { qty: 8, item: 'Ball Bearings' }, { qty: 10, item: 'Turret Component' }], credits: 75000, time: '1 hour' },
  'Hub.Upgrade.Category.Defense.Turrets.02': { category: 'terminals', group: 'Defense Turrets', name: 'Innards Defense Turrets V2', icon: '🎯', water: 50,
    desc: 'Additional turrets.', prereq: 'Hub.Upgrade.Category.Defense.Turrets.01',
    reqs: [{ qty: 2, item: 'Military Grade Lubricant' }, { qty: 3, item: 'Heavy-Duty Battery' }, { qty: 3, item: 'Electric Motor' }, { qty: 5, item: 'WD40' }, { qty: 5, item: 'Camera Lens' }], credits: 150000, time: '6 hours' },
  'Hub.Upgrade.Category.Defense.Turrets.03': { category: 'terminals', group: 'Defense Turrets', name: 'Innards Defense Turrets V3', icon: '🎯', water: 75,
    desc: 'Additional turrets.', prereq: 'Hub.Upgrade.Category.Defense.Turrets.02',
    reqs: [{ qty: 2, item: 'Wetware Processor' }, { qty: 2, item: 'Gyroscopic Stabilizer' }, { qty: 3, item: 'Telemetry Unit' }, { qty: 5, item: 'Military Battery' }, { qty: 6, item: 'Military Circuitry' }], credits: 500000, time: '12 hours' },

  'Hub.Upgrade.Category.ShootingRange.00': { category: 'terminals', group: 'Shooting Range', name: 'Shooting Range', icon: '🎯', water: 6,
    desc: 'Unlocks the shooting range (unlimited ammo, invulnerable).',
    reqs: [{ qty: 6, item: 'Masking Tape' }, { qty: 8, item: 'Metal Pipe' }, { qty: 10, item: 'Wooden Plank' }, { qty: 12, item: 'Bolts' }, { qty: 12, item: 'Nuts' }], credits: 50000, time: '6 hours' },
  'Hub.Upgrade.Category.ShootingRange.01': { category: 'terminals', group: 'Shooting Range', name: 'Shooting Range Upgrade V1', icon: '🎯', water: 12,
    desc: 'Unlock damage test area.', prereq: 'Hub.Upgrade.Category.ShootingRange.00',
    reqs: [{ qty: 2, item: 'WD40' }, { qty: 8, item: 'Sheet Metal' }, { qty: 8, item: 'Drywall' }, { qty: 8, item: 'ES Lamp' }, { qty: 10, item: 'Nails' }], credits: 125000, time: '12 hours' },
  'Hub.Upgrade.Category.ShootingRange.02': { category: 'terminals', group: 'Shooting Range', name: 'Shooting Range Upgrade V2', icon: '🎯', water: 24,
    desc: 'Unlock target practice area.', prereq: 'Hub.Upgrade.Category.ShootingRange.01',
    reqs: [{ qty: 1, item: 'Construction Drone' }, { qty: 1, item: 'Concrete Mixer' }, { qty: 3, item: 'Concrete Powder' }, { qty: 5, item: 'Industrial Sealant' }, { qty: 6, item: 'UV Light Bulb' }], credits: 250000, time: '1 day' },
  'Hub.Upgrade.Category.ShootingRange.03': { category: 'terminals', group: 'Shooting Range', name: 'Shooting Range Upgrade V3', icon: '🎯', water: 48,
    desc: 'Unlock live targets.', prereq: 'Hub.Upgrade.Category.ShootingRange.02',
    reqs: [{ qty: 1, item: "Water Thief's Mask \"Bozo\"" }, { qty: 1, item: "Water Thief's Mask \"Thirsty\"" }, { qty: 1, item: 'Shield Officer Codex' }, { qty: 3, item: 'Construction Foam' }, { qty: 3, item: 'Construction Drone' }], credits: 500000, time: '2 days' },

  'Hub.Upgrade.Category.BossRoom.00': { category: 'terminals', group: 'Cognition Cradle', name: 'The Cognition Cradle', icon: '🧠', water: 50,
    desc: 'Unlocks the Cradle (Trophy Room / Boss Room).',
    reqs: [{ qty: 2, item: 'Ventilation Regulator' }, { qty: 3, item: 'Construction Foam' }, { qty: 3, item: 'Concrete Powder' }, { qty: 3, item: 'Sentient Drill' }, { qty: 3, item: 'Construction Drone' }], credits: 2000000, time: '12 hours' },
  'Hub.Upgrade.Category.BossRoom.01': { category: 'terminals', group: 'Cognition Cradle', name: 'Cradle Frame / Power Supply', icon: '🧠', water: 60,
    desc: 'Upgrade the Cradle (frame & power).', prereq: 'Hub.Upgrade.Category.BossRoom.00',
    reqs: [{ qty: 4, item: 'Military Power Cell' }, { qty: 4, item: 'Construction Drone' }, { qty: 5, item: 'Organoid Plug' }, { qty: 5, item: 'Organoid Outlet' }, { qty: 6, item: 'Carbon Fiber Tube' }], credits: 3500000, time: '1 day' },
  'Hub.Upgrade.Category.BossRoom.02': { category: 'terminals', group: 'Cognition Cradle', name: 'Cradle Containment Chamber', icon: '🧠', water: 70,
    desc: 'Upgrade the Cradle (containment).', prereq: 'Hub.Upgrade.Category.BossRoom.01',
    reqs: [{ qty: 3, item: 'Military Codebreaker' }, { qty: 3, item: 'Rootkit Device' }, { qty: 4, item: 'Wetware Processor' }, { qty: 5, item: 'Construction Drone' }, { qty: 5, item: 'Quantum Hard Drive' }], credits: 5000000, time: '2 days' },

  'Hub.Upgrade.Category.Garage.00': { category: 'terminals', group: 'APC Garage', name: 'APC Garage', icon: '🚙', water: 32,
    desc: 'Fast travel for credits (needs Garage Days quest).',
    reqs: [{ qty: 1, item: 'Ratchet' }, { qty: 1, item: 'Precision Tool Set' }, { qty: 1, item: 'Hard Shell Laptop' }, { qty: 2, item: 'Portable Generator' }, { qty: 3, item: 'Construction Drone' }], credits: 2500000, time: '24 hours' },

  'Hub.Upgrade.Category.TransRoom.00': { category: 'terminals', group: 'Transmission Tower', name: 'Transmission Tower', icon: '📡', water: 80,
    desc: 'Talk to world inhabitants; new quests & lore.', prereq: 'Hub.Upgrade.Category.Bar.03',
    reqs: [{ qty: 2, item: 'Organoid Networking Board' }, { qty: 2, item: 'Wetware Processor' }, { qty: 3, item: 'Construction Drone' }, { qty: 3, item: 'Military Codebreaker' }, { qty: 3, item: 'Multi-frequency Broadcaster' }, { qty: 5, item: 'Construction Foam' }], credits: 5000000, time: '24 hours' },

  'Hub.Upgrade.Category.Lift': { category: 'terminals', group: 'Transport Drone', name: 'Transport Drone', icon: '🚁',
    desc: 'Access the Shooting Range, Bar, Transmission, Garage, and Trophy Room.',
    reqs: [], credits: 25000, time: '30 minutes' },

  // --- Welfare ---
  'Hub.Upgrade.Category.PersonalQuarters.00': { category: 'welfare', group: 'Personal Quarters', name: 'Personal Quarters', icon: '🛏️', water: 12,
    desc: 'Unlocks your quarters.',
    reqs: [{ qty: 1, item: "Scavenger's Tool Kit" }, { qty: 3, item: 'Hand Drill' }, { qty: 8, item: 'Explosives' }, { qty: 8, item: 'Wooden Plank' }, { qty: 8, item: 'Cleaner' }], credits: 325000, time: '6 hours' },
  'Hub.Upgrade.Category.PersonalQuarters.01': { category: 'welfare', group: 'Personal Quarters', name: 'Personal Quarters V1', icon: '🛏️', water: 26,
    desc: '+10% health (returns 24h after death).', prereq: 'Hub.Upgrade.Category.PersonalQuarters.00',
    reqs: [{ qty: 1, item: 'Intermediate Tool Set' }, { qty: 5, item: 'Medical Tools' }, { qty: 6, item: 'Fleece' }, { qty: 8, item: 'Drywall' }, { qty: 12, item: 'Light Bulb' }], credits: 0, time: '12 hours' },
  'Hub.Upgrade.Category.PersonalQuarters.02': { category: 'welfare', group: 'Personal Quarters', name: 'Personal Quarters V2', icon: '🛏️', water: 52,
    desc: '+15% health (returns 12h after death).', prereq: 'Hub.Upgrade.Category.PersonalQuarters.01',
    reqs: [{ qty: 1, item: 'Construction Drone' }, { qty: 2, item: 'Heavy-Duty Trauma Kit' }, { qty: 2, item: 'Rotary Hammer' }, { qty: 5, item: 'OLED' }, { qty: 8, item: 'UV Light Bulb' }], credits: 750000, time: '1 day' },
  'Hub.Upgrade.Category.PersonalQuarters.03': { category: 'welfare', group: 'Personal Quarters', name: 'Personal Quarters V3', icon: '🛏️', water: 72,
    desc: '+25% health (returns 6h after death).', prereq: 'Hub.Upgrade.Category.PersonalQuarters.02',
    reqs: [{ qty: 1, item: 'Diagnostic Scanner' }, { qty: 1, item: 'Toothy Codex' }, { qty: 3, item: 'Toilet Paper' }, { qty: 3, item: 'Zonophor Tablets' }, { qty: 5, item: 'Bulkhead Lights' }], credits: 1500000, time: '2 days' },

  'Hub.Upgrade.Category.TvScreens.Small': { category: 'welfare', group: 'TV Screens', name: 'TV Screens (Small)', icon: '📺', water: 5,
    desc: 'Construct monitors to observe the war.',
    reqs: [{ qty: 1, item: 'Battery Charger' }, { qty: 3, item: 'LCD' }, { qty: 3, item: 'Printed Circuit Board' }, { qty: 5, item: 'Wires' }, { qty: 6, item: 'Rechargeable Battery' }], credits: 75000, time: '30 minutes' },
  'Hub.Upgrade.Category.TvScreens.Mega': { category: 'welfare', group: 'TV Screens', name: 'TV Screens (Mega)', icon: '📺', water: 8,
    desc: 'Broadcast combat on gigantic screens.', prereq: 'Hub.Upgrade.Category.TvScreens.Small',
    reqs: [{ qty: 1, item: 'Quantum Hard Drive' }, { qty: 1, item: 'Solar Battery' }, { qty: 3, item: 'UMEGA Media Player' }, { qty: 5, item: 'OLED' }, { qty: 10, item: 'Relay' }], credits: 1000000, time: '1.5 hours' },

  'Hub.Upgrade.Category.MusicSystem': { category: 'welfare', group: 'Music System', name: 'Music System', icon: '🎵', water: 1,
    desc: 'Connect aging intercom to musical specialists for morale.',
    reqs: [{ qty: 1, item: 'Neuralink Disc Player' }, { qty: 1, item: 'UMEGA Media Player' }, { qty: 1, item: 'Mini MD Drive' }, { qty: 3, item: 'Intelligence Cassette' }, { qty: 8, item: 'Wires' }], credits: 25000, time: '2 hours' },
  'Hub.Upgrade.Category.DogHouse': { category: 'welfare', group: 'Dog House', name: 'Dog House', icon: '🐕', water: 1,
    desc: 'A place for a dog to stay and cheer everyone up.',
    reqs: [{ qty: 1, item: 'Measuring Tape' }, { qty: 1, item: 'Food Tin' }, { qty: 3, item: 'Glue' }, { qty: 12, item: 'Wooden Plank' }, { qty: 12, item: 'Sheet Metal' }], credits: 250000, time: '1 hour' },
  'Hub.Upgrade.Category.Shrine': { category: 'welfare', group: 'Mech Shrine', name: 'Mech Shrine', icon: '⛩️', water: 5,
    desc: 'A place to pray and make requests to the mech God.',
    reqs: [{ qty: 1, item: 'Preserved Cryo Coffee' }, { qty: 1, item: 'Smuggled Organs' }, { qty: 1, item: "Water Thief's Mask \"Oni\"" }, { qty: 1, item: "Rat King's Wake" }, { qty: 1, item: 'Heirloom Seeds' }], credits: 2500000, time: '1 day' },
  'Hub.Upgrade.Category.SpecialTree': { category: 'welfare', group: 'Special Tree', name: 'Special Tree', icon: '🌳', water: 1,
    desc: 'A tree expressing your generosity and altruism.',
    reqs: [{ qty: 5, item: 'ES Lamp' }, { qty: 5, item: 'Light Bulb' }, { qty: 5, item: 'UV Light Bulb' }, { qty: 5, item: 'Weapon Parts' }, { qty: 10, item: 'Metal Slats' }], credits: 100000, time: '45 minutes' },

  'Hub.Upgrade.Category.Bar.00': { category: 'welfare', group: 'Bar', name: 'The Bar', icon: '🍺', water: 32,
    desc: 'Unlocks the bar; alcohol vaults spawn; new quests.',
    reqs: [{ qty: 8, item: 'Ribbed Tube' }, { qty: 10, item: 'Food Tin' }, { qty: 10, item: 'Vodka' }, { qty: 12, item: 'Metal Pipe' }, { qty: 15, item: 'Metal Fragments' }], credits: 250000, time: '6 hours' },
  'Hub.Upgrade.Category.Bar.01': { category: 'welfare', group: 'Bar', name: 'Bar Upgrade V1', icon: '🍺', water: 44,
    desc: 'Unlocks the first bar upgrade.', prereq: 'Hub.Upgrade.Category.Bar.00',
    reqs: [{ qty: 6, item: 'Clear Tube' }, { qty: 8, item: 'Printing Resin' }, { qty: 8, item: 'Goodies' }, { qty: 8, item: 'Rum' }, { qty: 12, item: 'Sheet Metal' }], credits: 750000, time: '12 hours' },
  'Hub.Upgrade.Category.Bar.02': { category: 'welfare', group: 'Bar', name: 'Bar Upgrade V2', icon: '🍺', water: 56,
    desc: 'Euruskans show up; more story.', prereq: 'Hub.Upgrade.Category.Bar.01',
    reqs: [{ qty: 1, item: 'Construction Drone' }, { qty: 2, item: 'Concrete Mixer' }, { qty: 6, item: 'Concrete Powder' }, { qty: 6, item: 'MRE' }, { qty: 6, item: 'Tequila' }], credits: 1500000, time: '1 day' },
  'Hub.Upgrade.Category.Bar.03': { category: 'welfare', group: 'Bar', name: 'Bar Upgrade V3', icon: '🍺', water: 68,
    desc: 'Europans show up; Transmission Tower blueprint.', prereq: 'Hub.Upgrade.Category.Bar.02',
    reqs: [{ qty: 1, item: 'Rat King Codex' }, { qty: 2, item: 'Sentient Drill' }, { qty: 3, item: 'Construction Drone' }, { qty: 5, item: 'Bulkhead Lights' }], credits: 2500000, time: '2 days' }
};

// Ordered list of all known upgrade tags.
export const HUB_UPGRADE_RECIPES = Object.fromEntries(RECIPE_DATA.recipes.upgrades.map(recipe => [recipe.upgradeTag, recipe]));
for (const recipe of RECIPE_DATA.recipes.upgrades) {
  const meta = HUB_UPGRADE_META[recipe.upgradeTag] || (HUB_UPGRADE_META[recipe.upgradeTag] = { category: 'terminals', group: 'Other', name: recipe.product.name, icon: 'upgrade', desc: '' });
  meta.reqs = recipe.components.map(component => ({ qty: component.quantity, item: component.name, itemId: component.itemId, sourceMap: component.sourceMap, writable: component.writable, status: component.status }));
  meta.credits = recipe.credits;
  meta.time = recipe.duration.label;
  meta.water = recipe.minimumWater;
  meta.prereq = recipe.prerequisiteTag;
}
export const HUB_UPGRADE_TAGS = RECIPE_DATA.recipes.upgrades.map(recipe => recipe.upgradeTag);

export const HUB_CATEGORY_LABELS = {
  terminals: 'Terminals (Functional)',
  welfare: 'Welfare (Comfort)',
  special: 'Special'
};
