import { FW } from '../../runtime.mjs';
import { entityCard } from '../../card-ui.mjs';

const { api, esc, filterAndRank, filterSummaryHtml, noMatchesHtml, showLoading, technicalDetails, appIcon, actionIcon, setInlineFeedback, loadErrorHtml, showToast, confirmAction } = FW;
function refreshSafetyStatus(...args) { return FW.refreshSafetyStatus?.(...args); }

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

export async function loadRigs() {
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
    list.innerHTML = loadErrorHtml('rigs', error);
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

export function renderRigs() {
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
    list.innerHTML = noMatchesHtml('No rigs match', 'Try another name, or clear a filter.');
    return;
  }
  list.innerHTML = rigs.map(rig => {
    const enc = encodeURIComponent(rig.id);
    const moduleList = rig.highQualityContainerSet.map(module => `<li><span>${esc(friendlyContainerId(module.containerId))}</span><b>Owned ${module.quantity.toLocaleString()} → ${(module.quantity + 1).toLocaleString()}</b>${technicalDetails(module.containerId, 'Show container ID')}</li>`).join('');
    return entityCard({
      cardClass: `rig-card ${rig.owned ? 'owned' : 'missing'}`,
      data: { 'rig-card': enc },
      iconHtml: `<span class="rig-icon" aria-hidden="true">${appIcon('pack')}</span>`,
      title: rig.name,
      titleId: `rig-heading-${enc}`,
      focusableTitle: true,
      subtitle: rig.weightClass,
      statusHtml: `<span class="rig-owned-badge ${rig.owned ? 'owned' : 'missing'}">${rig.owned ? 'Owned' : 'Missing'}</span>`,
      bodyHtml: `<div class="rig-capacity"><span><small>Base capacity</small><b>${esc(rig.minCapacity.toLocaleString())} CU</b></span><span><small>HQ capacity</small><b>${esc(rig.maxCapacity.toLocaleString())} CU</b></span><span><small>Rig weight</small><b>${esc(rig.weight)} kg</b></span></div>
      ${rigSlotPills(rig.slots)}
      <p class="rig-characters"><b>Compatible:</b> ${esc(rig.compatibleCharacters.join(', '))}</p>
      <details class="rig-kit-details"><summary>HQ set · ${rig.highQualityContainers.length} container${rig.highQualityContainers.length === 1 ? '' : 's'}</summary><ul>${moduleList}</ul></details>
      <div class="operation-inline" id="rigop-${enc}" aria-live="polite"></div>`,
      footerHtml: `<div class="rig-actions">
        <button id="rig-add-${enc}" class="btn-primary" data-action="add-rig" data-id="${enc}" type="button" ${rig.owned ? 'disabled' : ''}>${rig.owned ? actionIcon('check') + 'Rig owned' : actionIcon('add') + 'Add rig'}</button>
        <button id="rig-hq-${enc}" class="btn-ghost" data-action="add-rig-kit" data-id="${enc}" type="button">${actionIcon('add')}Add HQ set</button>
      </div>`
    });
  }).join('');
}

export function clearRigFilters() {
  document.getElementById('rigSearch').value = '';
  document.getElementById('rigOwnership').value = 'all';
  document.getElementById('rigClass').value = '';
  renderRigs();
  document.getElementById('rigSearch').focus();
}

export async function addRig(encId) {
  const rigId = decodeURIComponent(encId);
  const rig = _rigData?.rigs.find(candidate => candidate.id === rigId);
  if (!rig || rig.owned) return;
  const accepted = await confirmAction(`Add ownership of ${rig.name}? This will not equip it or change the active character's loadout.`, { title: 'Add rig?', acceptLabel: 'Add rig', icon: 'add' });
  if (!accepted) return;
  const inline = document.getElementById(`rigop-${encId}`);
  setInlineFeedback(inline, { state: 'pending', message: 'Adding and verifying rig ownership…' });
  try {
    const result = await api(`/rigs/${encodeURIComponent(rigId)}/add`, { method: 'POST', body: '{}' });
    rig.owned = true;
    _rigData.ownedCount += 1;
    renderRigs();
    const updatedInline = document.getElementById(`rigop-${encId}`);
    setInlineFeedback(updatedInline, { state: 'success', message: 'Rig added and verified.', result });
    document.getElementById(`rig-heading-${encId}`)?.focus({ preventScroll: true });
    showToast(`${rig.name} ownership was added and verified.`);
    refreshSafetyStatus();
  } catch (error) {
    setInlineFeedback(inline, { state: 'error', error, fallback: 'This rig could not be added.' });
    showToast(`Could not add ${rig.name}.`, 'error');
  }
}

export async function addRigKit(encId) {
  const rigId = decodeURIComponent(encId);
  const rig = _rigData?.rigs.find(candidate => candidate.id === rigId);
  if (!rig) return;
  const names = rig.highQualityContainerSet.map(module => friendlyContainerId(module.containerId)).join('; ');
  const accepted = await confirmAction(`Add one complete HQ set for ${rig.name}? Each of these containers will increase by one: ${names}. Existing quantities will not be replaced.`, { title: 'Add container set?', acceptLabel: 'Add container set', icon: 'add' });
  if (!accepted) return;
  const inline = document.getElementById(`rigop-${encId}`);
  setInlineFeedback(inline, { state: 'pending', message: `Adding and verifying ${rig.highQualityContainers.length} container types…` });
  try {
    const result = await api(`/rigs/${encodeURIComponent(rigId)}/high-quality-set`, { method: 'POST', body: '{}' });
    const byId = new Map(result.containers.map(change => [change.containerId, change.after]));
    for (const module of rig.highQualityContainerSet) if (byId.has(module.containerId)) module.quantity = byId.get(module.containerId);
    renderRigs();
    const updatedInline = document.getElementById(`rigop-${encId}`);
    setInlineFeedback(updatedInline, { state: 'success', message: 'HQ set added and verified.', result });
    document.getElementById(`rig-hq-${encId}`)?.focus({ preventScroll: true });
    showToast(`${rig.name} HQ container set was added and verified.`);
    refreshSafetyStatus();
  } catch (error) {
    setInlineFeedback(inline, { state: 'error', error, fallback: 'The HQ container set could not be added.' });
    showToast(`Could not add the ${rig.name} HQ set.`, 'error');
  }
}
