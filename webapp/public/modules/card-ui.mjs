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
  titleId = '',
  focusableTitle = false,
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
  return `<article class="card-ui ${esc(cardClass)}"${dataAttributes}>
    <header class="card-ui__header">
      ${iconHtml ? `<span class="card-ui__icon">${iconHtml}</span>` : ''}
      <div class="card-ui__identity">
        ${eyebrow ? `<span class="card-ui__eyebrow">${esc(eyebrow)}</span>` : ''}
        <h3 class="card-ui__title"${titleAttributes}>${esc(title)}${titleHtml}</h3>
        ${subtitle || subtitleHtml ? `<p class="card-ui__subtitle">${esc(subtitle)}${subtitleHtml}</p>` : ''}
      </div>
      ${statusHtml ? `<div class="card-ui__status">${statusHtml}</div>` : ''}
    </header>
    ${bodyHtml ? `<div class="card-ui__body">${bodyHtml}</div>` : ''}
    ${footerHtml ? `<footer class="card-ui__footer">${footerHtml}</footer>` : ''}
  </article>`;
}
