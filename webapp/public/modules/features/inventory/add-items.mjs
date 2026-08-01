import { FW } from '../../runtime.mjs';
import { itemPresentation, sourceMapForCatalog, ITEM_CAT_ORDER, highValueBadge } from './catalog.mjs';
import { buildFacetIndex, createSectionExpansionState, setSelectOptions } from './facets.mjs';
import { itemIdentityHtml } from './item-view.mjs';

const { api, esc, filterAndRank, cleanFallbackName, filterSummaryHtml, emptyStateHtml, noMatchesHtml, setRenderedHtml, actionIcon, readIntegerInput, setInlineFeedback, showToast, loadErrorHtml, showLoading } = FW;

// Category ordering for the Add Items page (gear/loot buckets from the wiki).
const ADD_CAT_ORDER = ITEM_CAT_ORDER;

let _addCatalog = [];
let _addFacets = { categories: [], subcategories: {} };
const addExpansion = createSectionExpansionState();

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
    _addFacets = buildFacetIndex(_addCatalog, {
      categoryOf: item => item.grp,
      subcategoryOf: item => item.sub,
      categoryOrder: ADD_CAT_ORDER
    });
    setSelectOptions(document.getElementById('addFilter'), _addFacets.categories);
    populateAddSubFilter();
    renderAddCatalog();
  } catch (err) {
    setRenderedHtml(el, loadErrorHtml('the item catalog', err));
  }
}

// Populate the sub-type dropdown for the currently selected category.
function populateAddSubFilter() {
  const cat = document.getElementById('addFilter').value;
  const sub = document.getElementById('addSubFilter');
  const subs = cat ? (_addFacets.subcategories[cat] || []) : [];
  setSelectOptions(sub, subs);
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
  addExpansion.reset();
}

export function renderAddCatalog() {
  const el = document.getElementById('addCatalogList');
  if (!_addCatalog.length) { setRenderedHtml(el, emptyStateHtml('No catalog loaded', 'Reload the page to try loading the item catalog again.', { role: 'alert' })); return; }
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

  if (!rows.length) { setRenderedHtml(el, noMatchesHtml('No catalog matches', 'Try another name, or clear a filter.')); return; }

  const groups = {};
  for (const r of rows) (groups[r.grp] = groups[r.grp] || []).push(r);
  const catsShown = ADD_CAT_ORDER.filter(c => groups[c]);

  addExpansion.initialize(catsShown, { expandAll: !!q });

  let html = `<div class="inv-summary-line">${rows.length} item(s) available to add · ` +
    `<button type="button" id="add-items-expand-all" class="inv-toggle-all" data-action="toggle-all-add-items" data-open="true">expand all</button> · ` +
    `<button type="button" id="add-items-collapse-all" class="inv-toggle-all" data-action="toggle-all-add-items" data-open="false">collapse all</button></div>`;
  for (const cat of catsShown) {
    const list = groups[cat];
    const open = addExpansion.isOpen(cat);
    html += `<div class="add-section">
      <button type="button" id="add-items-section-${encodeURIComponent(cat)}" class="add-cat-head ${open ? 'open' : ''}" data-action="toggle-add-items-section" data-category="${esc(cat)}" aria-expanded="${open ? 'true' : 'false'}">
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
        ${itemIdentityHtml({
          id: r.id,
          label: r.wiki || cleanFallbackName(r.id),
          category: r.grp,
          subtype: r.sub || r.category,
          sourceMap: sourceMapForCatalog(r),
          badgeHtml: hv,
          description: r.description,
          buffs: r.buffs,
          debuffs: r.debuffs,
          classes: { main: 'add-main', nameRow: 'add-name-row', name: 'add-name', tag: 'add-tag' },
          trailingHtml: `<div class="${haveCls}">${haveTxt}${owned ? ' · edit on Inventory page' : ''}</div><div class="operation-inline" id="addop-${enc}" aria-live="polite"></div>`
        })}
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
  addExpansion.toggle(cat);
  renderAddCatalog();
}

export function toggleAllAddSections(open) {
  const cats = [...document.querySelectorAll('#addCatalogList .add-cat-title')].map(e => e.textContent);
  addExpansion.setAll(cats, open);
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
  setInlineFeedback(inline, { state: 'pending', message: `Adding ${qty.toLocaleString()}…` });
  const result = await api('/inventory/add', {
    method: 'POST', body: JSON.stringify(body)
  }).catch(err => {
    setInlineFeedback(inline, { state: 'error', error: err, fallback: 'This item could not be added.' });
    showToast(`Could not add ${cat?.wiki || cleanFallbackName(id)}.`, 'error');
    return null;
  });
  if (!result) return;
  if (!result.success && !result.added) {
    setInlineFeedback(inline, { state: 'error', message: 'Could not confirm this was added. Try again.' });
  } else if (result.added === false) {
    setInlineFeedback(inline, { message: 'Already owned—adjust it from Inventory.' });
  } else {
    const friendly = cat?.wiki || cleanFallbackName(id);
    setInlineFeedback(inline, { state: 'success', message: `Added ${qty.toLocaleString()} × ${friendly}.`, result });
    row?.classList.add('changed-flash');
    showToast(`${friendly} was added and verified.`);
    if (cat) cat.have = (cat.have || 0) + qty;
    setTimeout(renderAddCatalog, 850);
  }
}
