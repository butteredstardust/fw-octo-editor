import { FW, expose } from '../runtime.mjs';

// validateInteger is used for the preset-supplied score path (the trust tier
// buttons pass data-value); it was missing here, so every tier preset threw
// "validateInteger is not defined" instead of setting the score.
const { api, esc, appIcon, actionIcon, readIntegerInput, validateInteger, setOperationFeedback, showLoading, setRenderedHtml, confirmAction, technicalDetails, WEAPON_META, userMessage, loadErrorHtml } = FW;
function loadDashboard(...args) { return FW.loadDashboard(...args); }
function describeItem(...args) { return FW.describeItem(...args); }

const TRUST_PRESETS = {
  untrusted: -1000,
  neutral: 50000,
  trusted: 239000
};

// Canonical vendor roster per the FW wiki (https://theforeverwinter.wiki.gg/wiki/Vendors).
// The save only stores Trader.Kane/Luca unlock flags; the Scavenger vendors
// (Bunco, Slade, Heisenburg, Bundleton) are default/water-unlock and have no
// flag, while Auto-Vendor lives in the Tunnels and is never in the hub save.
// availability: default (always present), water (water-tank unlock),
//               flag (toggled via UserSettings), auto (Tunnels, not in save).
const VENDOR_ROSTER = [
  { name: 'Heisenburg', faction: 'Scavengers', scope: 'Scope.Faction.ScavengerNPC', availability: 'default', note: 'Sells medical supplies & consumables.' },
  { name: 'Slade',      faction: 'Scavengers', scope: 'Scope.Faction.ScavengerNPC', availability: 'default', note: 'Offers recruits for hire.' },
  { name: 'Bunco',      faction: 'Scavengers', scope: 'Scope.Faction.ScavengerNPC', availability: 'default', note: 'Sells all ammo types & consumables.' },
  { name: 'Bundleton',  faction: 'Scavengers', scope: 'Scope.Faction.ScavengerNPC', availability: 'water',   note: 'Sells rigs, container modules, large equipment (16 days water).' },
  { name: 'Auto-Vendor',faction: 'Scavengers', scope: 'Scope.Faction.ScavengerNPC', availability: 'auto',    note: 'Found in the Tunnels — not stored in the save.' },
  { name: 'Luca',       faction: 'Europa',     scope: 'Scope.Faction.Europa',     availability: 'flag',    note: 'Sells Europa weapons/ammo (11 days water).' },
  { name: 'Kane',       faction: 'Eurasia',    scope: 'Scope.Faction.Eurasia',    availability: 'flag',    note: 'Sells Eurasia weapons/ammo (4 days water).' },
  { name: 'Vladelets',  faction: 'Euruska',    scope: 'Scope.Faction.Euruska',    availability: 'default', note: 'SPETSNAZ quest giver (СПЕЦHAЗ Commission).' }
];

// What each vendor is best known for selling, used to pick a representative
// app-icon (see VENDOR_ROSTER notes above for the full description).
const VENDOR_ICON = {
  Heisenburg: 'medic',
  Slade: 'runner',
  Bunco: 'ammo',
  Bundleton: 'pack',
  'Auto-Vendor': 'robot',
  Luca: 'weapon',
  Kane: 'weapon',
  Vladelets: 'quest'
};

function trustTier(score) {
  if (score >= 150000) return 'trusted';
  if (score >= 0) return 'neutral';
  return 'untrusted';
}

function trustProgress(score) {
  const n = Number(score) || 0;
  if (n < 0) return Math.max(0, Math.min(33, ((n - TRUST_PRESETS.untrusted) / (0 - TRUST_PRESETS.untrusted)) * 33));
  if (n < 150000) return 33 + Math.min(33, (n / 150000) * 33);
  return 66 + Math.min(34, ((n - 150000) / (TRUST_PRESETS.trusted - 150000)) * 34);
}

function trustTrack(score) {
  const pct = trustProgress(score);
  return `<div class="trust-track" role="img" aria-label="Faction trust: ${esc(TRUST_TIER_LABEL[trustTier(score)])}; score ${Number(score).toLocaleString()}">
    <div class="trust-track-bar"><span style="width:${pct.toFixed(1)}%"></span><i style="left:${pct.toFixed(1)}%"></i></div>
    <div class="trust-track-labels"><span>Untrusted</span><span>Neutral</span><span>Trusted</span></div>
  </div>`;
}

const TRUST_TIER_LABEL = { untrusted: 'Untrusted (I)', neutral: 'Neutral (II)', trusted: 'Trusted (III)' };

async function loadVendors() {
  const el = document.getElementById('vendorsList');
  showLoading(el, 5, 'Loading vendors');
  try {
    const data = await api('/vendors');
    renderVendors(data);
  } catch (err) {
    el.innerHTML = loadErrorHtml('vendors', err);
  }
}

// NPCVendorTypes rows are the 6 shop-type vendors, a separate/narrower table
// from VENDOR_ROSTER's wiki-named NPCs (which internal row is "Kane" vs
// "Luca" isn't derivable from the save, so this deliberately shows the raw
// vendor name rather than guessing a mapping to the roster above).
function prettyVendorName(name) {
  return String(name).replace(/_V\d+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function vendorItemLabel(itemId) {
  const meta = WEAPON_META[itemId];
  return meta ? meta.name : describeItem(itemId).wiki;
}

function renderVendorEconomy(economy) {
  if (!economy || !Array.isArray(economy.vendors) || !economy.vendors.length) return '';
  const rows = economy.vendors.map(v => {
    const detail = v.lastReset ? `Last restocked ${new Date(v.lastReset).toLocaleString()}` : 'Never restocked yet';
    const items = v.consumedItems.length
      ? v.consumedItems.map(c => `<span class="stat-chip">${esc(vendorItemLabel(c.itemId))}<b>&times;${c.quantity}</b></span>`).join('')
      : '<span class="dash-empty">Nothing sold to this vendor yet</span>';
    return `<div class="stats-row"><div class="stats-row-main"><div class="stats-row-name">${esc(prettyVendorName(v.name))}</div><div class="stats-row-detail">${esc(detail)}</div></div><div class="stats-chips">${items}</div></div>`;
  }).join('');
  const overdue = economy.nextResetEvent && new Date(economy.nextResetEvent) < new Date();
  const eventNote = economy.nextResetEvent
    ? `<p class="char-hint">The save's shared restock event (one timer covering multiple shops) last pointed to ${esc(new Date(economy.nextResetEvent).toLocaleString())}${overdue ? ' — already elapsed, so a restock is due next time you play' : ''}. There's no separate per-vendor countdown recorded in the save.</p>`
    : '';
  return `<div class="vendor-section-title">Vendor stock</div>${eventNote}${rows}`;
}

function renderVendors(data) {
  const el = document.getElementById('vendorsList');
  const factions = data.factions || [];
  const traders = data.traders || [];

  // faction scope -> score/tier lookup
  const factionByScope = {};
  for (const f of factions) factionByScope[f.scope] = f;

  // live unlock flags (Kane/Luca) keyed by simple name
  const traderUnlocked = {};
  for (const t of traders) {
    if (t.key.startsWith('Trader.')) {
      const name = t.key.replace(/^Trader\./, '').replace(/\.Unlocked$/, '');
      traderUnlocked[name] = t.unlocked;
    }
  }

  let html = '';

  // ---- Vendor roster (wiki-canonical) ----
  html += '<div class="vendor-section-title">Vendors</div>';
  html += '<div class="trader-grid">';
  const roster = [...VENDOR_ROSTER].sort((a, b) =>
    a.faction === b.faction ? a.name.localeCompare(b.name) : a.faction.localeCompare(b.faction));
  for (const v of roster) {
    const faction = factionByScope[v.scope];
    const tier = faction ? TRUST_TIER_LABEL[trustTier(faction.score)] : '';
    let status, statusCls;
    if (v.availability === 'auto') { status = 'Tunnels (auto)'; statusCls = 'auto'; }
    else if (v.availability === 'water') { status = 'Water-tank unlock'; statusCls = 'water'; }
    else if (v.availability === 'flag') {
      const on = traderUnlocked[v.name];
      status = on ? 'Unlocked' : 'Locked';
      statusCls = on ? 'on' : 'off';
    } else { status = 'Available'; statusCls = 'on'; }
    html += `<article class="trader-card">
      <div class="trader-card-head"><span class="trader-name-wrap"><span class="trader-icon">${appIcon(VENDOR_ICON[v.name])}</span><span class="tname">${esc(v.name)}</span></span><span class="trader-status ${statusCls}">${esc(status)}</span></div>
      <div class="trader-faction">${esc(v.faction)}${tier ? ` · ${esc(tier)}` : ''}</div>
      <p class="vendor-note">${esc(v.note)}</p>
    </article>`;
  }
  html += '</div>';

  html += renderVendorEconomy(data.economy);

  // ---- Faction Trust ----
  html += '<div class="vendor-section-title">Faction trust</div>';
  html += '<div class="vendor-grid">';
  for (const f of factions) {
    const tier = trustTier(f.score);
    const enc = encodeURIComponent(f.scope);
    html += `<div class="vendor-card">
      <div class="vendor-head">
        <div class="vendor-head-main">
          <span class="vendor-icon">${appIcon('shield')}</span>
          <div>
            <div class="vendor-name">${esc(f.faction)} ${technicalDetails(f.scope, 'Show internal faction scope ID')}</div>
          </div>
        </div>
        <span class="vendor-tier ${tier}">${TRUST_TIER_LABEL[tier]}</span>
      </div>
      ${trustTrack(f.score)}
      <div class="vendor-score">
        <input type="number" id="vscore-${enc}" value="${f.score}" min="-2147483648" max="2147483647" step="1">
        <button class="vendor-set icon-only" data-action="set-faction" data-scope="${enc}" title="Set trust score for ${esc(f.faction)}">${actionIcon('check')}<span class="sr-only">Set score</span></button>
      </div>
      <div class="vendor-presets">
        <button class="mini tier-preset untrusted" data-action="set-faction" data-scope="${enc}" data-value="${TRUST_PRESETS.untrusted}">Untrusted</button>
        <button class="mini tier-preset neutral" data-action="set-faction" data-scope="${enc}" data-value="${TRUST_PRESETS.neutral}">Neutral</button>
        <button class="mini tier-preset trusted" data-action="set-faction" data-scope="${enc}" data-value="${TRUST_PRESETS.trusted}">Trusted</button>
      </div>
    </div>`;
  }
  html += '</div>';

  // ---- Trader unlock toggles (Kane/Luca) ----
  const traderRows = traders.filter(t => !t.key.startsWith('Questgiver.') && t.key.startsWith('Trader.'));
  if (traderRows.length) {
    html += '<div class="vendor-section-title">Vendor unlock</div>';
    html += '<div class="trader-grid">';
    for (const t of traderRows) {
      const label = t.key.replace(/^Trader\./, '').replace(/\.Unlocked$/, '');
      html += `<div class="trader-card trader-card-toggle">
        <span class="trader-name-wrap"><span class="trader-icon">${appIcon(VENDOR_ICON[label])}</span><span class="tname">${esc(label)}</span></span>
        <button class="trader-toggle ${t.unlocked ? 'on' : ''}" data-action="toggle-trader" data-key="${encodeURIComponent(t.key)}" aria-pressed="${t.unlocked ? 'true' : 'false'}">${t.unlocked ? actionIcon('unlock') + 'Unlocked' : actionIcon('lock') + 'Locked'}</button>
      </div>`;
    }
    html += '</div>';
  }
  setRenderedHtml(el, html);
}

async function setFactionScore(encScope, scoreValue) {
  const scope = decodeURIComponent(encScope);
  const score = scoreValue != null ? validateInteger(scoreValue, 'Faction score', { min: -2147483648, max: 2147483647 }) : readIntegerInput(document.getElementById(`vscore-${encScope}`), 'Faction score', { min: -2147483648, max: 2147483647 });
  const result = await api(`/vendors/faction/${encodeURIComponent(scope)}`, {
    method: 'PUT',
    body: JSON.stringify({ score })
  });
  if (!result.success) { setOperationFeedback('vendorsOperationStatus', 'Faction score failed verification.', result, 'error'); return; }
  setOperationFeedback('vendorsOperationStatus', `Faction score set to ${score.toLocaleString()}.`, result, 'success');
  loadVendors();
}

async function toggleTrader(btn, encKey) {
  const key = decodeURIComponent(encKey);
  const label = key.replace(/^Trader\./, '').replace(/\.Unlocked$/, '');
  const currentlyOn = btn && btn.classList.contains('on');
  const unlocked = !(currentlyOn);
  const ok = unlocked
    ? await confirmAction(`Unlock ${label}?`, { title: 'Unlock vendor?', acceptLabel: 'Unlock vendor', icon: 'unlock' })
    : await confirmAction(`Lock ${label}? Their shop becomes unavailable until you unlock it again.`, { title: 'Lock vendor?', acceptLabel: 'Lock vendor', tone: 'danger', icon: 'lock' });
  if (!ok) return;
  const result = await api(`/vendors/trader/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ unlocked })
  });
  if (!result.success) { setOperationFeedback('vendorsOperationStatus', 'Trader update failed verification.', result, 'error'); return; }
  setOperationFeedback('vendorsOperationStatus', `Trader ${unlocked ? 'unlocked' : 'locked'}.`, result, 'success');
  loadVendors();
}

// ---- Repair Bench ----

// Exact Repair Bench recipes (per https://theforeverwinter.wiki.gg/wiki/Repair_Bench).
// product: friendly name; broken: internal tag of the destroyed weapon counterpart
// (from the conversion table); iff: required faction IFF internal tag; iffQty: count.
// Note: M16 uses 2x destroyed counterpart per the wiki recipe.
const REPAIR_RECIPES = [
  { product: 'Grenade Launcher', broken: 'GRL01_Broken', iff: 'IFF_Europa_03', iffQty: 2 },
  { product: 'XM25', broken: 'GRL02_Broken', iff: 'IFF_Eurasia_03', iffQty: 3 },
  { product: 'Painless', broken: 'HMG01_Broken', iff: 'IFF_Eurasia_03', iffQty: 3 },
  { product: 'SCAR', broken: 'HRF01_Broken', iff: 'IFF_Europa_02', iffQty: 1 },
  { product: '36M AntiTank', broken: 'HRF02_REAL_Broken', iff: 'IFF_Europa_02', iffQty: 2 },
  { product: 'NTW-20', broken: 'HRF03_Broken', iff: 'IFF_Eurasia_02', iffQty: 2 },
  { product: 'GM6', broken: 'HRF04_Broken', iff: 'IFF_Eurasia_02', iffQty: 1 },
  { product: 'MG34', broken: 'LMG01_Broken', iff: 'IFF_Europa_02', iffQty: 1 },
  { product: 'SAW', broken: 'LMG02_Broken', iff: 'IFF_Europa_03', iffQty: 1 },
  { product: 'M60', broken: 'LMG03_Broken', iff: 'IFF_Europa_02', iffQty: 2 },
  { product: 'RPD', broken: 'LMG04_Broken', iff: 'IFF_Euruskan_03', iffQty: 1 },
  { product: 'USP', broken: 'PST01_Broken', iff: 'IFF_Europa_02', iffQty: 1 },
  { product: 'SOG', broken: 'PST02_Broken', iff: 'IFF_Europa_02', iffQty: 1 },
  { product: '87 Target', broken: 'PST03_Broken', iff: 'IFF_Europa_01', iffQty: 2 },
  { product: 'C96', broken: 'PST04_Broken', iff: 'IFF_Europa_01', iffQty: 1 },
  { product: 'R8', broken: 'PST05_Broken', iff: 'IFF_Europa_01', iffQty: 2 },
  { product: 'Viper', broken: 'PST06_Broken', iff: 'IFF_Europa_02', iffQty: 1 },
  { product: 'M79 Sawed-off', broken: 'PST07_Broken', iff: 'IFF_Europa_03', iffQty: 1 },
  { product: 'G-L 19', broken: 'PST10_Broken', iff: 'IFF_Europa_01', iffQty: 1 },
  { product: 'AK', broken: 'RFL01_Broken', iff: 'IFF_Euruskan_01', iffQty: 1 },
  { product: 'RPK', broken: 'RFL01B_Broken', iff: 'IFF_Euruskan_02', iffQty: 2 },
  { product: 'M4A1', broken: 'RFL12_Broken', iff: 'IFF_Europa_01', iffQty: 1 },
  { product: 'SA58', broken: 'RFL15_Broken', iff: 'IFF_Europa_01', iffQty: 1 },
  { product: 'G36', broken: 'RFL16_Broken', iff: 'IFF_Europa_01', iffQty: 2 },
  { product: 'R11 RSASS', broken: 'RFL19_Broken', iff: 'IFF_Europa_01', iffQty: 1 },
  { product: 'SVD', broken: 'RFL20_Broken', iff: 'IFF_Euruskan_02', iffQty: 2 },
  { product: 'M16', broken: 'RFL23_Broken', iff: 'IFF_Europa_01', iffQty: 1, brokenQty: 2 },
  { product: 'VKS Vykhlop', broken: 'RFL29_Broken', iff: 'IFF_Euruskan_01', iffQty: 2 },
  { product: 'TKB-0146', broken: 'RFL30_Broken', iff: 'IFF_Euruskan_01', iffQty: 2 },
  { product: 'S12', broken: 'SHG01_Broken', iff: 'IFF_Europa_01', iffQty: 1 },
  { product: 'USAS-12', broken: 'SHG03_Broken', iff: 'IFF_Eurasia_03', iffQty: 2 },
  { product: 'VEPR-12', broken: 'SHG04_Broken', iff: 'IFF_Eurasia_03', iffQty: 2 },
  { product: 'AA12', broken: 'SHG05_Broken', iff: 'IFF_Europa_03', iffQty: 2 },
  { product: 'Kriss Vector 45', broken: 'SMG01_Broken', iff: 'IFF_Europa_02', iffQty: 1 },
  { product: 'PPSH-41', broken: 'SMG02_Broken', iff: 'IFF_Euruskan_01', iffQty: 2 },
  { product: 'PM-9', broken: 'SMG03_Broken', iff: 'IFF_Eurasia_02', iffQty: 1 },
  { product: 'WLT MPL', broken: 'SMG04_Broken', iff: 'IFF_Eurasia_01', iffQty: 1 },
  { product: 'APC9 Pro', broken: 'SMG05_Broken', iff: 'IFF_Europa_02', iffQty: 1 },
  { product: 'P90', broken: 'SMG06_Broken', iff: 'IFF_Europa_02', iffQty: 2 },
  { product: 'PP-19 Vityaz', broken: 'SMG07_Broken', iff: 'IFF_Euruskan_01', iffQty: 1 },
  { product: 'Spectre M4', broken: 'SMG08_Broken', iff: 'IFF_Europa_02', iffQty: 2 }
];

// Friendly labels for faction IFF chips (internal tag -> display).
const IFF_LABELS = {
  IFF_Eurasia_01: { name: 'Eurasian IFF Chip LVL1', faction: 'Eurasia', level: 1 },
  IFF_Eurasia_02: { name: 'Eurasian IFF Chip LVL2', faction: 'Eurasia', level: 2 },
  IFF_Eurasia_03: { name: 'Eurasian IFF Chip LVL3', faction: 'Eurasia', level: 3 },
  IFF_Europa_01: { name: 'Europan IFF Chip LVL1', faction: 'Europa', level: 1 },
  IFF_Europa_02: { name: 'Europan IFF Chip LVL2', faction: 'Europa', level: 2 },
  IFF_Europa_03: { name: 'Europan IFF Chip LVL3', faction: 'Europa', level: 3 },
  IFF_Euruskan_01: { name: 'Euruskan IFF Chip LVL1', faction: 'Euruskan', level: 1 },
  IFF_Euruskan_02: { name: 'Euruskan IFF Chip LVL2', faction: 'Euruskan', level: 2 },
  IFF_Euruskan_03: { name: 'Euruskan IFF Chip LVL3', faction: 'Euruskan', level: 3 }
};

let _repairTimer = null;       // setInterval handle
let _repairData = null;        // last fetched status, for live countdown

function formatDuration(ms) {
  const neg = ms < 0;
  ms = Math.abs(ms);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const str = `${h}:${pad(m)}:${pad(s)}`;
  return neg ? str : str;
}

function renderRepairStatus(data) {
  _repairData = data;
  const el = document.getElementById('repairStatus');

  const bench = data.benchUnlocked
    ? `<span class="repair-badge ok">Unlocked ✓</span>`
    : `<span class="repair-badge missing">Not built — needs Repair Bench upgrade</span>`;

  // Active repair job panel.
  let repairPanel;
  if (!data.repair) {
    repairPanel = `
      <div class="repair-status-line"><span class="repair-status-label">Status</span>
        <span class="repair-status-val"><span class="repair-badge idle">Idle — bench free</span></span></div>
      <div class="repair-timer idle" id="repairCountdown">—</div>
      <p class="char-hint" style="margin-top:.6rem">No repair running. Start one in-game at the bench; this page tracks the timer and lets you finish/collect it.</p>`;
  } else {
    const r = data.repair;
    const badge = r.ready
      ? `<span class="repair-badge done">Ready to collect</span>`
      : `<span class="repair-badge active">Repair in progress</span>`;
    const cdId = 'repairCountdown';
    const timeLabel = r.ready ? 'Finished' : 'Finishes in';
    repairPanel = `
      <div class="repair-status-line"><span class="repair-status-label">Status</span>
        <span class="repair-status-val">${badge}</span></div>
      <div class="repair-status-line"><span class="repair-status-label">${timeLabel}</span>
        <span class="repair-status-val">${new Date(r.completionIso).toLocaleString()}</span></div>
      <div class="repair-timer ${r.ready ? 'done' : ''}" id="${cdId}">${formatDuration(r.remainingMs)}</div>`;
  }

  // IFF chips — each faction/level combo gets its own small card (rather than
  // one tall list) so they wrap into the available width instead of forcing
  // the whole sidebar, and the Active Repair Job panel it sits beside, tall.
  // Also note how many repairable weapons need each chip.
  const iffNeedCount = {};
  for (const rec of REPAIR_RECIPES) iffNeedCount[rec.iff] = (iffNeedCount[rec.iff] || 0) + 1;
  const iffCards = data.iffs.map(f => {
    const meta = IFF_LABELS[f.tag] || { name: f.tag, faction: '', level: '' };
    const zero = f.quantity <= 0;
    const neededFor = iffNeedCount[f.tag] || 0;
    return `<div class="iff-card ${zero ? 'zero' : ''}">
      <div class="iff-card-head">
        <span class="iff-card-name">${esc(meta.faction)} LVL${esc(meta.level)}</span>
        <span class="iff-card-qty ${zero ? 'zero' : ''}">${esc(f.quantity)}</span>
      </div>
      <div class="iff-card-meta">${esc(meta.name)}</div>
      ${neededFor ? `<div class="iff-card-used">used by ${esc(neededFor)} weapon(s)</div>` : ''}
    </div>`;
  }).join('');

  // Repairable-weapon cards (view-only replica of the in-game bench grid).
  const benchBusy = data.repair != null; // a job is in progress or ready to collect
  const iffQty = {};
  for (const f of data.iffs) iffQty[f.tag] = f.quantity;
  const brokenQty = data.destroyed || {};

  const repairCards = REPAIR_RECIPES.map(r => {
    const needBroken = r.brokenQty || 1;
    const haveBroken = (brokenQty[r.broken] || 0) >= needBroken;
    const haveIff = (iffQty[r.iff] || 0) >= r.iffQty;
    const reasons = [];
    if (benchBusy) reasons.push('bench occupied');
    if (!haveBroken) reasons.push('no destroyed counterpart');
    if (!haveIff) reasons.push('not enough IFF');
    const ok = !benchBusy && haveBroken && haveIff;
    const iffMeta = IFF_LABELS[r.iff] || { name: r.iff, faction: '', level: '' };
    return { ok, html: `
      <div class="repair-card ${ok ? 'ok' : 'no'}">
        <div class="repair-card-head">
          <span class="repair-card-name">${esc(r.product)}</span>
          <span class="repair-card-dot ${ok ? 'ok' : 'no'}"></span>
        </div>
        <div class="repair-req-chips">
          <span class="repair-chip ${haveBroken ? 'ok' : 'no'}">Destroyed: ${haveBroken ? 'yes' : 'no'} (${brokenQty[r.broken] || 0}${needBroken > 1 ? '/' + needBroken : ''})</span>
          <span class="repair-chip ${haveIff ? 'ok' : 'no'}">${esc(iffMeta.faction)} LVL${esc(iffMeta.level)} IFF: ${haveIff ? 'yes' : 'no'} (${esc(iffQty[r.iff] || 0)}/${esc(r.iffQty)})</span>
        </div>
        <div class="repair-card-status ${ok ? 'ok' : 'no'}">${ok ? '✓ Ready to repair' : reasons.join(' · ')}</div>
      </div>` };
  });
  repairCards.sort((a, b) => Number(b.ok) - Number(a.ok));
  const readyCount = repairCards.filter(card => card.ok).length;
  const cards = repairCards.map(card => card.html).join('');
  const ownedIffs = data.iffs.filter(f => f.quantity > 0).length;

  // Once the repair is ready, this app has nothing left to do -- it can only
  // fast-forward the TimedEvents timer, never perform the actual in-game
  // collection. So "Collect Repair" is disabled at that point rather than
  // implying a click here finishes the job.
  const canCollect = data.repair != null && !data.repair.ready;
  const collectLabel = (data.repair && data.repair.ready) ? 'Collect Repair' : 'Set Complete';
  const collectNote = (data.repair && data.repair.ready)
    ? 'The repair is finished — collect it in-game to free the bench for the next job. This tool can only fast-forward the timer, not perform the in-game collection.'
    : (data.repair ? 'Fast-forwards the in-progress timer so the item is ready to collect.' : '');

  el.innerHTML = `
    <div class="repair-summary" aria-label="Repair bench summary">
      <div class="repair-metric"><span>Bench</span><strong>${data.repair ? (data.repair.ready ? 'Ready' : 'Busy') : 'Idle'}</strong></div>
      <div class="repair-metric"><span>Ready recipes</span><strong>${readyCount}<small> / ${REPAIR_RECIPES.length}</small></strong></div>
      <div class="repair-metric"><span>IFF types owned</span><strong>${ownedIffs}<small> / ${data.iffs.length}</small></strong></div>
    </div>
    <div class="repair-grid">
      <section class="repair-panel repair-job-panel">
        <h3>Active Repair Job</h3>
        ${repairPanel}
        <div class="repair-actions">
          <button class="danger" ${canCollect ? '' : 'disabled'} data-action="collect-repair">${actionIcon('collect')}${collectLabel}</button>
        </div>
        ${collectNote ? `<p class="char-hint" style="margin-top:.6rem">${collectNote}</p>` : ''}
      </section>
      <section class="repair-panel repair-bench-panel">
        <h3>Workbench</h3>
        <div class="repair-status-line"><span class="repair-status-label">Repair Bench</span><span class="repair-status-val">${bench}</span></div>
        <p class="char-hint" style="margin-top:.75rem">A repair needs a <b>destroyed weapon item</b> plus the <b>IFF chip</b> of that weapon's origin faction. (See Faction IFF Chips below for what you have on hand.)</p>
      </section>
    </div>
    <div class="repair-cards-wrap">
      <div class="repair-list-head"><div><h3>Faction IFF Chips</h3><p class="char-hint">Repairing a destroyed weapon needs the IFF of its origin faction. "used by N weapon(s)" counts the recipes that require that chip.</p></div></div>
      <div class="iff-grid">${iffCards}</div>
    </div>
    <div class="repair-cards-wrap">
      <div class="repair-list-head"><div><h3>Repairable Weapons <span class="repair-count">${REPAIR_RECIPES.length} recipes</span></h3><p class="char-hint">Ready recipes appear first. Repairs are started in-game.</p></div><span class="repair-ready-total">${readyCount} ready now</span></div>
      <div class="repair-cards">${cards}</div>
    </div>`;

  // Start/refresh the live countdown.
  if (_repairTimer) clearInterval(_repairTimer);
  _repairTimer = setInterval(() => tickRepairCountdown(), 1000);
}

function tickRepairCountdown() {
  const cd = document.getElementById('repairCountdown');
  if (!cd || !_repairData || !_repairData.repair) return;
  const r = _repairData.repair;
  const remaining = r.completionIso ? (new Date(r.completionIso).getTime() - Date.now()) : 0;
  if (remaining > 0) {
    cd.textContent = formatDuration(remaining);
    cd.className = 'repair-timer';
  } else {
    cd.textContent = 'Ready to collect';
    cd.className = 'repair-timer done';
  }
}

async function loadRepair() {
  const el = document.getElementById('repairStatus');
  showLoading(el, 4, 'Loading repair bench');
  try {
    const data = await api('/repair');
    renderRepairStatus(data);
  } catch (err) {
    el.innerHTML = loadErrorHtml('the repair bench', err);
  }
}

async function collectRepair() {
  if (!await confirmAction('Skips ahead so the current repair is ready to collect now. This does not change your inventory or weapons.', { title: 'Finish repair?', acceptLabel: 'Finish repair', icon: 'collect' })) return;
  const result = await api('/repair/collect', { method: 'POST' });
  if (!result.success) {
    setOperationFeedback('repairOperationStatus', 'Repair collection failed verification.', result, 'error');
    return;
  }
  setOperationFeedback('repairOperationStatus', 'Repair finished and is ready to collect.', result, result.afterIntegrity.passed ? 'success' : 'error');
  loadRepair();
}

// EXPERIMENTAL: tell the game a quest's conditions are met (Quests.Status = 2).
// The game then shows the turn-in prompt; you still open the game to hand it in.
async function markQuestReady(questId) {
  if (!await confirmAction('Marks this quest ready to turn in. You still need to open the game to turn it in and get the reward.', { title: 'Mark quest ready?', acceptLabel: 'Mark ready', tone: 'warning', icon: 'check' })) return;
  try {
    const result = await api(`/quests/${questId}/ready`, { method: 'POST' });
    if (!result.success) {
      setOperationFeedback('dashboardOperationStatus', 'Quest update failed verification.', result, 'error');
      return;
    }
    setOperationFeedback('dashboardOperationStatus', `Quest ${questId} is marked ready. Open the game to turn it in.`, result, result.afterIntegrity.passed ? 'success' : 'error');
    loadDashboard();
  } catch (e) {
    setOperationFeedback('dashboardOperationStatus', userMessage(e, 'The quest could not be marked ready.'), e.payload, 'error', e);
  }
}

expose({ loadVendors, setFactionScore, toggleTrader, loadRepair, collectRepair, markQuestReady });

// ---- Settings page ----
// Lets the user optionally override the save directory. Keys are loaded from
// the local application resource and are never accepted by this settings UI.

