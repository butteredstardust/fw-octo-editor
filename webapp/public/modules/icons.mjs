import { esc } from './dom.mjs';

// Locally owned, dependency-free inventory icon set. Icons are decorative;
// adjacent text always carries the category name for assistive technology.
export function itemTypeIcon(category, subtype = '') {
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
export function actionIcon(name, className = '') {
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

export function appIcon(name, className = '') {
  const key = APP_ICON_ALIASES[name] || name || 'generic';
  const path = APP_ICON_PATHS[key] || APP_ICON_PATHS.generic;
  return `<span class="app-icon ${esc(className)}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${path}</svg></span>`;
}

export function itemCategoryPills(category, subtype, source) {
  const values = [category, subtype, source && source !== 'Items' ? source : ''].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  return `<span class="item-taxonomy">${values.map((value, index) => `<span class="item-pill ${index ? 'secondary' : ''}">${esc(value)}</span>`).join('')}</span>`;
}
