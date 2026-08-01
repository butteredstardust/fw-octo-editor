import { FW } from '../../runtime.mjs';

const { esc, cleanFallbackName, actionIcon, showToast, userMessage } = FW;

// "Worth keeping" items per https://theforeverwinter.wiki.gg/wiki/Guides/Items_to_keep,
// keyed by WIKI display name (matched against describeItem(id).wiki -- the
// same resolution the rest of this page already uses for friendly names --
// not the save's internal RowName, which doesn't reliably correspond 1:1).
// Reason is the wiki's own section for that item: upgrade material (used
// across the Innards' crafting tree), story quest item (one-time, but its
// quest may not be done yet), repeatable quest item (recurring quests can
// ask for it again), or a standalone useful/crafting note.
const HIGH_VALUE_REASON = {
  upgrade: 'Innards upgrade material',
  story: 'Story quest item (one-time quest, may not be done yet)',
  quest: 'Repeatable quest item (recurring quests can ask for it again)',
  useful: 'Notable use per the wiki'
};
const HIGH_VALUE_ITEMS = Object.fromEntries([
  // Innards upgrade materials (every item used by at least one upgrade recipe).
  ...['Ball Bearings','Basic Pliers','Battery Charger','Bolts','Brawler Spinal Joint','Bulkhead Lights',
    'Camera Lens','Carbon Fiber','Carbon Fiber Tube','Clamp','Cleaner','Clear Tube','Concrete Mixer',
    'Concrete Powder','Construction Drone','Construction Foam','Diagnostic Scanner','Drywall','Electric Motor',
    'EOD Armor Plate','ES Lamp','Eurasian Drone Cortex','Eurasian IFF Chip LVL1','Europan Drone Flight Controller',
    'Europan IFF Chip LVL1','Euruskan IFF Chip LVL1','Explosives','Field Repair Kit','Fleece','Food Tin','Fuse',
    'Glue','Goodies','Gunpowder','Gyroscopic Stabilizer','Hand Drill','Hard Shell Laptop','Heavy-Duty Battery',
    'Heavy-Duty Trauma Kit','Heirloom Seeds','Industrial Sealant','Intelligence Cassette','Intermediate Tool Set',
    'LCD','Leather Hole Punch','Light Bulb','Liquid Cooling Unit','Machine Parts','Masking Tape','Measuring Tape',
    'Medical Tools','Metal Fragments','Metal Pipe','Metal Slats','Military Battery','Military Circuitry',
    'Military Codebreaker','Military Grade Lubricant','Military Power Cell','Mini MD Drive','Mother Courage Codex',
    'Motherboard','MRE','Multi-frequency Broadcaster','Nails','Neuralink Disc Player','Nuts','Old Tool Set','OLED',
    'Orga Codex','Organoid Memory Board','Organoid Networking Board','Organoid Outlet','Organoid Plug',
    'Portable Generator','Precision Tool Set','Preserved Cryo Coffee','Pressure Gauge','Printed Circuit Board',
    'Printing Resin','Processor Board','Quantum Hard Drive','Rat King Codex',"Rat King's Wake",'Ratchet',
    'Rechargeable Battery','Relay','Ribbed Tube','Rootkit Device','Rotary Hammer','Rum',"Scavenger's Tool Kit",
    'Screwdriver','Sentient Drill','Sewing Kit','Sheet Metal','Shield Officer Codex','Sledgehammer',
    'Smuggled Organs','Solar Battery','Telemetry Unit','Tequila','Toilet Paper','Toothy Codex','Turret Component',
    'UMEGA Media Player','UV Light Bulb','Valve Adjustment Tool','Ventilation Regulator','Vodka',
    'Water Thief\'s Mask "Bozo"','Water Thief\'s Mask "Oni"','Water Thief\'s Mask "Thirsty"','WD40',
    'Weapon Parts','Wetware Processor','Wires','Wooden Plank','Zonophor Tablets'
  ].map(name => [name, 'upgrade']),
  // Non-replayable story quest items.
  ...['Adrenaline Stim','Advanced Joint','Assorted Medicine','Bar Supplies','Cybernetic Lungs',
    'Cyborg Immunosuppressant','Diodegradable Multi-tool','Dogboro Cigarettes','EDC Multi-tool',
    'Explosive Charge','Frequency Tap','Hinoko Cigarettes','Medical Alcohol','Military Cables',
    'Nucky Gold Cigarettes',"Octogirl's Tool Set",'Orgamech Nervous System','Paper Scrap','Power Cell',
    'Power Schematics','Recovery Drone','Super Glue','Wetware System'
  ].map(name => [name, 'story']),
  // Replayable random quest items.
  ...['Banner of the Red Baron','Battle Plans','Brawler Insignia','Comms Device','Convoy Schedule',
    'Corpse Tank Control Panel',"Cyborg's Head",'Data Cache','Dog Tags','EOD Suit Component',
    'Eurasian Brawler Components','Eurasian Supply Crate','Euruskan Plans','Exo Component','Exo Hard Drive',
    'God Sniper Equipment','Heavy Joint Assembly','High Durability Rail Component','HIND Navigation Computer',
    'Jammer','Laser Rangefinder','Logbook','Mech Part','Medical Supplies','Memento',
    'Merkava Suspension Component','Mystical Tech Totem (Large)','Neuro Uplink Board','Personnel Data','Picture',
    'Pilot','Precision Components','Prized Alcohol','Railgun Assembly Component','Railgun Body Component',
    'Railgun Breech Component','Railgun Cooling Component','Railgun Magazine','Sewers Technical Plans',
    'Spare Part','T-90 Suspension Component','Targeting Computer','Teddy Bear','Tissue Sample','Water Map',
    'Weapon Schematics','Weapon Tech'
  ].map(name => [name, 'quest']),
  // Other notable uses called out by the wiki.
  ...['Thermite','Pneumatic Jump'].map(name => [name, 'useful'])
]);

export function highValueBadge(wikiName) {
  const reasonKey = HIGH_VALUE_ITEMS[wikiName];
  if (!reasonKey) return '';
  return `<span class="hv-badge" title="Worth keeping: ${esc(HIGH_VALUE_REASON[reasonKey])}">${actionIcon('star')}Keep</span>`;
}

let _catalog = {};

export const ITEM_CAT_ORDER = [
  'Weapons', 'Weapon attachments', 'Weapon parts', 'Ammo', 'Consumables',
  'Equipment', 'Large Items', 'Materials', 'Quest', 'Loot', 'Other'
];

export function catalogSourceMap(meta = {}) {
  if (meta.inventoryMap === 'Weapons') return 'Base Weapons';
  if (meta.inventoryMap === 'DamagedWeapons') return 'Damaged Weapons';
  return 'Items';
}

// One presentation taxonomy for both Manage Inventory and Add Items. The
// canonical source map decides weapon state; ordered tags decide family/slot.
export function itemPresentation(name, meta = {}) {
  const tags = (Array.isArray(meta.taxonomyTags) && meta.taxonomyTags.length
    ? meta.taxonomyTags
    : String(meta.category || '').split(','))
    .map(value => String(value).trim()).filter(Boolean);
  const lower = tags.map(value => value.toLowerCase());
  const sourceMap = catalogSourceMap(meta);
  let cat = 'Other'; let sub = ''; let slot = '';
  const classTag = tags.find((tag, index) => !/^(weapons|destroyed weapons|surplus weapons)$/i.test(tag) &&
    /pistol|rifle|shotgun|submachine|machinegun|grenade launcher/i.test(tag));
  if (sourceMap !== 'Items') { cat = 'Weapons'; sub = classTag || (sourceMap === 'Damaged Weapons' ? 'Destroyed weapons' : 'Weapon'); }
  else if (lower.includes('weapon attachments')) { cat = 'Weapon attachments'; slot = tags[tags.length - 1]; sub = slot === 'Weapon attachments' ? 'Attachment' : slot; }
  else if (lower.includes('weapon parts')) { cat = 'Weapon parts'; slot = tags[tags.length - 1]; sub = slot === 'Weapon parts' ? 'Part' : slot; }
  else if (meta.taxonomyGroup === 'Ammo' || lower.some(tag => tag === 'ammo' || tag === 'grenades')) { cat = 'Ammo'; sub = lower.includes('grenades') ? 'Grenades' : 'Ammunition'; }
  else if (meta.taxonomyGroup === 'Consumables' || lower.includes('consumables')) { cat = 'Consumables'; sub = tags.find(tag => /medical|provisions|alcohol/i.test(tag)) || 'Consumable'; }
  else if (meta.taxonomyGroup === 'Equipment' || lower.includes('equipment')) { cat = 'Equipment'; sub = tags.find(tag => !/^equipment$/i.test(tag)) || 'Equipment'; }
  else if (meta.taxonomyGroup === 'Large Items' || lower.includes('large items')) { cat = 'Large Items'; sub = tags.find(tag => !/^large items$/i.test(tag)) || 'Large item'; }
  else if (lower.some(tag => /^(materials|railgun components|at-43 components)$/i.test(tag))) { cat = 'Materials'; sub = tags.find(tag => /components|materials/i.test(tag)) || 'Material'; }
  else if (lower.includes('quest items') && tags.length === 1) { cat = 'Quest'; sub = 'Quest items'; }
  else if (meta.taxonomyGroup === 'Loot') { cat = 'Loot'; sub = tags[0] || 'Loot'; }
  const wiki = meta.wiki && meta.wiki !== name ? meta.wiki : cleanFallbackName(name);
  return {
    wiki, cat, sub, slot, sourceMap, exactName: !!(meta.wiki && meta.wiki !== name),
    description: meta.description || null, buffs: meta.buffs || null, debuffs: meta.debuffs || null
  };
}

// Description is the wiki's free-text "==Description==" section (flavor
// text, e.g. "A handful of nuts. Useful for fastening things together.");
// buffs/debuffs are the Cargo mechanical-effect fields, only populated for
// consumables with an actual gameplay effect. Both come straight from
// scripts/fetch-wiki-items.js -- only ever shown when the wiki has text for
// that item, never invented. Weapons/attachments/scopes have no equivalent
// field in Cargo, so this only ever renders for general items.
export function itemDescription(description, buffs, debuffs) {
  if (!description && !buffs && !debuffs) return '';
  const descLine = description ? `<div class="item-desc-flavor" title="${esc(description)}">${esc(description)}</div>` : '';
  const buffLine = buffs ? `<div class="item-desc-buff">${esc(buffs)}</div>` : '';
  const debuffLine = debuffs ? `<div class="item-desc-debuff">${esc(debuffs)}</div>` : '';
  return `<div class="item-desc">${descLine}${buffLine}${debuffLine}</div>`;
}

// Tracks whether the last loadCatalog() attempt failed, so pages that depend
// on it (Manage Inventory, Add Items) can tell the user their item names/
// categories are degraded instead of silently rendering raw internal IDs.
let _catalogLoadFailed = false;

export async function loadCatalog() {
  if (Object.keys(_catalog).length) return;
  try {
    const response = await fetch('catalog.json');
    if (!response.ok) throw new Error(`catalog.json request failed (HTTP ${response.status})`);
    _catalog = await response.json();
    _catalogLoadFailed = false;
  } catch (e) {
    _catalog = {};
    _catalogLoadFailed = true;
    showToast(userMessage(e, 'Could not load the item catalog. Item names and categories will be limited until this is fixed.'), 'error');
  }
}

// Derive a readable label + category for an item name from the wiki catalog,
// with sensible fallbacks for items not in the catalog (e.g. quest/dangly bits).
// `sub` is a coarse type used for the filter (e.g. "Primary part",
// "Optional attachment", "Rifles"). `slot` is the finer part slot (e.g.
// "Upper assembly", "Magazine", "Muzzle Device") shown on the item row.
export function describeItem(name) {
  const e = _catalog[name];
  if (e) return itemPresentation(name, e);
  if (/dangly/i.test(name) || name.startsWith('Quest') || name.startsWith('BP')) {
    return { wiki: cleanFallbackName(name), cat: 'Quest', sub: 'Quest items', slot: '', exactName: false };
  }
  if (name.startsWith('ingredient')) return { wiki: 'Crafting Ingredient', cat: 'Loot', sub: 'Crafting', slot: '' };
  return { wiki: cleanFallbackName(name), cat: 'Other', sub: '', slot: '', exactName: false };
}

// Shown at the top of Manage Inventory / Add Items whenever the wiki item
// catalog failed to load, so degraded item names/categories/icons are never
// silently presented as if everything loaded fine.
export function catalogWarningHtml() {
  return _catalogLoadFailed
    ? '<div class="empty-state catalog-warning" role="alert"><strong>Item catalog failed to load</strong><br>Item names, categories, and icons may show as raw internal IDs until this is fixed. Reload the page to try again.</div>'
    : '';
}

// Map a catalog entry to the TempInventory map it belongs in. Base weapons
// (top=Weapons, id not ending in _Broken) live in Weapons_0; destroyed weapons
// (top=Damaged Weapons) live in Danglies_0; everything else in Items_0.
export function sourceMapForCatalog(c) {
  if (c.inventoryMap === 'Weapons') return 'Base Weapons';
  if (c.inventoryMap === 'DamagedWeapons') return 'Damaged Weapons';
  if (c.inventoryMap === 'Items') return 'Items';
  if (c.top === 'Damaged Weapons') return 'Damaged Weapons';
  if (c.top === 'Weapons' && !/(_Broken|Surplus)$/.test(c.id || '')) return 'Base Weapons';
  return 'Items';
}
