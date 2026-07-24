import { FW, expose } from '../runtime.mjs';

const { api, esc, filterAndRank, cleanFallbackName, technicalDetails, itemTypeIcon, itemCategoryPills, filterSummaryHtml, readIntegerInput, setOperationFeedback, showLoading, setRenderedHtml, setLocalBusy, showToast, confirmAction, appIcon, actionIcon, receiptHtml, receiptSummary } = FW;

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

function highValueBadge(wikiName) {
  const reasonKey = HIGH_VALUE_ITEMS[wikiName];
  if (!reasonKey) return '';
  return `<span class="hv-badge" title="Worth keeping: ${esc(HIGH_VALUE_REASON[reasonKey])}">${actionIcon('star')}Keep</span>`;
}

let _inventory = [];
let _catalog = {};
let _invSubByCat = {};

const ITEM_CAT_ORDER = [
  'Weapons', 'Weapon attachments', 'Weapon parts', 'Ammo', 'Consumables',
  'Equipment', 'Large Items', 'Materials', 'Quest', 'Loot', 'Other'
];

function catalogSourceMap(meta = {}) {
  if (meta.inventoryMap === 'Weapons') return 'Base Weapons';
  if (meta.inventoryMap === 'DamagedWeapons') return 'Damaged Weapons';
  return 'Items';
}

// One presentation taxonomy for both Manage Inventory and Add Items. The
// canonical source map decides weapon state; ordered tags decide family/slot.
function itemPresentation(name, meta = {}) {
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
  return { wiki, cat, sub, slot, sourceMap, exactName: !!(meta.wiki && meta.wiki !== name), buffs: meta.buffs || null, debuffs: meta.debuffs || null };
}

// Buffs/debuffs come straight from the wiki's Cargo item data (see
// scripts/fetch-wiki-items.js) -- only ever shown when the wiki actually has
// text for that item, never invented. Weapons/attachments/scopes have no
// such field in Cargo, so this only ever renders for general items.
function itemDescription(buffs, debuffs) {
  if (!buffs && !debuffs) return '';
  const buffLine = buffs ? `<div class="item-desc-buff">${esc(buffs)}</div>` : '';
  const debuffLine = debuffs ? `<div class="item-desc-debuff">${esc(debuffs)}</div>` : '';
  return `<div class="item-desc">${buffLine}${debuffLine}</div>`;
}

async function loadCatalog() {
  if (Object.keys(_catalog).length) return;
  try {
    _catalog = await (await fetch('catalog.json')).json();
  } catch (e) {
    _catalog = {};
  }
}

// Derive a readable label + category for an item name from the wiki catalog,
// with sensible fallbacks for items not in the catalog (e.g. quest/dangly bits).
// `sub` is a coarse type used for the filter (e.g. "Primary part",
// "Optional attachment", "Rifles"). `slot` is the finer part slot (e.g.
// "Upper assembly", "Magazine", "Muzzle Device") shown on the item row.
function describeItem(name) {
  const e = _catalog[name];
  if (e) return itemPresentation(name, e);
  if (/dangly/i.test(name) || name.startsWith('Quest') || name.startsWith('BP')) {
    return { wiki: cleanFallbackName(name), cat: 'Quest', sub: 'Quest items', slot: '', exactName: false };
  }
  if (name.startsWith('ingredient')) return { wiki: 'Crafting Ingredient', cat: 'Loot', sub: 'Crafting', slot: '' };
  return { wiki: cleanFallbackName(name), cat: 'Other', sub: '', slot: '', exactName: false };
}

function invSubTypes(cat) {
  return (_invSubByCat[cat] || []).slice();
}

async function loadInventory() {
  const el = document.getElementById('inventoryList');
  showLoading(el, 8, 'Loading inventory');
  try {
    await loadCatalog();
    _inventory = await api('/inventory');
    // Build category + sub-type indexes from the data.
    const cats = [...new Set(_inventory.map(i => describeItem(i.name).cat))]
      .sort((a, b) => ITEM_CAT_ORDER.indexOf(a) - ITEM_CAT_ORDER.indexOf(b));
    _invSubByCat = {};
    for (const i of _inventory) {
      const d = describeItem(i.name);
      (_invSubByCat[d.cat] = _invSubByCat[d.cat] || new Set()).add(d.sub || '—');
    }
    for (const k of Object.keys(_invSubByCat)) {
      _invSubByCat[k] = [..._invSubByCat[k]].sort((a, b) => a.localeCompare(b));
    }
    const sel = document.getElementById('inventoryFilter');
    sel.innerHTML = '<option value="">All</option>' +
      cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    populateInvSubFilter();
    renderInventory();
  } catch (err) {
    el.textContent = 'Error: ' + err.message;
  }
}

// Populate the sub-type dropdown for the currently selected category.
function populateInvSubFilter() {
  const cat = document.getElementById('inventoryFilter').value;
  const sub = document.getElementById('inventorySubFilter');
  const subs = cat ? invSubTypes(cat) : [];
  sub.innerHTML = '<option value="">All</option>' +
    subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
}

function onInvCategoryChange() {
  populateInvSubFilter();
  resetInvExpansion();
  renderInventory();
}

function clearInvFilters() {
  document.getElementById('inventorySearch').value = '';
  document.getElementById('inventoryFilter').value = '';
  document.getElementById('inventorySubFilter').value = '';
  document.getElementById('inventorySource').value = '';
  document.getElementById('inventoryQty').value = 'any';
  document.getElementById('inventoryInvalidOnly').checked = false;
  populateInvSubFilter();
  resetInvExpansion();
  renderInventory();
}

// Reset to default expansion: only the first visible category open.
function resetInvExpansion() {
  _invExpanded = null;
}

function renderInventory() {
  const el = document.getElementById('inventoryList');
  const filter = document.getElementById('inventoryFilter').value;
  const subFilter = document.getElementById('inventorySubFilter').value;
  const sourceFilter = document.getElementById('inventorySource').value;
  const qtyMode = document.getElementById('inventoryQty').value;
  const q = document.getElementById('inventorySearch').value.trim().toLowerCase();
  const invalidOnly = document.getElementById('inventoryInvalidOnly').checked;

  let rows = _inventory.map(i => ({ ...i, d: describeItem(i.name) }));
  if (filter) rows = rows.filter(r => r.d.cat === filter);
  if (subFilter) rows = rows.filter(r => (r.d.sub || '—') === subFilter);
  if (sourceFilter) rows = rows.filter(r => (r.sourceMap || 'Items') === sourceFilter);
  if (qtyMode === 'gt0') rows = rows.filter(r => r.quantity > 0);
  else if (qtyMode === 'eq0') rows = rows.filter(r => r.quantity === 0);
  else if (qtyMode === 'gte10') rows = rows.filter(r => r.quantity >= 10);
  else if (qtyMode === 'gte100') rows = rows.filter(r => r.quantity >= 100);
  if (q) rows = filterAndRank(rows, q, r => [r.d.wiki, r.name, r.d.cat, r.d.sub, r.d.slot, r.sourceMap]);
  if (invalidOnly) rows = rows.filter(r => !r.validLayout);

  // Active filter summary.
  const parts = [];
  if (filter) parts.push(filter);
  if (subFilter) parts.push(subFilter);
  if (sourceFilter) parts.push(sourceFilter);
  if (qtyMode !== 'any') parts.push('qty ' + qtyMode);
  if (q) parts.push('“' + q + '”');
  if (invalidOnly) parts.push('invalid');
  document.getElementById('invFilterSummary').innerHTML = filterSummaryHtml(rows.length, parts);

  if (!rows.length) { el.innerHTML = '<div class="empty-state"><strong>No matching items</strong><br>Try fewer words or clear a filter.</div>'; return; }

  const groups = {};
  for (const r of rows) (groups[r.d.cat] = groups[r.d.cat] || []).push(r);
  const catsShown = ITEM_CAT_ORDER.filter(c => groups[c]);

  // Expansion state: if not yet initialized, expand only the first category.
  // When a search query is active, expand every category that has matches so
  // results are never hidden inside a collapsed section (e.g. an item sorted
  // into "Other" would otherwise disappear from the results).
  if (_invExpanded === null) {
    if (q) _invExpanded = new Set(catsShown);
    else _invExpanded = new Set(catsShown.length ? [catsShown[0]] : []);
  }

  const totalUnits = rows.reduce((n, r) => n + (r.quantity || 0), 0);
  let html = `<div class="inv-summary-line">${rows.length} item type(s) · ${totalUnits.toLocaleString()} total unit(s) shown · ` +
    `<button type="button" class="inv-toggle-all" data-action="toggle-all-inventory" data-open="true">expand all</button> · ` +
    `<button type="button" class="inv-toggle-all" data-action="toggle-all-inventory" data-open="false">collapse all</button></div>`;
  for (const cat of catsShown) {
    const list = groups[cat];
    const catUnits = list.reduce((n, r) => n + (r.quantity || 0), 0);
    const open = _invExpanded.has(cat);
    html += `<div class="inv-section">
      <button type="button" class="inv-cat-head ${open ? 'open' : ''}" data-action="toggle-inventory-section" data-category="${esc(cat)}" aria-expanded="${open ? 'true' : 'false'}">
        <span class="inv-caret">${open ? '▾' : '▸'}</span>
        <span class="inv-cat-title">${esc(cat)}</span>
        <span class="inv-cat-count">${list.length} types · ${catUnits.toLocaleString()} units</span>
      </button>`;
    if (open) {
      html += '<div class="inv-grid">';
      for (const r of list) {
        const enc = encodeURIComponent(r.name);
        const hv = r.d.exactName ? highValueBadge(r.d.wiki) : '';
        html += `<div class="inv-item ${r.validLayout ? '' : 'invalid'} ${hv ? 'high-value' : ''}">
          ${itemTypeIcon(r.d.cat, r.d.sub)}
          <div class="inv-item-main">
            <div class="inv-name-row">
              <span class="inv-name" title="${esc(r.name)}">${esc(r.d.wiki)}</span>${technicalDetails(r.name)}${hv}
              <span class="inv-qty" title="Current quantity">${r.quantity.toLocaleString()}</span>
            </div>
            ${itemCategoryPills(r.d.cat, r.d.sub, r.sourceMap)}
            <div class="inv-tag">${technicalDetails(r.name)}${r.d.slot ? ` <span>${esc(r.d.slot)}</span>` : ''}</div>
            ${itemDescription(r.d.buffs, r.d.debuffs)}
            ${r.validLayout ? '' : '<span class="inv-invalid-flag">Needs review</span>'}
            <div class="operation-inline" id="op-${enc}" aria-live="polite"></div>
          </div>
            <div class="inv-actions">
              <label class="inv-newqty" title="Set a new quantity">New
                <input type="number" id="qty-${enc}" value="${r.quantity}" min="0" max="2147483647" step="1">
              </label>
              <input type="hidden" id="src-${enc}" value="${esc(r.sourceMap || 'Items')}">
              <button class="set icon-only" data-action="update-item" data-name="${enc}" title="Set new quantity for ${esc(r.d.wiki)}">${actionIcon('check')}<span class="sr-only">Set</span></button>
            <button class="mini" data-action="set-quantity" data-name="${enc}" data-value="0" title="Set quantity to 0">0</button>
            <button class="mini" data-action="set-quantity" data-name="${enc}" data-value="9999" title="Set quantity to 9999 (caps display)">Max</button>
          </div>
        </div>`;
      }
      html += '</div>';
    }
    html += '</div>';
  }
  setRenderedHtml(el, html);
}

let _invExpanded = null;

function toggleInvSection(cat) {
  if (_invExpanded === null) _invExpanded = new Set();
  if (_invExpanded.has(cat)) _invExpanded.delete(cat);
  else _invExpanded.add(cat);
  renderInventory();
}

function toggleAllInvSections(open) {
  const cats = [...document.querySelectorAll('#inventoryList .inv-cat-title')].map(e => e.textContent);
  _invExpanded = new Set(open ? cats : []);
  renderInventory();
}

// ---- Add Items (catalog-based) ----

// Category ordering for the Add Items page (gear/loot buckets from the wiki).
const ADD_CAT_ORDER = ITEM_CAT_ORDER;

let _addCatalog = [];
let _addCatIndex = {};
let _addSubByCat = {};
let _addExpanded = null;

async function loadAddCatalog() {
  const el = document.getElementById('addCatalogList');
  showLoading(el, 8, 'Loading item catalog');
  try {
    const [catalog, inv] = await Promise.all([
      api('/inventory/catalog'),
      api('/inventory').catch(() => [])
    ]);
    const haveById = {};
    for (const i of inv) haveById[i.name] = (haveById[i.name] || 0) + i.quantity;
    _addCatalog = catalog.map(c => {
      const presentation = itemPresentation(c.id, c);
      const grp = presentation.cat;
      const have = haveById[c.id] != null ? haveById[c.id] : c.have;
      return { ...c, grp, sub: presentation.sub, slot: presentation.slot, sourceMap: presentation.sourceMap, have: have || 0 };
    });
    // Build category + sub-type indexes.
    _addCatIndex = {};
    _addSubByCat = {};
    for (const c of _addCatalog) {
      (_addCatIndex[c.grp] = _addCatIndex[c.grp] || new Set()).add(c.id);
      const subKey = c.sub || '—';
      (_addSubByCat[c.grp] = _addSubByCat[c.grp] || new Set()).add(subKey);
    }
    for (const k of Object.keys(_addCatIndex)) {
      _addCatIndex[k] = [..._addCatIndex[k]].length;
      _addSubByCat[k] = [..._addSubByCat[k]].sort((a, b) => a.localeCompare(b));
    }
    const sel = document.getElementById('addFilter');
    const cats = ADD_CAT_ORDER.filter(c => _addCatIndex[c]);
    sel.innerHTML = '<option value="">All</option>' +
      cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    populateAddSubFilter();
    renderAddCatalog();
  } catch (err) {
    el.textContent = 'Error: ' + err.message;
  }
}

// Populate the sub-type dropdown for the currently selected category.
function populateAddSubFilter() {
  const cat = document.getElementById('addFilter').value;
  const sub = document.getElementById('addSubFilter');
  const subs = cat ? (_addSubByCat[cat] || []) : [];
  sub.innerHTML = '<option value="">All</option>' +
    subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
}

function onAddCategoryChange() {
  populateAddSubFilter();
  resetAddExpansion();
  renderAddCatalog();
}

function clearAddFilters() {
  document.getElementById('addSearch').value = '';
  document.getElementById('addFilter').value = '';
  document.getElementById('addSubFilter').value = '';
  document.getElementById('addSource').value = '';
  document.getElementById('addState').value = 'any';
  populateAddSubFilter();
  resetAddExpansion();
  renderAddCatalog();
}

// Reset to the default: only the first visible category is expanded.
function resetAddExpansion() {
  _addExpanded = null;
}

function renderAddCatalog() {
  const el = document.getElementById('addCatalogList');
  if (!_addCatalog.length) { el.innerHTML = '<p>No catalog loaded.</p>'; return; }
  const filter = document.getElementById('addFilter').value;
  const subFilter = document.getElementById('addSubFilter').value;
  const q = document.getElementById('addSearch').value.trim().toLowerCase();
  const sourceFilter = document.getElementById('addSource').value;
  const stateFilter = document.getElementById('addState').value;

  let rows = _addCatalog.slice();
  if (filter) rows = rows.filter(r => r.grp === filter);
  if (subFilter) rows = rows.filter(r => (r.sub || '—') === subFilter);
  if (sourceFilter) rows = rows.filter(r => sourceMapForCatalog(r) === sourceFilter);
  if (stateFilter === 'missing') rows = rows.filter(r => r.have <= 0);
  else if (stateFilter === 'owned') rows = rows.filter(r => r.have > 0);
  if (q) rows = filterAndRank(rows, q, r => [r.wiki || cleanFallbackName(r.id), r.id, r.category, r.sub, r.grp]);

  const parts = [];
  if (filter) parts.push(filter);
  if (subFilter) parts.push(subFilter);
  if (sourceFilter) parts.push(sourceFilter);
  if (stateFilter !== 'any') parts.push(stateFilter);
  if (q) parts.push('“' + q + '”');
  document.getElementById('addFilterSummary').innerHTML = filterSummaryHtml(rows.length, parts);

  if (!rows.length) { el.innerHTML = '<div class="empty-state"><strong>No catalog matches</strong><br>Try another name or clear a filter.</div>'; return; }

  const groups = {};
  for (const r of rows) (groups[r.grp] = groups[r.grp] || []).push(r);
  const catsShown = ADD_CAT_ORDER.filter(c => groups[c]);

  if (_addExpanded === null) {
    _addExpanded = new Set(catsShown.length ? [catsShown[0]] : []);
  }

  let html = `<div class="inv-summary-line">${rows.length} item(s) available to add · ` +
    `<button type="button" class="inv-toggle-all" data-action="toggle-all-add-items" data-open="true">expand all</button> · ` +
    `<button type="button" class="inv-toggle-all" data-action="toggle-all-add-items" data-open="false">collapse all</button></div>`;
  for (const cat of catsShown) {
    const list = groups[cat];
    const open = _addExpanded.has(cat);
    html += `<div class="add-section">
      <button type="button" class="add-cat-head ${open ? 'open' : ''}" data-action="toggle-add-items-section" data-category="${esc(cat)}" aria-expanded="${open ? 'true' : 'false'}">
        <span class="add-caret">${open ? '▾' : '▸'}</span>
        <span class="add-cat-title">${esc(cat)}</span>
        <span class="add-cat-count">${list.length} items</span>
      </button>`;
    if (open) {
      html += '<div class="add-grid">';
    for (const r of list) {
      const enc = encodeURIComponent(r.id);
      const owned = r.have > 0;
      const haveCls = owned ? 'add-have' : 'add-have zero';
      const haveTxt = owned ? `Have ${r.have.toLocaleString()}` : 'Not owned';
      const hv = r.wiki ? highValueBadge(r.wiki) : '';
      html += `<div class="add-item ${owned ? 'owned' : ''} ${hv ? 'high-value' : ''}">
        ${itemTypeIcon(r.grp, r.sub || r.category)}
        <div class="add-main">
          <div class="add-name" title="${esc(r.id)}">${esc(r.wiki || cleanFallbackName(r.id))}${technicalDetails(r.id)}${hv}</div>
          ${itemCategoryPills(r.grp, r.sub || r.category, sourceMapForCatalog(r))}
          <div class="add-tag">${technicalDetails(r.id)}</div>
          ${itemDescription(r.buffs, r.debuffs)}
          <div class="${haveCls}">${haveTxt}${owned ? ' · edit on Inventory page' : ''}</div>
          <div class="operation-inline" id="addop-${enc}" aria-live="polite"></div>
        </div>
        <div class="add-actions">
          <label class="add-qty" title="Quantity to add">Qty
            <input type="number" id="addqty-${enc}" value="1" min="1" max="2147483647" step="1" ${owned ? 'disabled' : ''}>
          </label>
          <button class="add1" data-action="add-item" data-id="${enc}" ${owned ? 'disabled' : ''}>${owned ? actionIcon('check') + 'Cannot Add Owned Item' : actionIcon('add') + 'Add Item'}</button>
        </div>
      </div>`;
    }
    html += '</div>';
    }
    html += '</div>';
  }
  setRenderedHtml(el, html);
}

function toggleAddSection(cat) {
  if (_addExpanded === null) _addExpanded = new Set();
  if (_addExpanded.has(cat)) _addExpanded.delete(cat);
  else _addExpanded.add(cat);
  renderAddCatalog();
}

function toggleAllAddSections(open) {
  const cats = [...document.querySelectorAll('#addCatalogList .add-cat-title')].map(e => e.textContent);
  _addExpanded = new Set(open ? cats : []);
  renderAddCatalog();
}

// Map a catalog entry to the TempInventory map it belongs in. Base weapons
// (top=Weapons, id not ending in _Broken) live in Weapons_0; destroyed weapons
// (top=Damaged Weapons) live in Danglies_0; everything else in Items_0.
function sourceMapForCatalog(c) {
  if (c.inventoryMap === 'Weapons') return 'Base Weapons';
  if (c.inventoryMap === 'DamagedWeapons') return 'Damaged Weapons';
  if (c.inventoryMap === 'Items') return 'Items';
  if (c.top === 'Damaged Weapons') return 'Damaged Weapons';
  if (c.top === 'Weapons' && !/(_Broken|Surplus)$/.test(c.id || '')) return 'Base Weapons';
  return 'Items';
}

async function addItem(encId) {
  const id = decodeURIComponent(encId);
  const row = document.getElementById(`addqty-${encId}`)?.closest('.add-item');
  const inline = document.getElementById(`addop-${encId}`);
  const qty = readIntegerInput(document.getElementById(`addqty-${encId}`), 'Quantity', { min: 1, max: 2147483647 });
  const summary = document.getElementById('addFilterSummary');
  const cat = _addCatalog.find(c => c.id === id);
  const sourceMap = cat ? sourceMapForCatalog(cat) : undefined;
  const body = { itemId: id, quantity: qty };
  if (sourceMap) body.sourceMap = sourceMap;
  if (inline) { inline.className = 'operation-inline pending'; inline.textContent = `Adding ${qty.toLocaleString()}…`; }
  const result = await api('/inventory/add', {
    method: 'POST', body: JSON.stringify(body)
  }).catch(err => {
    if (inline) { inline.className = 'operation-inline error'; inline.textContent = err.message; }
    showToast(`Could not add ${cat?.wiki || cleanFallbackName(id)}.`, 'error');
    return null;
  });
  if (!result) return;
  if (!result.success && !result.added) {
    if (inline) { inline.className = 'operation-inline error'; inline.textContent = 'Verification failed. No verified change was shown.'; }
  } else if (result.added === false) {
    if (inline) { inline.className = 'operation-inline'; inline.textContent = 'Already owned—adjust it from Inventory.'; }
  } else {
    const friendly = cat?.wiki || cleanFallbackName(id);
    if (inline) { inline.className = 'operation-inline success'; inline.innerHTML = `Added ${qty.toLocaleString()} × ${esc(friendly)}.${receiptHtml(result)}`; }
    row?.classList.add('changed-flash');
    showToast(`${friendly} was added and verified.`);
    if (cat) cat.have = (cat.have || 0) + qty;
    setTimeout(renderAddCatalog, 850);
  }
}

// ---- Rigs and high-quality container kits ----

let _rigData = null;
const RIG_FILTER_KEY = 'fw-rig-filters';

function loadRigFilterState() {
  try { return JSON.parse(sessionStorage.getItem(RIG_FILTER_KEY) || '{}'); } catch { return {}; }
}

function saveRigFilterState() {
  try {
    sessionStorage.setItem(RIG_FILTER_KEY, JSON.stringify({
      search: document.getElementById('rigSearch').value,
      ownership: document.getElementById('rigOwnership').value,
      weightClass: document.getElementById('rigClass').value
    }));
  } catch {}
}

async function loadRigs() {
  const list = document.getElementById('rigList');
  showLoading(list, 6, 'Loading rigs');
  try {
    _rigData = await api('/rigs');
    const classes = [...new Set(_rigData.rigs.map(rig => rig.weightClass))];
    const classSelect = document.getElementById('rigClass');
    classSelect.innerHTML = '<option value="">All classes</option>' + classes.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    const saved = loadRigFilterState();
    document.getElementById('rigSearch').value = saved.search || '';
    document.getElementById('rigOwnership').value = ['all', 'owned', 'missing'].includes(saved.ownership) ? saved.ownership : 'all';
    classSelect.value = classes.includes(saved.weightClass) ? saved.weightClass : '';
    renderRigs();
  } catch (error) {
    list.innerHTML = `<div class="empty-state"><strong>Rigs could not be read</strong><br>${esc(error.message)}</div>`;
  } finally {
    list.setAttribute('aria-busy', 'false');
  }
}

function rigSlotPills(slots) {
  const labels = [
    ['large', 'Large'], ['medium', 'Medium'], ['small', 'Small'],
    ['open', 'Large-item'], ['weapon', 'Weapon bin']
  ];
  return `<div class="rig-slots" aria-label="Rig slots">${labels.filter(([key]) => slots[key]).map(([key, label]) => `<span class="rig-slot ${key}"><b>${esc(slots[key])}</b> ${label}</span>`).join('')}</div>`;
}

function friendlyContainerId(id) {
  const match = id.match(/^BP_(TopLeft|TopRight|BotLeft|BotRight|Top|Bot|Left|Right|Centre)(Large|Medium|Small)_3_C$/);
  if (!match) return id;
  const position = match[1].replace('Bot', 'Bottom ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return `${position} · ${match[2]} · High quality`;
}

function renderRigSummary() {
  if (!_rigData) return;
  const missing = _rigData.totalCount - _rigData.ownedCount;
  const uniqueHq = new Set(_rigData.rigs.flatMap(rig => rig.highQualityContainers)).size;
  document.getElementById('rigSummary').innerHTML = `
    <div class="rig-metric"><span>Owned rigs</span><strong>${esc(_rigData.ownedCount)} / ${esc(_rigData.totalCount)}</strong></div>
    <div class="rig-metric"><span>Missing rigs</span><strong>${esc(missing)}</strong></div>
    <div class="rig-metric"><span>HQ module types</span><strong>${uniqueHq}</strong></div>`;
}

function renderRigs() {
  if (!_rigData) return;
  saveRigFilterState();
  renderRigSummary();
  const query = document.getElementById('rigSearch').value.trim().toLowerCase();
  const ownership = document.getElementById('rigOwnership').value;
  const weightClass = document.getElementById('rigClass').value;
  let rigs = _rigData.rigs.slice();
  if (ownership === 'owned') rigs = rigs.filter(rig => rig.owned);
  if (ownership === 'missing') rigs = rigs.filter(rig => !rig.owned);
  if (weightClass) rigs = rigs.filter(rig => rig.weightClass === weightClass);
  if (query) rigs = filterAndRank(rigs, query, rig => [rig.name, rig.id, rig.weightClass, rig.compatibleCharacters.join(' ')]);
  const parts = [];
  if (ownership !== 'all') parts.push(ownership);
  if (weightClass) parts.push(weightClass);
  if (query) parts.push(`“${query}”`);
  document.getElementById('rigFilterSummary').innerHTML = filterSummaryHtml(rigs.length, parts);
  const list = document.getElementById('rigList');
  if (!rigs.length) {
    list.innerHTML = '<div class="empty-state"><strong>No rigs match</strong><br>Try another name or clear a filter.</div>';
    return;
  }
  list.innerHTML = rigs.map(rig => {
    const enc = encodeURIComponent(rig.id);
    const moduleList = rig.highQualityContainerSet.map(module => `<li><span>${esc(friendlyContainerId(module.containerId))}</span><b>Owned ${module.quantity.toLocaleString()} → ${(module.quantity + 1).toLocaleString()}</b>${technicalDetails(module.containerId, 'Show container ID')}</li>`).join('');
    return `<article class="rig-card ${rig.owned ? 'owned' : 'missing'}" data-rig-card="${enc}">
      <div class="rig-card-head">
        <span class="rig-icon" aria-hidden="true">${appIcon('pack')}</span>
        <div><h3>${esc(rig.name)}</h3><span class="rig-class">${esc(rig.weightClass)}</span></div>
        <span class="rig-owned-badge ${rig.owned ? 'owned' : 'missing'}">${rig.owned ? 'Owned' : 'Missing'}</span>
      </div>
      <div class="rig-capacity"><span><small>Base capacity</small><b>${esc(rig.minCapacity.toLocaleString())} CU</b></span><span><small>HQ capacity</small><b>${esc(rig.maxCapacity.toLocaleString())} CU</b></span><span><small>Rig weight</small><b>${esc(rig.weight)} kg</b></span></div>
      ${rigSlotPills(rig.slots)}
      <p class="rig-characters"><b>Compatible:</b> ${esc(rig.compatibleCharacters.join(', '))}</p>
      <details class="rig-kit-details"><summary>HQ set · ${rig.highQualityContainers.length} container${rig.highQualityContainers.length === 1 ? '' : 's'}</summary><ul>${moduleList}</ul></details>
      <div class="operation-inline" id="rigop-${enc}" aria-live="polite"></div>
      <div class="rig-actions">
        <button class="btn-primary" data-action="add-rig" data-id="${enc}" type="button" ${rig.owned ? 'disabled' : ''}>${rig.owned ? actionIcon('check') + 'Rig owned' : actionIcon('add') + 'Add rig'}</button>
        <button class="btn-ghost" data-action="add-rig-kit" data-id="${enc}" type="button">${actionIcon('add')}Add HQ set</button>
      </div>
    </article>`;
  }).join('');
}

function clearRigFilters() {
  document.getElementById('rigSearch').value = '';
  document.getElementById('rigOwnership').value = 'all';
  document.getElementById('rigClass').value = '';
  renderRigs();
  document.getElementById('rigSearch').focus();
}

async function addRig(encId) {
  const rigId = decodeURIComponent(encId);
  const rig = _rigData?.rigs.find(candidate => candidate.id === rigId);
  if (!rig || rig.owned) return;
  const accepted = await confirmAction(`Add ownership of ${rig.name}? This will not equip it or change the active character's loadout.`, 'Add missing rig', false);
  if (!accepted) return;
  const inline = document.getElementById(`rigop-${encId}`);
  inline.className = 'operation-inline pending';
  inline.textContent = 'Adding and verifying rig ownership…';
  try {
    const result = await api(`/rigs/${encodeURIComponent(rigId)}/add`, { method: 'POST', body: '{}' });
    rig.owned = true;
    _rigData.ownedCount += 1;
    renderRigs();
    const refreshed = document.querySelector(`[data-rig-card="${encId}"] [data-action="add-rig"]`);
    refreshed?.focus();
    const updatedInline = document.getElementById(`rigop-${encId}`);
    if (updatedInline) { updatedInline.className = 'operation-inline success'; updatedInline.innerHTML = `Rig added and verified.${receiptHtml(result)}`; }
    showToast(`${rig.name} ownership was added and verified.`);
    refreshSafetyStatus();
  } catch (error) {
    inline.className = 'operation-inline error';
    inline.textContent = error.message;
    showToast(`Could not add ${rig.name}.`, 'error');
  }
}

async function addRigKit(encId) {
  const rigId = decodeURIComponent(encId);
  const rig = _rigData?.rigs.find(candidate => candidate.id === rigId);
  if (!rig) return;
  const names = rig.highQualityContainerSet.map(module => friendlyContainerId(module.containerId)).join('; ');
  const accepted = await confirmAction(`Add one complete HQ set for ${rig.name}? Each of these containers will increase by one: ${names}. Existing quantities will not be replaced.`, 'Add high-quality container set', false);
  if (!accepted) return;
  const inline = document.getElementById(`rigop-${encId}`);
  inline.className = 'operation-inline pending';
  inline.textContent = `Adding and verifying ${rig.highQualityContainers.length} container types…`;
  try {
    const result = await api(`/rigs/${encodeURIComponent(rigId)}/high-quality-set`, { method: 'POST', body: '{}' });
    const byId = new Map(result.containers.map(change => [change.containerId, change.after]));
    for (const module of rig.highQualityContainerSet) if (byId.has(module.containerId)) module.quantity = byId.get(module.containerId);
    renderRigs();
    const refreshed = document.querySelector(`[data-rig-card="${encId}"] [data-action="add-rig-kit"]`);
    refreshed?.focus();
    const updatedInline = document.getElementById(`rigop-${encId}`);
    if (updatedInline) { updatedInline.className = 'operation-inline success'; updatedInline.innerHTML = `HQ set added and verified.${receiptHtml(result)}`; }
    showToast(`${rig.name} HQ container set was added and verified.`);
    refreshSafetyStatus();
  } catch (error) {
    inline.className = 'operation-inline error';
    inline.textContent = error.message;
    showToast(`Could not add the ${rig.name} HQ set.`, 'error');
  }
}

function findInventoryItem(name) {
  return _inventory.find(entry => entry.name === name);
}

// Update the quantity of an inventory item. The action passes the
// encodeURIComponent'd item name; resolve it back to the real RowName, read the
// new quantity + sourceMap from the row's inputs, and call /inventory/update.
// Source identification is left to the backend (it auto-detects the map), but
// we pass the row's sourceMap hint when present for an exact-target write.
async function updateItem(encName) {
  const name = decodeURIComponent(encName);
  const qtyInput = document.getElementById('qty-' + encName);
  const srcInput = document.getElementById('src-' + encName);
  const inline = document.getElementById('op-' + encName);
  const button = qtyInput && qtyInput.closest('.inv-item')?.querySelector('button.set');
  const sourceMap = srcInput ? srcInput.value : undefined;
  let qty;
  try { qty = readIntegerInput(qtyInput, 'Quantity', { min: 0, max: 2147483647 }); }
  catch (err) { if (inline) { inline.className = 'operation-inline error'; inline.textContent = err.message; } return; }
  if (inline) { inline.className = 'operation-inline pending'; inline.textContent = `Saving ${qty.toLocaleString()}…`; }
  if (button) setLocalBusy(button, true, 'Saving…');
  try {
    const body = { itemId: name, quantity: qty };
    if (sourceMap) body.sourceMap = sourceMap;
    const result = await api('/inventory/update', { method: 'POST', body: JSON.stringify(body) });
    if (!result.afterIntegrity || !result.afterIntegrity.passed) throw new Error('integrity check failed');
    const item = findInventoryItem(name);
    if (item) item.quantity = qty;
    if (inline) { inline.className = 'operation-inline success'; inline.innerHTML = `Set to ${qty.toLocaleString()}.${receiptHtml(result)}`; }
    if (qtyInput) qtyInput.value = qty;
    showToast(`${name} set to ${qty.toLocaleString()}.`);
    setTimeout(loadInventory, 700);
  } catch (err) {
    if (inline) { inline.className = 'operation-inline error'; inline.textContent = 'Error: ' + err.message; }
    showToast(`Could not update ${name}.`, 'error');
  } finally {
    if (button) setLocalBusy(button, false);
  }
}

// Quick-set a known quantity (0 or Max) for an item from the inline buttons.
async function setQty(encName, value) {
  const qtyInput = document.getElementById('qty-' + encName);
  if (qtyInput) qtyInput.value = value;
  await updateItem(encName);
}

expose({ loadCatalog, loadInventory, renderInventory, onInvCategoryChange, clearInvFilters, resetInvExpansion, toggleInvSection, toggleAllInvSections, loadAddCatalog, renderAddCatalog, onAddCategoryChange, clearAddFilters, resetAddExpansion, toggleAddSection, toggleAllAddSections, addItem, loadRigs, renderRigs, clearRigFilters, addRig, addRigKit, describeItem, findInventoryItem, updateItem, setQty });

// ---- Vendors & Faction Trust ----

// Wiki trust tiers are derived from FactionScore. These thresholds are
// editorial guidance (the game maps scores to tiers internally); the live
// "maxed" save uses 239000 for trusted factions and -1000 for untrusted.
