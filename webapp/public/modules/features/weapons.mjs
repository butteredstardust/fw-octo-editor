import { FW, expose } from '../runtime.mjs';

const { api, esc, technicalDetails, itemTypeIcon, readIntegerInput, setOperationFeedback, confirmAction, showLoading, setRenderedHtml } = FW;

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
function renderWeaponBuildSelector(){if(!weaponBuildData)return;const q=document.getElementById('weaponBuildSearch').value.toLowerCase(),category=document.getElementById('weaponBuildCategory').value;sessionStorage.setItem('weaponBuildCategory',category);const rows=weaponBuildData.weapons.filter(w=>(!category||w.category===category)&&(!q||`${w.name} ${w.id}`.toLowerCase().includes(q)));const select=document.getElementById('weaponBuildSelect'),wanted=sessionStorage.getItem('weaponBuildId');select.innerHTML=rows.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('');if(rows.some(w=>w.id===wanted))select.value=wanted;sessionStorage.setItem('weaponBuildId',select.value||'');renderWeaponBuild();}
function statText(stats){return Object.entries(stats).filter(([,v])=>v).map(([k,v])=>`${esc(k)} ${v>0?'+':''}${esc(v)}`).join(' · ')||'Compatibility / core assembly';}
function renderWeaponBuild(){const id=document.getElementById('weaponBuildSelect').value,w=weaponBuildData?.weapons.find(x=>x.id===id),el=document.getElementById('weaponBuildContent');if(!w){setRenderedHtml(el,'<div class="empty-state"><strong>No matching supported weapon</strong><br>Try a different filter.</div>');return;}const b=w.build;setRenderedHtml(el,`<section class="weapon-build-summary"><div><span class="eyebrow">${esc(w.category)}</span><h3>${esc(w.name)} ${technicalDetails(w.id)}</h3><p>Base: damage ${esc(w.stats.damage)} · ROF ${esc(w.stats.rof)} · accuracy ${esc(w.stats.accuracy)} · magazine ${esc(w.stats.magazine)}</p></div><div class="build-metrics"><strong>${esc(b.score)}</strong><span>balanced score</span><b class="${b.suppressed?'owned':'missing'}">${esc(b.suppressionMessage)}</b><span>${b.owned} owned / ${b.missing} missing</span></div></section><div class="weapon-build-actions"><button type="button" data-action="weapon-build-add" data-id="${esc(w.id)}" ${b.missing?'':'disabled'}>Add missing parts</button></div><div class="weapon-part-grid">${b.parts.map(p=>`<article class="weapon-part-card ${p.missing?'is-missing':'is-owned'}">${itemTypeIcon(`Weapon attachment ${p.slot}`)}<div><span class="eyebrow">${esc(p.slot)}</span><h4>${esc(p.name)} ${technicalDetails(p.itemId)}</h4><p>${statText(p.stats)}</p>${p.dependencies.length?`<p>Requires: ${p.dependencies.map(d=>esc(d.name)).join(', ')}</p>`:''}<p>Level ${p.level} · ${p.requiredXp.toLocaleString()} XP <span class="${p.requirementMet?'owned':'missing'}">${p.requirementMet?'met':'not met'}</span></p><div class="weapon-part-state"><b class="${p.missing?'missing':'owned'}">${p.missing?'Missing':'Owned ×'+p.owned}</b>${p.missing?`<button type="button" class="mini" data-action="weapon-build-add-part" data-weapon-id="${esc(w.id)}" data-part-id="${esc(p.itemId)}">Add</button>`:''}</div></div></article>`).join('')}</div><aside class="source-disclosure"><strong>Equip manually in-game:</strong> open weapon customization, install the listed parts, then save a preset.</aside>`);}
async function addWeaponBuildPart(weaponId,partId,button){const partName=button.closest('.weapon-part-card')?.querySelector('h4')?.textContent.trim()||'this BIS part';const ok=await confirmAction(`Add ${partName} at quantity one? Existing quantities are never increased. Structured inventory writes are experimental.`,'Add BIS part');if(!ok)return;button.disabled=true;try{const result=await api(`/weapon-builds/${encodeURIComponent(weaponId)}/parts/${encodeURIComponent(partId)}/add`,{method:'POST',body:'{}'});document.getElementById('weaponBuildStatus').textContent=`Added ${result.part.name}. Backup ${result.backupId}.`;await loadWeaponBuilds();const next=document.querySelector(`[data-action="weapon-build-add-part"][data-part-id="${CSS.escape(partId)}"]`);(next||document.getElementById('weaponBuildSelect')).focus();}catch(error){document.getElementById('weaponBuildStatus').textContent=error.message;button.disabled=false;}}
async function addMissingWeaponBuild(id,button){const ok=await confirmAction('Add every currently missing trusted part for this build at quantity one? This structured inventory write is experimental.','Add missing weapon parts');if(!ok)return;button.disabled=true;try{const result=await api(`/weapon-builds/${encodeURIComponent(id)}/add-missing`,{method:'POST',body:'{}'});document.getElementById('weaponBuildStatus').textContent=`Added ${result.added.length} missing parts. Backup ${result.backupId}.`;await loadWeaponBuilds();}catch(error){document.getElementById('weaponBuildStatus').textContent=error.message;button.disabled=false;}}
async function addMissingForOwnedWeapons(){const button=document.getElementById('weaponBuildAddOwned');const ok=await confirmAction('Add all missing trusted BIS parts at quantity one for every supported weapon currently owned? Existing quantities will not increase. This structured inventory write is experimental.','Add owned-weapon BIS parts');if(!ok)return;button.disabled=true;try{    const result=await api('/weapon-builds/add-missing-owned',{method:'POST',body:'{}'});document.getElementById('weaponBuildStatus').textContent=`Added ${result.added.length} unique parts for ${result.weaponCount} owned weapons. Backup ${result.backupId}.`;await loadWeaponBuilds();}catch(error){document.getElementById('presetStatus').textContent=error.message;}finally{button.disabled=false;}}

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
  const rows = _weaponXp
    .map(w => ({ ...w, meta: weaponLabel(w.weapon) }))
    .filter(w => !filter || w.meta.cat === filter)
    .sort((a, b) => a.meta.cat.localeCompare(b.meta.cat) || a.meta.name.localeCompare(b.meta.name));

  if (!rows.length) {
    el.innerHTML = '<div class="empty-state"><strong>No weapons found</strong><br>Try a different filter.</div>';
    return;
  }

  const groups = {};
  for (const w of rows) (groups[w.meta.cat] = groups[w.meta.cat] || []).push(w);

  let html = '<div class="weapon-grid">';
  for (const [cat, list] of Object.entries(groups)) {
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
          <span class="weapon-name">${esc(w.meta.name)}</span>
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
          <button class="set" data-action="set-weapon-xp" data-weapon="${encodeURIComponent(w.weapon)}">Set XP</button>
          <button class="ref" data-action="set-weapon-xp" data-weapon="${encodeURIComponent(w.weapon)}" data-value="100000">Set 100,000</button>
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

expose({ WEAPON_META, loadPresets, renderPresets, loadWeaponBuilds, renderWeaponBuildSelector, renderWeaponBuild, addWeaponBuildPart, addMissingWeaponBuild, addMissingForOwnedWeapons, loadWeaponXp, renderWeaponXp, setWeaponXp, setAllToReference });

