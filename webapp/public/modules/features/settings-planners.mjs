import { FW, expose } from '../runtime.mjs';
import { RECIPE_DATA } from '../recipe-data.mjs';
import { recipePlannerTotals } from '../recipe-planner.mjs';

const { api, esc, filterAndRank, technicalDetails, readIntegerInput, showToast, confirmAction } = FW;

let _settingsCloudDirInput = null;

async function loadSettings() {
  const statusEl = document.getElementById('settingsStatus');
  const dirEl = document.getElementById('settingsSaveDir');
  const defDirEl = document.getElementById('settingsDefaultDir');
  const keyFileEl = document.getElementById('settingsKeyFile');
  statusEl.textContent = 'Loading…';
  try {
    const s = await api('/settings');
    defDirEl.textContent = s.defaultSaveDir;
    keyFileEl.textContent = s.defaultKeyFile;
    dirEl.value = s.saveDir || '';
    const active = s.activeSaveDir || s.defaultSaveDir;
    statusEl.innerHTML =
      `<div>Active save directory: <span class="active-dir">${esc(active)}</span></div>` +
      `<div>DB key: loaded from the local application resource.</div>`;
    document.getElementById('settingsMsg').textContent = '';
  } catch (e) {
    statusEl.textContent = 'Error loading settings: ' + e.message;
  }
}

// Native directory picker (webkitdirectory) → fills the save-dir field.
function pickSaveDir() {
  if (!_settingsCloudDirInput) {
    _settingsCloudDirInput = document.createElement('input');
    _settingsCloudDirInput.type = 'file';
    _settingsCloudDirInput.webkitdirectory = true;
    _settingsCloudDirInput.style.display = 'none';
    _settingsCloudDirInput.addEventListener('change', () => {
      if (_settingsCloudDirInput.files && _settingsCloudDirInput.files.length) {
        // The input gives file paths; derive the containing directory.
        const p = _settingsCloudDirInput.files[0].webkitRelativePath || _settingsCloudDirInput.files[0].name;
        const dir = p.split('/')[0];
        const base = _settingsCloudDirInput.files[0].path
          ? _settingsCloudDirInput.files[0].path.replace(/[\\/][^\\/]+$/, '')
          : dir;
        document.getElementById('settingsSaveDir').value = base;
      }
    });
    document.body.appendChild(_settingsCloudDirInput);
  }
  _settingsCloudDirInput.value = '';
  _settingsCloudDirInput.click();
}

function clearSaveDir() {
  document.getElementById('settingsSaveDir').value = '';
}

async function saveSettings() {
  const msg = document.getElementById('settingsMsg');
  msg.className = 'settings-msg';
  msg.textContent = 'Saving…';
  const saveDir = document.getElementById('settingsSaveDir').value.trim();
  try {
    const s = await api('/settings', {
      method: 'POST',
      body: JSON.stringify({ saveDir: saveDir || null })
    });
    msg.className = 'settings-msg ok';
    msg.textContent = 'Saved. Changes apply immediately — re-open other pages to use the new save.';
    await loadSettings();
  } catch (e) {
    msg.className = 'settings-msg err';
    msg.textContent = 'Error: ' + e.message;
  }
}

// ---- Canonical recipe component planners ----
const CRAFTING_KINDS = {
  workshop: { recipes: RECIPE_DATA.recipes.workshop },
  munitions: { recipes: RECIPE_DATA.recipes.munitions }
};
let _craftingInventory = {};
let _craftingKind = 'workshop';
const craftingCfg = () => CRAFTING_KINDS[_craftingKind];

function craftingRender() {
  const infoEl = document.getElementById('craftingCraftInfo');
  const prevEl = document.getElementById('craftingPreview');
  const sel = document.getElementById('craftingProduct');
  if (!sel.options.length || !sel.value) { infoEl.textContent = ''; prevEl.innerHTML = '<div class="empty-state"><strong>No matching products</strong><br>Try another product or component name.</div>'; return; }
  let qty;
  try { qty = readIntegerInput(document.getElementById('craftingQty'), 'Craft quantity', { min: 1, max: 2147483647 }); }
  catch (error) { infoEl.textContent = error.message; prevEl.innerHTML = '<div class="empty-state"><strong>Enter a valid craft quantity</strong></div>'; return; }
  const result = recipePlannerTotals(craftingCfg().recipes, _craftingInventory, sel.value, qty);
  const product = result.recipe.product;
  infoEl.innerHTML = `${qty} × <strong>${esc(product.name)}</strong> needs ${result.crafts} craft${result.crafts === 1 ? '' : 's'} · ${product.quantity} per craft · ${esc(result.recipe.duration.label)} ${technicalDetails(product.itemId || 'Wiki identity only', 'Show product technical ID')}`;
  prevEl.innerHTML = result.components.map(component => {
    const unsupported = !component.writable || !component.itemId;
    const enough = !unsupported && component.owned >= component.total;
    const state = unsupported ? '<span class="recipe-unverified">holding unknown · skipped by add actions</span>' : enough ? '<span class="ok">enough</span>' : `<span class="add">+${component.missing} to add</span>`;
    return `<div class="workshop-comp ${enough ? 'have-enough' : ''} ${unsupported ? 'recipe-unsupported' : ''}"><div class="workshop-comp-name">${esc(component.name)}${technicalDetails(component.itemId || 'Unresolved against reference save', 'Show component mapping')}</div><div class="workshop-comp-tag">${esc(component.itemId || 'No reference-save ID')}</div><div class="workshop-comp-qty">need <span class="need">${component.total}</span> · ${unsupported ? '' : 'have <span class="have">' + component.owned + '</span> · '}${state}</div></div>`;
  }).join('');
}

function filterCraftingProducts() {
  const sel = document.getElementById('craftingProduct'), query = document.getElementById('craftingSearch').value, previous = sel.value;
  const recipes = filterAndRank(craftingCfg().recipes, query, recipe => [recipe.product.name, recipe.product.itemId, recipe.id, recipe.duration.label, ...recipe.components.flatMap(component => [component.name, component.itemId])]);
  sel.innerHTML = recipes.map(recipe => `<option value="${esc(recipe.id)}">${esc(recipe.product.name)} · ${esc(recipe.duration.label)}</option>`).join('');
  if (recipes.some(recipe => recipe.id === previous)) sel.value = previous;
  sel.disabled = !recipes.length; craftingRender();
}

function setCraftingKind(kind) {
  if (!CRAFTING_KINDS[kind] || kind === _craftingKind) return;
  _craftingKind = kind;
  for (const button of document.querySelectorAll('.crafting-tab')) {
    const active = button.dataset.kind === kind;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  document.getElementById('craftingSearch').value = '';
  document.getElementById('craftingMsg').textContent = '';
  filterCraftingProducts();
}

async function addCanonicalComponents(components, inventory, mode, messageEl, buttons) {
  const unsupported = components.filter(component => !component.writable || !component.itemId);
  const list = components.filter(component => component.writable && component.itemId).map(component => ({ ...component, addQuantity: mode === 'all' ? component.total : component.missing })).filter(component => component.addQuantity > 0);
  if (!list.length) { messageEl.className = unsupported.length ? 'settings-msg warn' : 'settings-msg ok'; messageEl.textContent = unsupported.length ? `Nothing safely writable to add; ${unsupported.length} requirement(s) remain informational.` : 'Nothing to add — verified requirements are already covered.'; return; }
  if (!await confirmAction(`Experimental: add ${list.length} verified component type(s)? ${unsupported.length ? unsupported.length + ' unsupported requirement(s) will be skipped. ' : ''}Make a backup first.`)) return;
  buttons.forEach(button => { button.disabled = true; }); messageEl.className = 'settings-msg'; messageEl.setAttribute('aria-busy', 'true');
  let updated = 0, failed = 0;
  for (const component of list) {
    try {
      const response = await api('/inventory/add', { method: 'POST', body: JSON.stringify({ itemId: component.itemId, quantity: component.addQuantity, sourceMap: component.sourceMap }) });
      if (response.added === false) await api('/inventory/update', { method: 'POST', body: JSON.stringify({ itemId: component.itemId, quantity: (inventory[component.itemId] || 0) + component.addQuantity, sourceMap: component.sourceMap }) });
      updated++;
    } catch (error) { failed++; console.error('canonical component add failed', component.itemId, error.message); }
    messageEl.textContent = `Updating ${updated + failed} of ${list.length}…`;
  }
  const items = await api('/inventory').catch(() => []); for (const item of items) inventory[item.name] = item.quantity;
  buttons.forEach(button => { button.disabled = false; }); messageEl.removeAttribute('aria-busy'); messageEl.className = failed ? 'settings-msg err' : 'settings-msg ok';
  messageEl.textContent = `Verified ${updated} component type(s)${failed ? '; ' + failed + ' failed' : ''}${unsupported.length ? '; ' + unsupported.length + ' unsupported requirement(s) skipped' : ''}.`;
  showToast(failed ? `${updated} updated; ${failed} failed.` : `${updated} component types added and verified.`, failed ? 'error' : 'success');
}

async function craftingAdd(mode) {
  let qty;
  try { qty = readIntegerInput(document.getElementById('craftingQty'), 'Craft quantity', { min: 1, max: 2147483647 }); }
  catch (error) { document.getElementById('craftingMsg').textContent = error.message; return; }
  const result = recipePlannerTotals(craftingCfg().recipes, _craftingInventory, document.getElementById('craftingProduct').value, qty);
  const buttons = [...document.querySelectorAll('#page-crafting .workshop-actions button')];
  await addCanonicalComponents(result.components, _craftingInventory, mode, document.getElementById('craftingMsg'), buttons); craftingRender();
}
async function craftingAddMissing(){ await craftingAdd('missing'); }
async function craftingAddAll(){ await craftingAdd('all'); }
async function loadCrafting() {
  try { const items = await api('/inventory'); _craftingInventory = {}; for (const item of items) _craftingInventory[item.name] = item.quantity; }
  catch (error) { document.getElementById('craftingCraftInfo').textContent = 'Could not read inventory: ' + error.message; }
  filterCraftingProducts();
}

expose({ loadSettings, pickSaveDir, clearSaveDir, saveSettings, loadCrafting, setCraftingKind, craftingCompute: craftingRender, craftingFilter: filterCraftingProducts, craftingAddMissing, craftingAddAll, addCanonicalComponents });

