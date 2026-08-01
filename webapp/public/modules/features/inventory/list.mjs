import { FW } from '../../runtime.mjs';
import { loadCatalog, describeItem, ITEM_CAT_ORDER, catalogWarningHtml, highValueBadge, itemDescription } from './catalog.mjs';

const { api, esc, filterAndRank, filterSummaryHtml, noMatchesHtml, setRenderedHtml, itemTypeIcon, technicalDetails, itemCategoryPills, actionIcon, receiptHtml, readIntegerInput, setLocalBusy, showToast, errorDetailHtml, loadErrorHtml, showLoading } = FW;

let _inventory = [];
let _invSubByCat = {};

export async function loadInventory() {
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
    el.innerHTML = loadErrorHtml('your inventory', err);
  }
}

// Sub-types available for a given category, drawn from the index built in
// loadInventory(). Kept alongside that state rather than in catalog.mjs since
// it reflects what's actually in this save's inventory, not the catalog.
function invSubTypes(cat) {
  return (_invSubByCat[cat] || []).slice();
}

// Populate the sub-type dropdown for the currently selected category.
function populateInvSubFilter() {
  const cat = document.getElementById('inventoryFilter').value;
  const sub = document.getElementById('inventorySubFilter');
  const subs = cat ? invSubTypes(cat) : [];
  sub.innerHTML = '<option value="">All</option>' +
    subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
}

export function onInvCategoryChange() {
  populateInvSubFilter();
  resetInvExpansion();
  renderInventory();
}

export function clearInvFilters() {
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
export function resetInvExpansion() {
  _invExpanded = null;
}

export function renderInventory() {
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

  if (!rows.length) { el.innerHTML = catalogWarningHtml() + noMatchesHtml('No matching items', 'Try fewer words, or clear a filter.'); return; }

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
  let html = catalogWarningHtml();
  html += `<div class="inv-summary-line">${rows.length} item type(s) · ${totalUnits.toLocaleString()} total unit(s) shown · ` +
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
            ${itemDescription(r.d.description, r.d.buffs, r.d.debuffs)}
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

export function toggleInvSection(cat) {
  if (_invExpanded === null) _invExpanded = new Set();
  if (_invExpanded.has(cat)) _invExpanded.delete(cat);
  else _invExpanded.add(cat);
  renderInventory();
}

export function toggleAllInvSections(open) {
  const cats = [...document.querySelectorAll('#inventoryList .inv-cat-title')].map(e => e.textContent);
  _invExpanded = new Set(open ? cats : []);
  renderInventory();
}

export function findInventoryItem(name) {
  return _inventory.find(entry => entry.name === name);
}

// Update the quantity of an inventory item. The action passes the
// encodeURIComponent'd item name; resolve it back to the real RowName, read the
// new quantity + sourceMap from the row's inputs, and call /inventory/update.
// Source identification is left to the backend (it auto-detects the map), but
// we pass the row's sourceMap hint when present for an exact-target write.
export async function updateItem(encName) {
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
    if (inline) { inline.className = 'operation-inline error'; inline.innerHTML = errorDetailHtml(err, 'This quantity could not be saved.'); }
    showToast(`Could not update ${name}.`, 'error');
  } finally {
    if (button) setLocalBusy(button, false);
  }
}

// Quick-set a known quantity (0 or Max) for an item from the inline buttons.
export async function setQty(encName, value) {
  const qtyInput = document.getElementById('qty-' + encName);
  if (qtyInput) qtyInput.value = value;
  await updateItem(encName);
}
