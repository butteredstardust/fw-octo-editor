import { FW } from '../../runtime.mjs';
import { itemPresentation, sourceMapForCatalog, ITEM_CAT_ORDER, itemDescription, highValueBadge } from './catalog.mjs';

const { api, esc, filterAndRank, cleanFallbackName, filterSummaryHtml, noMatchesHtml, setRenderedHtml, itemTypeIcon, itemCategoryPills, technicalDetails, actionIcon, readIntegerInput, showToast, errorDetailHtml, loadErrorHtml, receiptHtml, showLoading } = FW;

// Category ordering for the Add Items page (gear/loot buckets from the wiki).
const ADD_CAT_ORDER = ITEM_CAT_ORDER;

let _addCatalog = [];
let _addCatIndex = {};
let _addSubByCat = {};
let _addExpanded = null;

export async function loadAddCatalog() {
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
    el.innerHTML = loadErrorHtml('the item catalog', err);
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

export function onAddCategoryChange() {
  populateAddSubFilter();
  resetAddExpansion();
  renderAddCatalog();
}

export function clearAddFilters() {
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
export function resetAddExpansion() {
  _addExpanded = null;
}

export function renderAddCatalog() {
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

  if (!rows.length) { el.innerHTML = noMatchesHtml('No catalog matches', 'Try another name, or clear a filter.'); return; }

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
          ${itemDescription(r.description, r.buffs, r.debuffs)}
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

export function toggleAddSection(cat) {
  if (_addExpanded === null) _addExpanded = new Set();
  if (_addExpanded.has(cat)) _addExpanded.delete(cat);
  else _addExpanded.add(cat);
  renderAddCatalog();
}

export function toggleAllAddSections(open) {
  const cats = [...document.querySelectorAll('#addCatalogList .add-cat-title')].map(e => e.textContent);
  _addExpanded = new Set(open ? cats : []);
  renderAddCatalog();
}

export async function addItem(encId) {
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
    if (inline) { inline.className = 'operation-inline error'; inline.innerHTML = errorDetailHtml(err, 'This item could not be added.'); }
    showToast(`Could not add ${cat?.wiki || cleanFallbackName(id)}.`, 'error');
    return null;
  });
  if (!result) return;
  if (!result.success && !result.added) {
    if (inline) { inline.className = 'operation-inline error'; inline.textContent = 'Could not confirm this was added. Try again.'; }
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
