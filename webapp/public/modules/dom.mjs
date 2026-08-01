// Escape a value for safe insertion into innerHTML (defends against any
// save/DB string that contains < > & " ').
export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function technicalDetails(id, label = 'Show technical ID') {
  return `<details class="technical-details"><summary title="${esc(label)}" aria-label="${esc(label)}">i</summary><span class="technical-id">${esc(id)}</span></details>`;
}

function operationFeedbackFor(control) {
  return control?.closest('.page')?.querySelector('[data-operation-status]') || null;
}

function filterSummaryHtml(count, parts) {
  return `<span class="result-count">${count.toLocaleString()} result${count === 1 ? '' : 's'}</span>${parts.map(part => `<span class="filter-chip">${esc(part)}</span>`).join('')}`;
}

function showLoading(element, count = 4, label = 'Loading') {
  if (!element) return;
  element.setAttribute('aria-busy', 'true');
  element.innerHTML = `<span class="sr-only">${esc(label)}…</span><div class="skeleton-grid" aria-hidden="true">${Array.from({ length: count }, () => '<div class="skeleton-card"><span></span><span></span><span></span></div>').join('')}</div>`;
}

function setRenderedHtml(element, html) {
  if (!element) return;
  const activeId = element.contains(document.activeElement) ? document.activeElement.id : '';
  const openDetails = [...element.querySelectorAll('details[open]')].map((details, index) => details.id || details.dataset.stateKey || `${index}:${details.querySelector('summary')?.textContent || ''}`);
  element.innerHTML = html;
  element.removeAttribute('aria-busy');
  [...element.querySelectorAll('details')].forEach((details, index) => {
    const key = details.id || details.dataset.stateKey || `${index}:${details.querySelector('summary')?.textContent || ''}`;
    if (openDetails.includes(key)) details.open = true;
  });
  if (activeId) document.getElementById(activeId)?.focus({ preventScroll: true });
}

// Only needed for multi-step progress text (e.g. "Updating 3 of 8…"). The dispatcher's
// automatic .is-pending spinner already covers single-mutation buttons, and a custom
// label set here is invisible while pending since .is-pending sets color:transparent.
function setLocalBusy(control, busy, label) {
  if (!control) return;
  if (busy) {
    control.dataset.originalLabel = control.textContent;
    control.disabled = true;
    control.textContent = label || 'Saving…';
  } else {
    control.disabled = false;
    control.textContent = control.dataset.originalLabel || control.textContent;
    delete control.dataset.originalLabel;
  }
}

export { operationFeedbackFor, filterSummaryHtml, showLoading, setRenderedHtml, setLocalBusy };
