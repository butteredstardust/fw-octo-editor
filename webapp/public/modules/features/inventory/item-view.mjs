import { FW } from '../../runtime.mjs';
import { itemDescription } from './catalog.mjs';

const { esc, itemTypeIcon, itemCategoryPills, technicalDetails } = FW;

// Shared item identity only: icon, readable name, one technical-ID
// disclosure, taxonomy, optional slot, and descriptive metadata. Callers
// retain their domain-specific card shell, quantity/ownership state, and
// actions. Markup extension slots accept only locally generated HTML; every
// item-derived string is escaped here or by an existing escaped helper.
export function itemIdentityHtml({
  id,
  label,
  category,
  subtype,
  sourceMap,
  slot = '',
  badgeHtml = '',
  description = '',
  buffs = '',
  debuffs = '',
  classes = {},
  trailingNameHtml = '',
  trailingHtml = ''
}) {
  const mainClass = classes.main || 'item-identity-main';
  const nameRowClass = classes.nameRow || 'item-identity-name-row';
  const nameClass = classes.name || 'item-identity-name';
  const tagClass = classes.tag || 'item-identity-tag';
  return `${itemTypeIcon(category, subtype)}
    <div class="${esc(mainClass)}">
      <div class="${esc(nameRowClass)}">
        <span class="${esc(nameClass)}" title="${esc(id)}">${esc(label)}</span>
        ${technicalDetails(id)}${badgeHtml}${trailingNameHtml}
      </div>
      ${itemCategoryPills(category, subtype, sourceMap)}
      ${slot ? `<div class="${esc(tagClass)}"><span>${esc(slot)}</span></div>` : ''}
      ${itemDescription(description, buffs, debuffs)}
      ${trailingHtml}
    </div>`;
}
