import { esc } from '../../dom.mjs';

export function buildFacetIndex(rows, {
  categoryOf,
  subcategoryOf,
  categoryOrder = [],
  emptySubcategory = '—'
}) {
  const categoriesFound = new Set();
  const subcategorySets = new Map();
  for (const row of rows) {
    const category = categoryOf(row);
    if (!category) continue;
    categoriesFound.add(category);
    if (!subcategorySets.has(category)) subcategorySets.set(category, new Set());
    subcategorySets.get(category).add(subcategoryOf(row) || emptySubcategory);
  }
  const categories = [
    ...categoryOrder.filter(category => categoriesFound.has(category)),
    ...[...categoriesFound].filter(category => !categoryOrder.includes(category)).sort((a, b) => a.localeCompare(b))
  ];
  const subcategories = Object.fromEntries(categories.map(category => [
    category,
    [...(subcategorySets.get(category) || [])].sort((a, b) => a.localeCompare(b))
  ]));
  return { categories, subcategories };
}

export function setSelectOptions(select, values, {
  allLabel = 'All',
  allValue = '',
  selected = allValue
} = {}) {
  if (!select) return allValue;
  const actual = values.includes(selected) ? selected : allValue;
  select.innerHTML = `<option value="${esc(allValue)}">${esc(allLabel)}</option>${values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}`;
  select.value = actual;
  return actual;
}

export function createSectionExpansionState() {
  let openCategories = null;
  return {
    reset() { openCategories = null; },
    initialize(categories, { expandAll = false } = {}) {
      if (openCategories === null) openCategories = new Set(expandAll ? categories : categories.slice(0, 1));
    },
    isOpen(category) { return openCategories?.has(category) || false; },
    toggle(category) {
      if (openCategories === null) openCategories = new Set();
      if (openCategories.has(category)) openCategories.delete(category);
      else openCategories.add(category);
    },
    setAll(categories, open) { openCategories = new Set(open ? categories : []); }
  };
}
