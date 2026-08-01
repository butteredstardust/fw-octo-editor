import { esc } from './dom.mjs';

// Shared anatomy for ordinary entity cards. Dynamic text and data attributes
// are escaped here. *Html slots accept only locally generated markup whose
// own dynamic values have already been escaped by the caller or a shared helper.
export function entityCard({
  cardClass = '',
  data = {},
  iconHtml = '',
  eyebrow = '',
  title = '',
  titleHtml = '',
  headingLevel = 3,
  titleId = '',
  focusableTitle = false,
  compact = false,
  subtitle = '',
  subtitleHtml = '',
  statusHtml = '',
  bodyHtml = '',
  footerHtml = ''
} = {}) {
  const dataAttributes = Object.entries(data)
    .filter(([name]) => /^[a-z][a-z0-9-]*$/.test(name))
    .map(([name, value]) => ` data-${name}="${esc(value)}"`)
    .join('');
  const titleAttributes = `${titleId ? ` id="${esc(titleId)}"` : ''}${focusableTitle ? ' tabindex="-1"' : ''}`;
  const Heading = [3, 4, 5].includes(headingLevel) ? `h${headingLevel}` : 'h3';
  return `<article class="card-ui ${compact ? 'card-ui--compact ' : ''}${esc(cardClass)}"${dataAttributes}>
    <header class="card-ui__header">
      ${iconHtml ? `<span class="card-ui__icon">${iconHtml}</span>` : ''}
      <div class="card-ui__identity">
        ${eyebrow ? `<span class="card-ui__eyebrow">${esc(eyebrow)}</span>` : ''}
        <${Heading} class="card-ui__title"${titleAttributes}>${esc(title)}${titleHtml}</${Heading}>
        ${subtitle || subtitleHtml ? `<p class="card-ui__subtitle">${esc(subtitle)}${subtitleHtml}</p>` : ''}
      </div>
      ${statusHtml ? `<div class="card-ui__status">${statusHtml}</div>` : ''}
    </header>
    ${bodyHtml ? `<div class="card-ui__body">${bodyHtml}</div>` : ''}
    ${footerHtml ? `<footer class="card-ui__footer">${footerHtml}</footer>` : ''}
  </article>`;
}

// Semantic metric tiles. Dynamic fields are escaped; detailHtml accepts only
// locally generated markup whose dynamic values have already been escaped.
export function metricGrid({ className = '', ariaLabel = '', items = [] } = {}) {
  const tiles = items.map(({ className: itemClass = '', label = '', value = '', suffix = '', detail = '', detailHtml = '' }) => `
    <div class="metric-tile ${esc(itemClass)}">
      <dt class="metric-tile__label">${esc(label)}</dt>
      <dd class="metric-tile__value"><strong>${esc(value)}</strong>${suffix ? `<small class="metric-tile__suffix">${esc(suffix)}</small>` : ''}</dd>
      ${detail || detailHtml ? `<div class="metric-tile__detail">${esc(detail)}${detailHtml}</div>` : ''}
    </div>`).join('');
  return `<dl class="metric-grid ${esc(className)}"${ariaLabel ? ` aria-label="${esc(ariaLabel)}"` : ''}>${tiles}</dl>`;
}
