import { FW, expose } from '../runtime.mjs';
import { RECIPE_DATA } from '../recipe-data.mjs';
import { recipePlannerTotals } from '../recipe-planner.mjs';

const { api, esc, appIcon, actionIcon, filterAndRank, filterSummaryHtml, technicalDetails, showToast, confirmAction, setRenderedHtml } = FW;

// Recipes only come from two stations, so a station-level icon (rather than a
// guess per product name) is the reliable signal available at render time.
const STATION_ICON = { workshop: 'workshop', munitions: 'ammo' };

let _settingsCloudDirInput = null;

async function loadSettings() {
  const statusEl = document.getElementById('settingsStatus');
  const dirEl = document.getElementById('settingsSaveDir');
  const defDirEl = document.getElementById('settingsDefaultDir');
  const dbKeyEl = document.getElementById('settingsDbKey');
  const dbKeyHintEl = document.getElementById('settingsDbKeyHint');
  statusEl.textContent = 'Loading…';
  try {
    const s = await api('/settings');
    defDirEl.textContent = s.defaultSaveDir;
    dirEl.value = s.saveDir || '';
    // Write-only field: never populate it with the current key, even though
    // we can't know it (the server never returns key material either way).
    dbKeyEl.value = '';
    dbKeyHintEl.textContent = s.hasCustomKey
      ? 'Using your custom key. Leave the field blank and click "Use default key" to switch back to the bundled key.'
      : 'Using the bundled application key. Enter a key above only if your save needs a different one.';
    const active = s.activeSaveDir || s.defaultSaveDir;
    statusEl.innerHTML =
      `<div>Active save directory: <span class="active-dir">${esc(active)}</span></div>` +
      `<div>DB key source: ${s.hasCustomKey ? 'your custom key' : 'bundled application resource'} (stored encrypted, never as plain text).</div>`;
  } catch (e) {
    statusEl.textContent = 'Error loading settings: ' + e.message;
  }
}

function toggleDbKeyVisibility() {
  const input = document.getElementById('settingsDbKey');
  const btn = document.getElementById('toggleDbKeyVisibilityButton');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.innerHTML = `${actionIcon('eye')}${showing ? 'Show' : 'Hide'}`;
  btn.setAttribute('aria-pressed', showing ? 'false' : 'true');
}

async function clearDbKey() {
  const msg = document.getElementById('settingsMsg');
  msg.className = 'settings-msg';
  msg.textContent = 'Switching to the default key…';
  try {
    await api('/settings', { method: 'POST', body: JSON.stringify({ dbKey: null }) });
    msg.className = 'settings-msg ok';
    msg.textContent = 'Now using the bundled application key.';
    await loadSettings();
  } catch (e) {
    msg.className = 'settings-msg err';
    msg.textContent = 'Error: ' + e.message;
    showToast(`Could not switch key: ${e.message}`, 'error');
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
  const saveDir = document.getElementById('settingsSaveDir').value.trim();
  const dbKey = document.getElementById('settingsDbKey').value.trim();
  if (dbKey && dbKey.length !== 32) {
    msg.className = 'settings-msg err';
    msg.textContent = `Database key must be exactly 32 characters (got ${dbKey.length}).`;
    return;
  }
  msg.textContent = 'Saving…';
  const body = { saveDir: saveDir || null };
  // Only include dbKey when the user actually typed one -- an empty field
  // means "leave the current key/override alone", not "clear it" (that's
  // what the separate "Use default key" button/clearDbKey() is for).
  if (dbKey) body.dbKey = dbKey;
  try {
    const s = await api('/settings', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    msg.className = 'settings-msg ok';
    msg.textContent = 'Saved. Changes apply immediately — re-open other pages to use the new save.';
    await loadSettings();
    return s;
  } catch (e) {
    msg.className = 'settings-msg err';
    msg.textContent = 'Error: ' + e.message;
    showToast(`Could not save settings: ${e.message}`, 'error');
  }
}

// ---- Canonical recipe component planners ----
// Each recipe renders as a self-contained card (product, duration, a
// ready/missing badge, its full component list, and its own craft-qty +
// Add Missing/Add All controls) in a searchable/filterable grid, instead of
// a single dropdown-driven detail view -- so all recipes (and which ones
// you can already craft) are visible and scannable at once.
const CRAFTING_KINDS = {
  workshop: { recipes: RECIPE_DATA.recipes.workshop },
  munitions: { recipes: RECIPE_DATA.recipes.munitions }
};
let _craftingInventory = {};
let _craftingKind = 'workshop';
const craftingCfg = () => CRAFTING_KINDS[_craftingKind];
// Per-recipe "quantity to craft" state, keyed by recipe id, so it survives a
// grid re-render (e.g. after a search/filter change or another card's add).
const _craftingQty = {};

function craftQtyFor(recipeId) {
  return _craftingQty[recipeId] || 1;
}

function recipeReady(totals) {
  return totals.components.every(component => component.missing == null || component.missing <= 0);
}

function renderRecipeCard({ recipe, requested, crafts, components }) {
  const encId = encodeURIComponent(recipe.id);
  const ready = recipeReady({ components });
  const missingCount = components.filter(component => component.missing > 0).length;
  const badge = ready
    ? '<span class="recipe-badge ready">Ready</span>'
    : `<span class="recipe-badge missing">Missing ${missingCount}</span>`;
  const compRows = components.map(component => {
    const unsupported = !component.writable || !component.itemId;
    const enough = !unsupported && component.owned >= component.total;
    const status = unsupported
      ? '<span class="recipe-unverified">holding unknown</span>'
      : enough ? '<span class="ok">enough</span>' : `<span class="add">+${component.missing} to add</span>`;
    return `<div class="recipe-comp-row ${enough ? 'have-enough' : ''} ${unsupported ? 'recipe-unsupported' : ''}">
      <span class="recipe-comp-name-wrap"><span class="recipe-comp-name" title="${esc(component.name)}">${esc(component.name)}</span>${technicalDetails(component.itemId || 'Unresolved against reference save', 'Show component mapping')}</span>
      <span class="recipe-comp-status">need ${component.total}${unsupported ? '' : ' · have ' + component.owned} · ${status}</span>
    </div>`;
  }).join('');
  return `<article class="recipe-card ${ready ? 'is-ready' : ''}" data-recipe-card="${encId}">
    <div class="recipe-card-head">
      <div class="recipe-card-head-main">
        <span class="recipe-icon">${appIcon(STATION_ICON[recipe.station])}</span>
        <div>
          <h3>${esc(recipe.product.name)}</h3>
          <span class="recipe-meta">${esc(recipe.duration.label)} · ${esc(recipe.prerequisiteName)} ${technicalDetails(recipe.product.itemId || 'Wiki identity only', 'Show product technical ID')}</span>
        </div>
      </div>
      ${badge}
    </div>
    <div class="recipe-components">${compRows}</div>
    <span class="settings-msg" id="craftop-${encId}" aria-live="polite"></span>
    <div class="recipe-card-actions">
      <label>Qty <input type="number" class="recipe-qty-input" data-recipe="${encId}" id="craftqty-${encId}" value="${requested}" min="1" max="2147483647" step="1"></label>
      <button class="mini" data-action="craft-add-missing" data-recipe="${encId}" ${missingCount ? '' : 'disabled'}>${actionIcon('add')}Add Missing</button>
      <button class="btn-ghost" data-action="craft-add-all" data-recipe="${encId}">${actionIcon('add')}Add all</button>
    </div>
    <p class="recipe-crafts-note">${requested} needed · ${crafts} craft${crafts === 1 ? '' : 's'} · ${recipe.product.quantity} per craft</p>
  </article>`;
}

function renderCraftingGrid() {
  const grid = document.getElementById('craftingGrid');
  const q = document.getElementById('craftingSearch').value.trim();
  const stateFilter = document.getElementById('craftingStateFilter').value;
  const recipes = craftingCfg().recipes;

  let rows = q
    ? filterAndRank(recipes, q, recipe => [recipe.product.name, recipe.product.itemId, recipe.id, recipe.duration.label, ...recipe.components.flatMap(component => [component.name, component.itemId])])
    : recipes.slice().sort((a, b) => a.product.name.localeCompare(b.product.name));

  let computed = rows.map(recipe => recipePlannerTotals(recipes, _craftingInventory, recipe.id, craftQtyFor(recipe.id)));
  if (stateFilter !== 'any') computed = computed.filter(result => (stateFilter === 'ready') === recipeReady(result));

  const parts = [];
  if (q) parts.push('“' + q + '”');
  if (stateFilter !== 'any') parts.push(stateFilter === 'ready' ? 'ready to craft' : 'missing components');
  document.getElementById('craftingFilterSummary').innerHTML = filterSummaryHtml(computed.length, parts);

  if (!computed.length) { grid.innerHTML = '<div class="empty-state"><strong>No matching recipes</strong><br>Try another product or component name.</div>'; return; }
  setRenderedHtml(grid, computed.map(renderRecipeCard).join(''));
}

function updateCraftQty(recipeId, value) {
  let qty = Number(value);
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  _craftingQty[recipeId] = Math.min(2147483647, Math.floor(qty));
  renderCraftingGrid();
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
  renderCraftingGrid();
}

async function addCanonicalComponents(components, inventory, mode, messageEl, buttons) {
  const unsupported = components.filter(component => !component.writable || !component.itemId);
  const list = components.filter(component => component.writable && component.itemId).map(component => ({ ...component, addQuantity: mode === 'all' ? component.total : component.missing })).filter(component => component.addQuantity > 0);
  if (!list.length) { messageEl.className = unsupported.length ? 'settings-msg warn' : 'settings-msg ok'; messageEl.textContent = unsupported.length ? `Nothing safely writable to add; ${unsupported.length} requirement(s) remain informational.` : 'Nothing to add — verified requirements are already covered.'; return; }
  if (!await confirmAction(`Experimental: add ${list.length} verified component type(s)? ${unsupported.length ? unsupported.length + ' unsupported requirement(s) will be skipped. ' : ''}Make a backup first.`, { title: 'Add crafting components', acceptLabel: 'Add Components', tone: 'warning', icon: 'add' })) return;
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

async function craftingAdd(encRecipeId, mode) {
  const recipeId = decodeURIComponent(encRecipeId);
  const card = document.querySelector(`[data-recipe-card="${CSS.escape(encRecipeId)}"]`);
  const messageEl = document.getElementById(`craftop-${encRecipeId}`);
  const qty = craftQtyFor(recipeId);
  const result = recipePlannerTotals(craftingCfg().recipes, _craftingInventory, recipeId, qty);
  const buttons = card ? [...card.querySelectorAll('.recipe-card-actions button')] : [];
  await addCanonicalComponents(result.components, _craftingInventory, mode, messageEl, buttons);
  renderCraftingGrid();
}
async function craftingAddMissing(encRecipeId) { await craftingAdd(encRecipeId, 'missing'); }
async function craftingAddAll(encRecipeId) { await craftingAdd(encRecipeId, 'all'); }
async function loadCrafting() {
  const grid = document.getElementById('craftingGrid');
  try {
    const items = await api('/inventory');
    _craftingInventory = {};
    for (const item of items) _craftingInventory[item.name] = item.quantity;
  } catch (error) {
    grid.innerHTML = `<div class="empty-state"><strong>Could not read inventory</strong><br>${esc(error.message)}</div>`;
    return;
  }
  renderCraftingGrid();
}

expose({ loadSettings, pickSaveDir, clearSaveDir, saveSettings, toggleDbKeyVisibility, clearDbKey, loadCrafting, setCraftingKind, renderCraftingGrid, updateCraftQty, craftingAddMissing, craftingAddAll, addCanonicalComponents });

