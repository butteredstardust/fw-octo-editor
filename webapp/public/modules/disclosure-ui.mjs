import { esc } from './dom.mjs';

function dataAttributes(data) {
  return Object.entries(data || {})
    .filter(([name]) => /^[a-z][a-z0-9-]*$/.test(name))
    .map(([name, value]) => ` data-${name}="${esc(value)}"`)
    .join('');
}

export function disclosureSectionHtml({
  id = '', headingLevel = 3, title = '', count = '', expanded = false,
  action = '', data = {}, className = '', toggleClass = '', panelClass = '', bodyHtml = ''
} = {}) {
  // `bodyHtml` is trusted, locally generated feature markup. All scalar copy,
  // classes, IDs, actions, and data values are escaped by this helper.
  const Heading = [3, 4].includes(headingLevel) ? `h${headingLevel}` : 'h3';
  const panelId = `${id}-panel`;
  return `<section class="disclosure-section ${esc(className)}"><${Heading} class="disclosure-heading"><button type="button" id="${esc(id)}" class="disclosure-toggle ${esc(toggleClass)}"${action ? ` data-action="${esc(action)}"` : ''}${dataAttributes(data)} aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${esc(panelId)}"><span class="disclosure-caret" aria-hidden="true">${expanded ? '▾' : '▸'}</span><span class="disclosure-title">${esc(title)}</span><span class="disclosure-count">${esc(count)}</span></button></${Heading}><div id="${esc(panelId)}" class="disclosure-panel ${esc(panelClass)}"${expanded ? '' : ' hidden'}>${expanded ? bodyHtml : ''}</div></section>`;
}

export function rerenderAndRestoreFocus(render, trigger) {
  const focusId = trigger?.id;
  render();
  const replacement = focusId ? document.getElementById(focusId) : null;
  if (!replacement) return false;
  replacement.focus({ preventScroll: true });
  return true;
}
