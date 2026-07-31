import * as FWAPI from './api-client.mjs';
import { RECIPE_DATA } from './recipe-data.mjs';
import {
  filterAndRank,
  cleanFallbackName,
  debounce,
  receiptSummary,
  readIntegerInput,
  validateInteger
} from './ui-utils.mjs';
import { FW, expose } from './runtime.mjs';

// Escape a value for safe insertion into innerHTML (defends against any
// save/DB string that contains < > & " ').
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function technicalDetails(id, label = 'Show technical ID') {
  return `<details class="technical-details"><summary title="${esc(label)}" aria-label="${esc(label)}">i</summary><span class="technical-id">${esc(id)}</span></details>`;
}

// Locally owned, dependency-free inventory icon set. Icons are decorative;
// adjacent text always carries the category name for assistive technology.
function itemTypeIcon(category, subtype = '') {
  const value = `${category} ${subtype}`.toLowerCase();
  let path;
  if (/weapon|rifle|pistol|shotgun|smg|launcher|machinegun/.test(value)) path = '<path d="M3 11h10l3-3h5v4h-4l-2 3h-4l-1 5H7l1-5H3z"/>';
  else if (/ammo|ammunition|round|shell/.test(value)) path = '<path d="M9 3h6l2 4v12H7V7zM8 8h8"/>';
  else if (/attachment|optic|scope|grip|muzzle|magazine|part/.test(value)) path = '<path d="M4 8h16v8H4zM8 5v3m8-3v3m-8 8v3m8-3v3"/>';
  else if (/consumable|medical|food|drink|booster/.test(value)) path = '<path d="M8 3h8v4l2 3v11H6V10l2-3zM9 13h6m-3-3v6"/>';
  else if (/equipment|rig|drone|container/.test(value)) path = '<path d="M5 7h14v13H5zM9 7V4h6v3M9 12h6"/>';
  else if (/material|component|resource|scrap/.test(value)) path = '<path d="m12 3 8 5-8 5-8-5zM4 12l8 5 8-5M4 16l8 5 8-5"/>';
  else if (/quest|key|document/.test(value)) path = '<path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6m-6 4h6"/>';
  else if (/loot|valuable|currency/.test(value)) path = '<path d="M4 9h16l-2 11H6zM8 9a4 4 0 0 1 8 0"/>';
  else path = '<path d="M4 7 12 3l8 4v10l-8 4-8-4zM4 7l8 5 8-5m-8 5v9"/>';
  return `<span class="item-type-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${path}</svg></span>`;
}

// Small action-glyph set for buttons (distinct from itemTypeIcon/appIcon,
// which represent nouns like item categories or characters). These represent
// verbs -- add, confirm, remove, unlock, etc. -- and are always decorative;
// the button's visible label or aria-label/sr-only text carries the meaning.
const ACTION_ICON_PATHS = {
  add: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6m4-6v6"/>',
  unlock: '<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  lock: '<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  save: '<path d="M5 4h11l3 3v13H5zM8 4v6h8V4M8 14h8v6H8z"/>',
  refresh: '<path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.6M4 13a8 8 0 0 0 13.7 4.7L20 15.4M4 4v5h5M15 20h5v-5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  collect: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  folder: '<path d="M3 6h6l2 3h10v10H3z"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  star: '<path d="M12 3 14.1 9.1 20.6 9.2 15.4 13.1 17.3 19.3 12 15.6 6.7 19.3 8.6 13.1 3.4 9.2 9.9 9.1Z"/>'
};
function actionIcon(name, className = '') {
  const path = ACTION_ICON_PATHS[name] || ACTION_ICON_PATHS.check;
  return `<span class="action-icon ${esc(className)}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${path}</svg></span>`;
}

const APP_ICON_ALIASES = {
  '🤖': 'robot', '🥁': 'shaman', '😶': 'mask', '🎒': 'pack', '👧': 'runner', '👴': 'medic', '🔹': 'generic',
  '🔫': 'ammo', '🛠️': 'workshop', '🔧': 'repair', '⚡': 'power', '💧': 'water', '🎯': 'target', '🧠': 'cradle',
  '🚙': 'vehicle', '📡': 'signal', '🚁': 'drone', '🛏️': 'quarters', '📺': 'screen', '🎵': 'music', '🐕': 'dog',
  '⛩️': 'shrine', '🌳': 'tree', '🍺': 'bar', '💰': 'credits', '🛰️': 'recovery', '🎁': 'welfare', '🏷️': 'tag',
  '📖': 'codex'
};

const APP_ICON_PATHS = {
  generic: '<path d="M4 7 12 3l8 4v10l-8 4-8-4zM4 7l8 5 8-5m-8 5v9"/>',
  robot: '<rect x="5" y="7" width="14" height="11" rx="2"/><path d="M9 7V4h6v3M9 12h.01M15 12h.01M8 16h8"/>',
  shaman: '<circle cx="12" cy="12" r="8"/><path d="M8 8l8 8M16 8l-8 8M12 2v3m0 14v3"/>',
  mask: '<path d="M5 5c4-3 10-3 14 0v8c0 5-4 8-7 9-3-1-7-4-7-9zM9 11h.01M15 11h.01M9 16h6"/>',
  pack: '<path d="M7 8V6a5 5 0 0 1 10 0v2M5 8h14v13H5zM8 12h8M3 11h2m14 0h2"/>',
  runner: '<circle cx="13" cy="4" r="2"/><path d="m11 7-3 5 4 2 2 6m-6-8-4 3m8-1 5-3 3 2m-9 2-5 5"/>',
  medic: '<path d="M8 3h8v4l3 3v11H5V10l3-3zM9 14h6m-3-3v6"/>',
  ammo: '<path d="M9 3h6l2 4v13H7V7zM8 9h8"/>',
  workshop: '<path d="m4 20 6-6m4-4 6-6M14 4l6 6M4 14l6 6M9 9l6 6"/>',
  repair: '<path d="M14 5a5 5 0 0 0-6 6L3 16l5 5 5-5a5 5 0 0 0 6-6l-3 3-4-4z"/>',
  power: '<path d="m13 2-8 12h7l-1 8 8-12h-7z"/>',
  water: '<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13zM8 16c1 2 2 3 4 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  cradle: '<path d="M8 5a4 4 0 0 1 7-1 4 4 0 0 1 3 6 4 4 0 0 1-1 7 4 4 0 0 1-6 2 4 4 0 0 1-6-4 4 4 0 0 1 1-7A4 4 0 0 1 8 5zM12 5v14M8 9h4m0 5h5"/>',
  vehicle: '<path d="M4 11h16l2 4v4h-3a3 3 0 0 1-6 0H9a3 3 0 0 1-6 0H2v-4zM7 11l2-5h7l3 5"/>',
  signal: '<path d="M12 20V10m-4 10h8M9 10a4 4 0 0 1 6 0M6 7a8 8 0 0 1 12 0M3 4a12 12 0 0 1 18 0"/>',
  drone: '<path d="M7 9h10v7H7zM3 6h5m8 0h5M5 6v3m14-3v3M9 16l-2 4m8-4 2 4"/>',
  recovery: '<path d="M7 9h10v7H7zM3 6h5m8 0h5M5 6v3m14-3v3M12 11v8m-3-3 3 3 3-3"/>',
  quarters: '<path d="M3 18V9m0 6h18v3M6 12h5V8H6zm5 0h8a2 2 0 0 1 2 2v1"/>',
  screen: '<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8m-4-4v4"/>',
  music: '<path d="M9 18V6l10-2v12M9 10l10-2M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm10-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>',
  dog: '<path d="M6 10 3 6l5 1 4-3 4 3 5-1-3 4v7c-3 4-9 4-12 0zM9 13h.01M15 13h.01M10 17h4"/>',
  shrine: '<path d="M3 6h18M6 6v15m12-15v15M2 3h20M8 11h8m-7 5h6"/>',
  tree: '<path d="M12 22v-7M7 15h10l-3-4h3l-5-8-5 8h3z"/>',
  bar: '<path d="M6 3h12l-2 18H8zM7 8h10M9 13h6"/>',
  credits: '<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6H9m3-15v3m0 12v2"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  welfare: '<path d="M4 10h16v11H4zM2 7h20v3H2zM12 7v14M12 7c-4 0-5-2-4-4 2-1 4 1 4 4zm0 0c4 0 5-2 4-4-2-1-4 1-4 4z"/>',
  tag: '<path d="M3 12V4h8l10 10-7 7zM7 8h.01"/>',
  codex: '<path d="M12 6c-2.5-2-6-2-9-1v14c3-1 6.5-1 9 1 2.5-2 6-2 9-1V5c-3-1-6.5-1-9 1zM12 6v14"/>',
  weapon: '<path d="M3 11h10l3-3h5v4h-4l-2 3h-4l-1 5H7l1-5H3z"/>',
  quest: '<path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6m-6 4h6"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/><path d="M9 12l2 2 4-4"/>'
};

function appIcon(name, className = '') {
  const key = APP_ICON_ALIASES[name] || name || 'generic';
  const path = APP_ICON_PATHS[key] || APP_ICON_PATHS.generic;
  return `<span class="app-icon ${esc(className)}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${path}</svg></span>`;
}

function itemCategoryPills(category, subtype, source) {
  const values = [category, subtype, source && source !== 'Items' ? source : ''].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  return `<span class="item-taxonomy">${values.map((value, index) => `<span class="item-pill ${index ? 'secondary' : ''}">${esc(value)}</span>`).join('')}</span>`;
}

function showToast(message, type = 'success') {
  const region = document.getElementById('toastRegion');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function receiptHtml(result) {
  const summary = receiptSummary(result);
  return summary ? `<details class="receipt"><summary>Verification details</summary><div>${esc(summary)}</div></details>` : '';
}

function setOperationFeedback(target, message, result, state = 'success') {
  const element = typeof target === 'string' ? document.getElementById(target) : target;
  if (!element) return false;
  element.className = `operation-banner ${state}`;
  element.setAttribute('role', state === 'error' ? 'alert' : 'status');
  element.innerHTML = `<strong>${esc(message)}</strong>${receiptHtml(result)}`;
  document.getElementById('appAnnouncements').textContent = message;
  return true;
}

function operationFeedbackFor(control) {
  return control?.closest('.page')?.querySelector('[data-operation-status]') || null;
}

function filterSummaryHtml(count, parts) {
  return `<span class="result-count">${count.toLocaleString()} result${count === 1 ? '' : 's'}</span>${parts.map(part => `<span class="filter-chip">${esc(part)}</span>`).join('')}`;
}

function showLoading(element, count = 4, label = 'Loading') {
  if (!element) return;
  element.setAttribute('aria-busy', 'true');
  element.innerHTML = `<span class="sr-only">${esc(label)}…</span><div class="skeleton-grid" aria-hidden="true">${Array.from({ length: count }, () => '<div class="skeleton-card"><span></span><span></span><span></span></div>').join('')}</div>`;
}

function setRenderedHtml(element, html) {
  if (!element) return;
  const activeId = element.contains(document.activeElement) ? document.activeElement.id : '';
  const openDetails = [...element.querySelectorAll('details[open]')].map((details, index) => details.id || details.dataset.stateKey || `${index}:${details.querySelector('summary')?.textContent || ''}`);
  element.innerHTML = html;
  element.removeAttribute('aria-busy');
  [...element.querySelectorAll('details')].forEach((details, index) => {
    const key = details.id || details.dataset.stateKey || `${index}:${details.querySelector('summary')?.textContent || ''}`;
    if (openDetails.includes(key)) details.open = true;
  });
  if (activeId) document.getElementById(activeId)?.focus({ preventScroll: true });
}

// Only needed for multi-step progress text (e.g. "Updating 3 of 8…"). The dispatcher's
// automatic .is-pending spinner already covers single-mutation buttons, and a custom
// label set here is invisible while pending since .is-pending sets color:transparent.
function setLocalBusy(control, busy, label) {
  if (!control) return;
  if (busy) {
    control.dataset.originalLabel = control.textContent;
    control.disabled = true;
    control.textContent = label || 'Saving…';
  } else {
    control.disabled = false;
    control.textContent = control.dataset.originalLabel || control.textContent;
    delete control.dataset.originalLabel;
  }
}

// Friendly metadata for playable characters, sourced from the wiki
// (https://theforeverwinter.wiki.gg/wiki/Characters). Keyed by the save's
// CharacterGameplayTag. Stats are baseline values at prestige 0 / level 1.
const CHARACTER_META = {
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
const PRESTIGE_CAP_LEVEL = 24;       // highest level that still grants a bonus
const PRESTIGE_MAX_FOR_WARNING = 25;  // levels >= this grant no further stats

// XP required to reach each prestige level (wiki "XP Required" column) = the
// XP cap shown for that level. Index = prestige level (1-based).
const PRESTIGE_XP_CAP = {
  1: 8000, 2: 9400, 3: 11100, 4: 13000, 5: 15300, 6: 17900, 7: 20900, 8: 24400, 9: 28500, 10: 33200,
  11: 38700, 12: 45100, 13: 52500, 14: 61100, 15: 71100, 16: 82700, 17: 96200, 18: 111800, 19: 130000, 20: 151000,
  21: 175600, 22: 204600, 23: 237000, 24: 275000, 25: 318000, 26: 356200, 27: 398900, 28: 446800, 29: 500400, 30: 560400,
  31: 627600, 32: 702900, 33: 787200, 34: 881700, 35: 987500, 36: 1106000, 37: 1238700, 38: 1387300, 39: 1553800, 40: 1740300,
  41: 1949100, 42: 2183000, 43: 2445000, 44: 2738400, 45: 3067000, 46: 3435000, 47: 3847200, 48: 4308900, 49: 4826000, 50: 5405100
};

function prestigeBonus(level) {
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
const HUB_UPGRADE_META = {
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
const HUB_UPGRADE_RECIPES = Object.fromEntries(RECIPE_DATA.recipes.upgrades.map(recipe => [recipe.upgradeTag, recipe]));
for (const recipe of RECIPE_DATA.recipes.upgrades) {
  const meta = HUB_UPGRADE_META[recipe.upgradeTag] || (HUB_UPGRADE_META[recipe.upgradeTag] = { category: 'terminals', group: 'Other', name: recipe.product.name, icon: 'upgrade', desc: '' });
  meta.reqs = recipe.components.map(component => ({ qty: component.quantity, item: component.name, itemId: component.itemId, sourceMap: component.sourceMap, writable: component.writable, status: component.status }));
  meta.credits = recipe.credits;
  meta.time = recipe.duration.label;
  meta.water = recipe.minimumWater;
  meta.prereq = recipe.prerequisiteTag;
}
const HUB_UPGRADE_TAGS = RECIPE_DATA.recipes.upgrades.map(recipe => recipe.upgradeTag);

const HUB_CATEGORY_LABELS = {
  terminals: 'Terminals (Functional)',
  welfare: 'Welfare (Comfort)',
  special: 'Special'
};

const MUTATION_ACTIONS = new Set(['quest-ready','set-resource','add-resource','set-level','apply-prestige','set-character-xp','set-detail-level','detail-prestige','set-detail-xp','apply-skills','bulk-hub','toggle-upgrade','add-upgrade-materials','weapon-build-add-part','weapon-build-add-bundle','set-weapon-xp','update-item','set-quantity','add-item','add-rig','add-rig-kit','set-faction','toggle-trader','collect-repair','craft-add-missing','craft-add-all']);
const DIRECT_MUTATION_IDS = new Set(['setWeaponReferenceButton','weaponBuildAddOwned','saveSettingsButton','clearDbKeyButton','createBackupButton']);
let mutationClock = null;
let mutationStartedAt = 0;
const mutationDisabledState = new Map();
function mutationControls() {
  return [...document.querySelectorAll('button')].filter(button => MUTATION_ACTIONS.has(button.dataset.action) || DIRECT_MUTATION_IDS.has(button.id) || button.dataset.mutation === 'true');
}
function setGlobalMutationBusy(busy, detail) {
  const status = document.getElementById('mutationStatus');
  const elapsed = document.getElementById('mutationElapsed');
  if (busy) {
    mutationStartedAt = Date.now();
    document.body.dataset.mutationActive = 'true';
    document.body.setAttribute('aria-busy', 'true');
    document.getElementById('mutationStatusLabel').textContent = detail.label;
    status.hidden = false;
    for (const control of mutationControls()) { mutationDisabledState.set(control, control.disabled); control.disabled = true; }
    mutationClock = setInterval(() => { elapsed.textContent = `${Math.floor((Date.now() - mutationStartedAt) / 1000)}s`; }, 1000);
  } else {
    clearInterval(mutationClock); mutationClock = null;
    document.body.removeAttribute('data-mutation-active'); document.body.removeAttribute('aria-busy');
    for (const [control, wasDisabled] of mutationDisabledState) if (control.isConnected) control.disabled = wasDisabled;
    mutationDisabledState.clear(); status.hidden = true; elapsed.textContent = '0s';
  }
}
function refreshSafetyStatus(...args) { return FW.refreshSafetyStatus?.(...args); }
function setSafetyValue(...args) { return FW.setSafetyValue?.(...args); }
FWAPI.configure({
  onMutationStart: detail => setGlobalMutationBusy(true, detail),
  onMutationEnd: () => { setGlobalMutationBusy(false); refreshSafetyStatus(); },
  onConnectionChange: connected => { document.getElementById('connectionBanner').hidden = connected; }
});
async function api(path, options = {}) {
  const result = await FWAPI.request(path, options);
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET' && result && result.afterIntegrity && result.afterIntegrity.passed) {
    setSafetyValue('safetyLastEdit', new Date().toLocaleTimeString(), 'good');
  }
  return result;
}

let appDialogResolve = null;
let appDialogReturnFocus = null;
function openAppDialog({ title, message, confirm = false, acceptLabel, tone = 'primary', icon }) {
  const dialog = document.getElementById('appDialog');
  appDialogReturnFocus = document.activeElement;
  document.getElementById('appDialogTitle').textContent = title;
  document.getElementById('appDialogMessage').textContent = message;
  const cancel = document.getElementById('appDialogCancel');
  const accept = document.getElementById('appDialogAccept');
  cancel.hidden = !confirm;
  const label = acceptLabel || (confirm ? 'Confirm' : 'Close');
  const acceptIcon = icon || (confirm ? 'check' : 'close');
  accept.innerHTML = `${actionIcon(acceptIcon)}${esc(label)}`;
  accept.className = tone === 'danger' ? 'danger-btn' : tone === 'warning' ? 'btn-warn' : 'btn-primary';
  dialog.returnValue = '';
  dialog.showModal();
  accept.focus();
  return new Promise(resolve => { appDialogResolve = resolve; });
}

function showNotice(message, title = 'Operation result') {
  document.getElementById('appAnnouncements').textContent = message;
  return openAppDialog({ title, message });
}

function confirmAction(message, { title = 'Confirm action', acceptLabel = 'Confirm', tone = 'primary', icon = 'check' } = {}) {
  return openAppDialog({ title, message, confirm: true, acceptLabel, tone, icon });
}

document.getElementById('appDialogAccept').addEventListener('click', () => document.getElementById('appDialog').close('accept'));
document.getElementById('appDialog').addEventListener('close', event => {
  const accepted = event.target.returnValue === 'accept';
  if (appDialogResolve) appDialogResolve(accepted);
  appDialogResolve = null;
  if (appDialogReturnFocus && appDialogReturnFocus.isConnected) {
    const returnTarget = appDialogReturnFocus;
    setTimeout(() => returnTarget.isConnected && returnTarget.focus(), 0);
  }
});

expose({
  esc,
  filterAndRank,
  cleanFallbackName,
  debounce,
  readIntegerInput,
  validateInteger,
  technicalDetails,
  itemTypeIcon,
  appIcon,
  actionIcon,
  itemCategoryPills,
  showToast,
  receiptHtml,
  setOperationFeedback,
  operationFeedbackFor,
  filterSummaryHtml,
  showLoading,
  setRenderedHtml,
  setLocalBusy,
  CHARACTER_META,
  PRESTIGE_CAP_LEVEL,
  PRESTIGE_MAX_FOR_WARNING,
  PRESTIGE_XP_CAP,
  prestigeBonus,
  HUB_UPGRADE_META,
  HUB_UPGRADE_RECIPES,
  HUB_UPGRADE_TAGS,
  HUB_CATEGORY_LABELS,
  api,
  openAppDialog,
  showNotice,
  confirmAction
});

