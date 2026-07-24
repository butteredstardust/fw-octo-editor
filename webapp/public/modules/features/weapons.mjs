import { FW, expose } from '../runtime.mjs';

const { api, esc, appIcon, actionIcon, technicalDetails, itemTypeIcon, readIntegerInput, setOperationFeedback, confirmAction, showLoading, setRenderedHtml, filterAndRank, filterSummaryHtml, showToast } = FW;

const WEAPON_META = {
  'PST01': { name: 'USP', cat: 'Pistols' },
  'PST02': { name: 'SOG', cat: 'Pistols' },
  'PST03': { name: '87 Target', cat: 'Pistols' },
  'PST04': { name: 'C96', cat: 'Pistols' },
  'PST05': { name: 'R8', cat: 'Pistols' },
  'PST06': { name: 'Viper', cat: 'Pistols' },
  'PST07': { name: 'M79 Sawed-off', cat: 'Pistols / Grenade Launchers' },
  'PST08': { name: 'Mateo Model J', cat: 'Pistols' },
  'PST10': { name: 'G-L 19', cat: 'Pistols' },
  'RFL01': { name: 'AK', cat: 'Rifles' },
  'RFL01.AKFamily': { name: 'AK', cat: 'Rifles' },
  'RFL01A': { name: 'AK (variant)', cat: 'Rifles' },
  'RFL01A_Surplus': { name: 'Surplus Rifle', cat: 'Rifles / Surplus' },
  'RFL02': { name: 'VH-Ambi 2', cat: 'Rifles' },
  'RFL05': { name: 'VIK-32L', cat: 'Rifles' },
  'RFL10': { name: '47 TYP', cat: 'Rifles' },
  'RFL12': { name: 'M4A1', cat: 'Rifles' },
  'RFL15': { name: 'SA58', cat: 'Rifles' },
  'RFL16': { name: 'G36', cat: 'Rifles' },
  'RFL19': { name: 'R11 RSASS', cat: 'Rifles' },
  'RFL20': { name: 'SVD', cat: 'Rifles' },
  'RFL23': { name: 'M16', cat: 'Rifles' },
  'RFL29': { name: 'VKS Vykhlop', cat: 'Rifles' },
  'RFL30': { name: 'TKB-0146', cat: 'Rifles' },
  'HRF01': { name: 'SCAR', cat: 'Heavy Rifles' },
  'HRF02': { name: '36M AntiTank', cat: 'Heavy Rifles' },
  'HRF03': { name: 'NTW-20', cat: 'Heavy Rifles' },
  'HRF04': { name: 'GM6', cat: 'Heavy Rifles' },
  'HRF05': { name: 'AT-43 MASS', cat: 'Heavy Rifles' },
  'LMG01': { name: 'MG34', cat: 'Light Machinegun' },
  'LMG02': { name: 'SAW', cat: 'Light Machinegun' },
  'LMG03': { name: 'M60', cat: 'Light Machinegun' },
  'LMG04': { name: 'RPD', cat: 'Light Machinegun' },
  'LMG06': { name: 'LMG-P', cat: 'Light Machinegun' },
  'HMG01': { name: 'Painless', cat: 'Heavy Machinegun' },
  'SHG01': { name: 'S12', cat: 'Shotguns' },
  'SHG02': { name: 'Surplus Shotgun', cat: 'Shotguns / Surplus' },
  'SHG02_Surplus': { name: 'Surplus Shotgun', cat: 'Shotguns / Surplus' },
  'SHG03': { name: 'USAS-12', cat: 'Shotguns' },
  'SHG04': { name: 'VEPR-12', cat: 'Shotguns' },
  'SHG05': { name: 'AA12', cat: 'Shotguns' },
  'SHG06': { name: 'CLAW', cat: 'Shotguns' },
  'SMG01': { name: 'Kriss Vector 45', cat: 'Submachine Guns' },
  'SMG02': { name: 'PPSH-41', cat: 'Submachine Guns' },
  'SMG03': { name: 'PM-9', cat: 'Submachine Guns' },
  'SMG04': { name: 'WLT MPL', cat: 'Submachine Guns' },
  'SMG05': { name: 'APC9 Pro', cat: 'Submachine Guns' },
  'SMG06': { name: 'P90', cat: 'Submachine Guns' },
  'SMG07': { name: 'PP-19 Vityaz', cat: 'Submachine Guns' },
  'SMG08': { name: 'Spectre M4', cat: 'Submachine Guns' },
  'SMG09': { name: 'PnP-2K', cat: 'Submachine Guns' },
  'GRL00': { name: 'Grenade Launcher (Throwable)', cat: 'Grenade Launchers' },
  'GRL01': { name: 'Grenade Launcher', cat: 'Grenade Launchers' },
  'GRL02': { name: 'XM25', cat: 'Grenade Launchers' },
  'GunHead.LMG04': { name: 'Gunhead LMG', cat: 'Gunhead' },
  'GunHead.SHG05': { name: 'Gunhead Shotgun', cat: 'Gunhead' },
  'GunHead.SMG05': { name: 'Gunhead SMG', cat: 'Gunhead' }
};

// Stat deltas come straight from wiki-derived floating point math (e.g.
// 0.03065625, 11.111111111111) and are unreadable rendered raw. Round to a
// sane display precision; whole numbers (damage, magazine) pass through.
function formatNum(v) {
  if (typeof v !== 'number' || !isFinite(v)) return v;
  return Math.round(v * 1000) / 1000;
}

// Human-friendly labels for the raw stat keys in weapon-builds.canonical.json
// (accuracy, adsSpeed, damage, fov, magazine, recoilArm, recoilWrist,
// reloadSpeed, rof, stability, stabilizationLength, stabilizationSpeed).
const STAT_LABELS = {
  accuracy: 'Accuracy', adsSpeed: 'ADS Speed', damage: 'Damage', fov: 'FOV', magazine: 'Magazine',
  recoilArm: 'Recoil (Arm)', recoilWrist: 'Recoil (Wrist)', reloadSpeed: 'Reload Speed', rof: 'Rate of Fire',
  stability: 'Stability', stabilizationLength: 'Stabilization (Length)', stabilizationSpeed: 'Stabilization (Speed)'
};

function weaponLabel(scope) {
  const suffix = scope.replace(/^Scope\.Weapon\./, '');
  const meta = WEAPON_META[suffix];
  if (meta) return meta;
  // Fallback: prettify the suffix (e.g. RFL01B -> RFL01B).
  return { name: suffix, cat: 'Other' };
}

let _weaponXp = [];
let _weaponRef = {};

// Fallback target used only when a weapon has no entry in the 100% reference
// save (so the bar/progress still has something to scale against).
const REFERENCE_XP_FALLBACK = 100000;

// Resolve the per-weapon reference (target) XP. Prefer the real value from the
// 100% reference save; fall back to a flat number otherwise.
function weaponTargetXp(weapon) {
  const ref = _weaponRef[weapon];
  return (ref != null && !isNaN(ref)) ? ref : REFERENCE_XP_FALLBACK;
}

let presetData=null;
async function loadPresets(){showLoading(document.getElementById('presetContent'),6,'Loading presets');try{presetData=await api('/presets');document.getElementById('presetType').value=sessionStorage.getItem('presetType')||'weapons';renderPresets();}catch(error){setRenderedHtml(document.getElementById('presetContent'),`<div class="empty-state"><strong>Error</strong><br>${esc(error.message)}</div>`);}}
function presetToken(row){return JSON.stringify(row).toLowerCase();}
function renderPresets(){if(!presetData)return;const q=document.getElementById('presetSearch').value.trim().toLowerCase(),type=document.getElementById('presetType').value,weaponRows=(type==='rigs'?[]:presetData.weapons).filter(row=>!q||presetToken(row).includes(q)).sort((a,b)=>(b.bisScore??-1)-(a.bisScore??-1)),rigRows=(type==='weapons'?[]:presetData.rigs).filter(row=>!q||presetToken(row).includes(q));const cards=[];for(const row of weaponRows)cards.push(`<article class="preset-card ${row.active?'is-active':''}"><header>${itemTypeIcon('weapon')}<div><span class="eyebrow">${esc(row.category)} · slot ${esc(row.saveIndex)}</span><h3>${esc(row.name)} ${technicalDetails(row.weaponId,'Show weapon technical ID')}</h3><p>${esc(row.weaponName)}</p></div><div class="preset-badges">${row.active?'<span class="preset-badge active">Active</span>':''}${row.bisScore!=null?`<span class="preset-badge score">BIS ${esc(row.bisScore)}</span>`:''}</div></header><div class="preset-parts">${row.attachments.map(part=>`<div class="preset-part ${part.placeholder?'placeholder':''}"><span>${esc(part.slot)}</span><b>${esc(part.name)}</b>${technicalDetails(part.itemId)}</div>`).join('')||'<p>No changed attachment overrides.</p>'}</div><footer>${row.bisSupported?`<span>${row.bisMatches} saved overrides match BIS</span><details><summary>${row.bisMissing.length} BIS parts not present in saved overrides</summary><ul>${row.bisMissing.map(part=>`<li>${esc(part.slot)}: ${esc(part.name)}</li>`).join('')}</ul></details>`:'<span>No supported BIS comparison.</span>'}</footer></article>`);for(const row of rigRows)cards.push(`<article class="preset-card"><header>${itemTypeIcon('rig equipment')}<div><span class="eyebrow">Rig preset · slot ${esc(row.saveIndex)}</span><h3>${esc(row.name)} ${technicalDetails(row.rigId,'Show rig technical ID')}</h3><p>${esc(row.rigName)}</p></div><div class="preset-badges">${row.active?'<span class="preset-badge active">Active</span>':''}</div></header><div class="preset-parts">${[...row.containers.map(part=>({...part,kind:'Container'})),...row.frames.map(part=>({...part,kind:'Frame'}))].map(part=>`<div class="preset-part"><span>${esc(part.kind)} ${esc(part.slot)}</span><b>${esc(part.name)}</b>${technicalDetails(part.itemId)}</div>`).join('')}</div></article>`);document.getElementById('presetStatus').textContent=`Showing ${cards.length} of ${presetData.summary.weaponPresets+presetData.summary.rigPresets} saved presets.`;setRenderedHtml(document.getElementById('presetContent'),`<div class="preset-summary"><strong>${presetData.summary.weaponPresets}</strong> weapon presets · <strong>${presetData.summary.rigPresets}</strong> rig presets · active: <strong>${esc(presetData.summary.activeWeaponPreset||'none')}</strong></div><div class="preset-grid">${cards.join('')||'<div class="empty-state"><strong>No presets match these filters</strong><br>Try a different filter.</div>'}</div>`);}

let weaponBuildData=null;
async function loadWeaponBuilds(){showLoading(document.getElementById('weaponBuildContent'),4,'Loading weapon builds');try{weaponBuildData=await api('/weapon-builds');const category=document.getElementById('weaponBuildCategory');category.innerHTML='<option value="">All categories</option>'+weaponBuildData.categories.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');category.value=sessionStorage.getItem('weaponBuildCategory')||'';renderWeaponBuildSelector();}catch(error){setRenderedHtml(document.getElementById('weaponBuildContent'),`<div class="empty-state"><strong>Error</strong><br>${esc(error.message)}</div>`);}}

// Weapons matching the current search + category filters (same rows feed
// both the <select> and the ranked list below it, so they always agree).
function filteredBuildWeapons() {
  if (!weaponBuildData) return [];
  const q = document.getElementById('weaponBuildSearch').value.toLowerCase();
  const category = document.getElementById('weaponBuildCategory').value;
  return weaponBuildData.weapons.filter(w => (!category || w.category === category) && (!q || `${w.name} ${w.id}`.toLowerCase().includes(q)));
}

function renderWeaponBuildSelector() {
  if (!weaponBuildData) return;
  sessionStorage.setItem('weaponBuildCategory', document.getElementById('weaponBuildCategory').value);
  const rows = filteredBuildWeapons();
  const select = document.getElementById('weaponBuildSelect'), wanted = sessionStorage.getItem('weaponBuildId');
  select.innerHTML = rows.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('');
  if (rows.some(w => w.id === wanted)) select.value = wanted;
  sessionStorage.setItem('weaponBuildId', select.value || '');
  renderWeaponBuildRanking(rows);
  renderWeaponBuild();
}

// Jump to a weapon from the ranked list without disturbing the current filters.
function selectWeaponBuild(id) {
  const select = document.getElementById('weaponBuildSelect');
  if (![...select.options].some(o => o.value === id)) return;
  select.value = id;
  sessionStorage.setItem('weaponBuildId', id);
  renderWeaponBuild();
  renderWeaponBuildRanking(filteredBuildWeapons());
}

// Ranked-by-score list of every weapon matching the current filters, so
// builds can be compared at a glance instead of stepping through the
// dropdown one weapon at a time. Uses build data already returned by
// /weapon-builds -- no extra requests.
function renderWeaponBuildRanking(rows) {
  const el = document.getElementById('weaponBuildRanking');
  if (!el) return;
  if (!rows.length) { el.innerHTML = ''; return; }
  const selectedId = document.getElementById('weaponBuildSelect').value;
  const ranked = rows.slice().sort((a, b) => b.build.score - a.build.score);
  el.innerHTML = `<div class="wbr-title">Ranked by balanced score <span class="wbr-count">${ranked.length} match${ranked.length === 1 ? '' : 'es'}</span></div>
    <div class="wbr-list">${ranked.map((w, i) => `
      <button type="button" class="wbr-row${w.id === selectedId ? ' active' : ''}" data-action="select-weapon-build" data-id="${esc(w.id)}">
        <span class="wbr-rank">#${i + 1}</span>
        <span class="wbr-name">${esc(w.name)}<span class="wbr-cat">${esc(w.category)}</span></span>
        <span class="wbr-score">${esc(w.build.score)}</span>
        <span class="wbr-parts">${w.build.owned}/${w.build.owned + w.build.missing} parts</span>
        <span class="wbr-suppressed ${w.build.suppressed ? 'yes' : ''}" title="${w.build.suppressed ? 'Has a compatible suppressor' : 'No compatible suppressor'}">${w.build.suppressed ? 'Suppressed' : ''}</span>
      </button>`).join('')}</div>`;
}

function statChips(stats){const entries=Object.entries(stats).filter(([,v])=>v);if(!entries.length)return'<span class="stat-chip neutral">Compatibility / core assembly</span>';return entries.map(([k,v])=>`<span class="stat-chip">${esc(STAT_LABELS[k]||k)}<b>${v>0?'+':''}${esc(formatNum(v))}</b></span>`).join('');}
// Base weapon stats are absolute magnitudes (damage 20000, magazine 4), not
// deltas like part stats, so no +/- sign prefix.
function baseStatChips(stats){return['damage','rof','accuracy','magazine'].filter(k=>stats[k]!=null).map(k=>`<span class="stat-chip">${esc(STAT_LABELS[k]||k)}<b>${esc(formatNum(stats[k]))}</b></span>`).join('');}
// Parts without a real weapon-level gate (requiredXp 0) render no badge --
// most parts have no gate, so this keeps the handful of real ones visible.
function requirementBadge(p){if(!p.requiredXp)return'';return `<span class="req-badge ${p.requirementMet?'met':'unmet'}">Lvl ${p.level} &middot; ${p.requiredXp.toLocaleString()} XP &middot; ${p.requirementMet?'met':'not met'}</span>`;}
// "Weapon attachment X" used to include the literal word "weapon", which hit
// itemTypeIcon's weapon-silhouette branch before the attachment branch could
// match -- every part rendered the full-gun icon regardless of slot. Optics
// get the dedicated target icon since it's a strong, already-drawn match.
function partIcon(slot){return /optic|scope/i.test(slot)?appIcon('🎯','weapon-part-icon'):itemTypeIcon('attachment',slot);}
const BUILD_SCORE_HINT = 'Category-aware balanced score (0-100) from per-dimension percentile ranking against other weapons in the same category: accuracy, stability, recoil control, damage, rate of fire, and magazine capacity (base + selected BIS parts), plus a suppression-capability bonus for classes where staying unsuppressed draws aggro (shotguns and grenade launchers are exempt -- going loud is expected for those). Weighted toward the traits community consensus rates highest: suppression, magazine/drum capacity, and one-shot damage. Only meaningful for comparing weapons within the same category.';
function renderWeaponBuild(){const id=document.getElementById('weaponBuildSelect').value,w=weaponBuildData?.weapons.find(x=>x.id===id),el=document.getElementById('weaponBuildContent');if(!w){setRenderedHtml(el,'<div class="empty-state"><strong>No matching supported weapon</strong><br>Try a different filter.</div>');return;}const b=w.build;setRenderedHtml(el,`<section class="weapon-build-summary"><div><span class="eyebrow">${esc(w.category)}</span><h3>${esc(w.name)} ${technicalDetails(w.id)}</h3><div class="weapon-part-stats"><span class="k">Base stats</span>${baseStatChips(w.stats)}</div></div><div class="build-metrics"><strong>${esc(b.score)}</strong><span title="${esc(BUILD_SCORE_HINT)}">balanced score</span><b class="${b.suppressed?'ready':'neutral'}">${esc(b.suppressionMessage)}</b>${w.weaponOwned?'':'<span class="req-badge unmet">Weapon not owned</span>'}<span class="req-badge ${b.missing?'unmet':'met'}">${b.owned} owned / ${b.missing} missing parts</span></div></section><div class="weapon-build-actions"><button type="button" data-action="weapon-build-add-bundle" data-id="${esc(w.id)}" ${(!w.weaponOwned||b.missing)?'':'disabled'} title="Adds the base weapon (if not already owned) plus every missing BIS part at quantity one. Already-owned items are left untouched.">${actionIcon('add')}Add weapon + missing parts</button></div><div class="weapon-part-grid">${b.parts.map(p=>`<article class="weapon-part-card ${p.missing?'is-missing':'is-owned'}">${partIcon(p.slot)}<div class="weapon-part-body"><span class="eyebrow">${esc(p.slot)}</span><h4>${esc(p.name)} ${technicalDetails(p.itemId)}</h4><div class="weapon-part-stats">${statChips(p.stats)}</div>${p.dependencies.length?`<div class="weapon-part-deps"><span class="k">Requires</span>${p.dependencies.map(d=>`<span class="dep-chip">${esc(d.name)}</span>`).join('')}</div>`:''}${requirementBadge(p)}<div class="weapon-part-state"><b class="${p.missing?'missing':'owned'}">${p.missing?'Missing':'Owned ×'+p.owned}</b>${p.missing?`<button type="button" class="mini icon-only" data-action="weapon-build-add-part" data-weapon-id="${esc(w.id)}" data-part-id="${esc(p.itemId)}" title="Add this part">${actionIcon('add')}<span class="sr-only">Add</span></button>`:''}</div></div></article>`).join('')}</div><aside class="source-disclosure"><strong>Equip manually in-game:</strong> open weapon customization, install the listed parts, then save a preset.</aside>`);}
async function addWeaponBuildPart(weaponId,partId,button){
  const partName=button.closest('.weapon-part-card')?.querySelector('h4')?.textContent.trim()||'this BIS part';
  const ok=await confirmAction(`Add ${partName} at quantity one? Existing quantities are never increased. Structured inventory writes are experimental.`,'Add BIS part');
  if(!ok)return;
  button.disabled=true;
  try{
    const result=await api(`/weapon-builds/${encodeURIComponent(weaponId)}/parts/${encodeURIComponent(partId)}/add`,{method:'POST',body:'{}'});
    setOperationFeedback('weaponBuildsOperationStatus',`Added ${result.part.name}.`,result,result.success?'success':'error');
    await loadWeaponBuilds();
    const next=document.querySelector(`[data-action="weapon-build-add-part"][data-part-id="${CSS.escape(partId)}"]`);
    (next||document.getElementById('weaponBuildSelect')).focus();
  }catch(error){
    setOperationFeedback('weaponBuildsOperationStatus',error.message,error.payload,'error');
    showToast(error.message,'error');
    button.disabled=false;
  }
}
async function addMissingWeaponBuildBundle(id,button){
  const ok=await confirmAction('Add the base weapon (if not already owned) and every currently missing trusted part for this build at quantity one? This structured inventory write is experimental.','Add weapon + missing parts');
  if(!ok)return;
  button.disabled=true;
  try{
    const result=await api(`/weapon-builds/${encodeURIComponent(id)}/add-missing-with-weapon`,{method:'POST',body:'{}'});
    setOperationFeedback('weaponBuildsOperationStatus',`Added ${result.added.length} item(s).`,result,result.success?'success':'error');
    await loadWeaponBuilds();
  }catch(error){
    setOperationFeedback('weaponBuildsOperationStatus',error.message,error.payload,'error');
    showToast(error.message,'error');
    button.disabled=false;
  }
}
async function addMissingForOwnedWeapons(){
  const button=document.getElementById('weaponBuildAddOwned');
  const ok=await confirmAction('Add all missing trusted BIS parts at quantity one for every supported weapon currently owned? Existing quantities will not increase. This structured inventory write is experimental.','Add owned-weapon BIS parts');
  if(!ok)return;
  button.disabled=true;
  try{
    const result=await api('/weapon-builds/add-missing-owned',{method:'POST',body:'{}'});
    setOperationFeedback('weaponBuildsOperationStatus',`Added ${result.added.length} unique parts for ${result.weaponCount} owned weapons.`,result,result.success?'success':'error');
    await loadWeaponBuilds();
  }catch(error){
    setOperationFeedback('weaponBuildsOperationStatus',error.message,error.payload,'error');
    showToast(error.message,'error');
  }finally{
    button.disabled=false;
  }
}

async function loadWeaponXp() {
  const el = document.getElementById('weaponXpList');
  showLoading(el, 6, 'Loading weapon XP');
  try {
    const [xp, ref] = await Promise.all([
      api('/weapon-xp'),
      api('/weapon-xp/reference').catch(() => ({}))
    ]);
    _weaponXp = xp;
    _weaponRef = ref || {};

    // Populate category filter.
    const cats = [...new Set(xp.map(w => weaponLabel(w.weapon).cat))].sort();
    const sel = document.getElementById('weaponFilter');
    sel.innerHTML = '<option value="">All categories</option>' +
      cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    renderWeaponXp();
  } catch (err) {
    el.textContent = 'Error: ' + err.message;
  }
}

function renderWeaponXp() {
  const el = document.getElementById('weaponXpList');
  const filter = document.getElementById('weaponFilter').value;
  const q = document.getElementById('weaponXpSearch').value.trim();
  let rows = _weaponXp
    .map(w => ({ ...w, meta: weaponLabel(w.weapon) }))
    .filter(w => !filter || w.meta.cat === filter);
  // Ranked search order matters (best match first) when there's a query;
  // otherwise fall back to a stable alphabetical order.
  rows = q ? filterAndRank(rows, q, w => [w.meta.name, w.weapon, w.meta.cat]) : rows.slice().sort((a, b) => a.meta.name.localeCompare(b.meta.name));

  const parts = [];
  if (filter) parts.push(filter);
  if (q) parts.push('“' + q + '”');
  document.getElementById('weaponXpFilterSummary').innerHTML = filterSummaryHtml(rows.length, parts);

  if (!rows.length) {
    el.innerHTML = '<div class="empty-state"><strong>No weapons found</strong><br>Try a different filter.</div>';
    return;
  }

  const groups = {};
  for (const w of rows) (groups[w.meta.cat] = groups[w.meta.cat] || []).push(w);

  let html = '<div class="weapon-grid">';
  for (const cat of Object.keys(groups).sort()) {
    const list = groups[cat];
    html += `<div class="weapon-cat">${esc(cat)}</div>`;
    for (const w of list) {
      const currentXp = Number(w.xp) || 0;
      const target = weaponTargetXp(w.weapon);
      const hasRealRef = _weaponRef[w.weapon] != null;
      const pct = (target && target > 0) ? Math.min(100, Math.round((currentXp / target) * 100)) : (currentXp > 0 ? 100 : 0);
      const atRef = currentXp >= target;
      const delta = target - currentXp;
      html += `<div class="weapon-card ${atRef ? 'done' : ''}">
        <div class="weapon-card-head">
          <span class="weapon-name-wrap"><span class="weapon-icon">${appIcon('weapon')}</span><span class="weapon-name">${esc(w.meta.name)}</span></span>
          <span class="weapon-cat-badge">${esc(w.meta.cat)}</span>
        </div>
        <div class="weapon-scope">${technicalDetails(w.weapon, 'Show weapon scope ID')}</div>
        <div class="weapon-xp-row"><span>Current XP</span><b>${currentXp.toLocaleString()}</b></div>
        <div class="weapon-bar"><span style="width:${pct}%" class="${atRef ? 'full' : ''}"></span></div>
        <div class="weapon-xp-row"><span>${hasRealRef ? '100% reference XP' : 'Target XP (no ref)'}</span><b>${target.toLocaleString()}</b></div>
        ${atRef
          ? '<div class="weapon-done">✓ At or above reference</div>'
          : `<div class="weapon-delta">${delta.toLocaleString()} XP to reference</div>`}
        <div class="weapon-actions">
          <input type="number" id="xp-${encodeURIComponent(w.weapon)}" value="${currentXp}" min="0" step="1" aria-label="XP for ${esc(w.meta.name)}">
          <button class="set icon-only" data-action="set-weapon-xp" data-weapon="${encodeURIComponent(w.weapon)}" title="Set XP to the value above">${actionIcon('check')}<span class="sr-only">Set XP</span></button>
          <button class="ref icon-only" data-action="set-weapon-xp" data-weapon="${encodeURIComponent(w.weapon)}" data-value="100000" title="Set XP to 100,000 (reference value)">${actionIcon('refresh')}<span class="sr-only">Set 100,000</span></button>
        </div>
      </div>`;
    }
  }
  html += '</div>';
  setRenderedHtml(el, html);
}

async function setWeaponXp(encWeapon, xpValue) {
  const weapon = decodeURIComponent(encWeapon);
  const xp = xpValue != null ? validateInteger(xpValue, 'Weapon XP', { min: 0 }) : readIntegerInput(document.getElementById(`xp-${encWeapon}`), 'Weapon XP', { min: 0 });
  const result = await api(`/weapon-xp/${encodeURIComponent(weapon)}`, {
    method: 'PUT',
    body: JSON.stringify({ xp })
  });
  setOperationFeedback('weaponXpOperationStatus', `Weapon XP set to ${xp.toLocaleString()}.`, result, result.afterIntegrity.passed ? 'success' : 'error');
  loadWeaponXp();
}

async function setAllToReference() {
  const filter = document.getElementById('weaponFilter').value;
  const targets = _weaponXp.filter(w => !filter || weaponLabel(w.weapon).cat === filter);
  if (!targets.length) { setOperationFeedback('weaponXpOperationStatus', 'No weapons are in the current filter.', null, 'info'); return; }
  const items = targets
    .map(w => ({ scope: w.weapon, xp: 100000 }))
    .filter(it => { const cur = _weaponXp.find(x => x.weapon === it.scope); return cur && cur.xp !== it.xp; });
  if (!items.length) { setOperationFeedback('weaponXpOperationStatus', 'All matching weapons are already at 100,000 XP.', null, 'info'); return; }
  if (!await confirmAction(`Set ${items.length} weapon(s) to 100,000 XP in one batch?`)) return;
  setOperationFeedback('weaponXpOperationStatus', `Updating ${items.length} weapon XP values…`, null, 'info');
  try {
    const r = await api('/weapon-xp/batch', {
      method: 'POST',
      body: JSON.stringify({ items })
    });
    loadWeaponXp();
    setOperationFeedback('weaponXpOperationStatus', `Batch complete: ${r.updated} updated, ${r.failed} failed.`, r, r.afterIntegrity.passed && !r.failed ? 'success' : 'error');
  } catch (e) {
    setOperationFeedback('weaponXpOperationStatus', `Batch update failed: ${e.message}`, e.payload, 'error');
    loadWeaponXp();
  }
}

expose({ WEAPON_META, loadPresets, renderPresets, loadWeaponBuilds, renderWeaponBuildSelector, renderWeaponBuild, renderWeaponBuildRanking, selectWeaponBuild, addWeaponBuildPart, addMissingWeaponBuildBundle, addMissingForOwnedWeapons, loadWeaponXp, renderWeaponXp, setWeaponXp, setAllToReference });

