const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'public', 'modules', 'features', 'inventory');
const helper = fs.readFileSync(path.join(root, 'item-view.mjs'), 'utf8');
const inventory = fs.readFileSync(path.join(root, 'list.mjs'), 'utf8');
const addItems = fs.readFileSync(path.join(root, 'add-items.mjs'), 'utf8');

test('inventory pages share one escaped item identity renderer', () => {
  assert.match(helper, /export function itemIdentityHtml/);
  for (const field of ['id', 'label', 'slot']) assert.match(helper, new RegExp(`esc\\(${field}\\)`));
  assert.equal((helper.match(/technicalDetails\(id\)/g) || []).length, 1);
  assert.match(helper, /itemCategoryPills\(category, subtype, sourceMap\)/);
  assert.match(helper, /itemDescription\(description, buffs, debuffs\)/);
  assert.match(inventory, /import \{ itemIdentityHtml \} from '\.\/item-view\.mjs';/);
  assert.match(addItems, /import \{ itemIdentityHtml \} from '\.\/item-view\.mjs';/);
  assert.doesNotMatch(inventory, /technicalDetails\(r\.name\)/);
  assert.doesNotMatch(addItems, /technicalDetails\(r\.id\)/);
});
