const test = require('node:test');
const assert = require('node:assert/strict');

let disclosureSectionHtml, rerenderAndRestoreFocus;

test.before(async () => {
  ({ disclosureSectionHtml, rerenderAndRestoreFocus } = await import('../public/modules/disclosure-ui.mjs'));
});

test('disclosure section escapes metadata, allowlists headings, and omits collapsed bodies', () => {
  const collapsed = disclosureSectionHtml({
    id: 'section-<x>', headingLevel: 2, title: '<Inventory>', count: '1 < 2',
    expanded: false, action: 'toggle-<x>', data: { category: 'A"B', 'bad key': 'ignored' },
    className: 'domain <x>', toggleClass: 'toggle <x>', panelClass: 'panel <x>',
    bodyHtml: '<em>trusted</em>'
  });
  assert.match(collapsed, /<section class="disclosure-section domain &lt;x&gt;">/);
  assert.match(collapsed, /<h3 class="disclosure-heading">/);
  assert.doesNotMatch(collapsed, /<h2/);
  assert.match(collapsed, /id="section-&lt;x&gt;"/);
  assert.match(collapsed, /aria-controls="section-&lt;x&gt;-panel"/);
  assert.match(collapsed, /data-category="A&quot;B"/);
  assert.doesNotMatch(collapsed, /bad key|<em>trusted<\/em>/);
  assert.match(collapsed, /aria-expanded="false"/);
  assert.match(collapsed, / hidden><\/div>/);

  const expanded = disclosureSectionHtml({ id: 'section', headingLevel: 4, title: 'Title', count: '2', expanded: true, bodyHtml: '<em>trusted</em>' });
  assert.match(expanded, /<h4 class="disclosure-heading">/);
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(expanded, /<em>trusted<\/em>/);
  assert.doesNotMatch(expanded, / hidden/);
});

test('rerender helper restores a stable trigger id and reports the result', () => {
  const original = global.document;
  let rendered = false;
  let focused = null;
  global.document = { getElementById: id => id === 'stable' ? { focus: options => { focused = options; } } : null };
  try {
    assert.equal(rerenderAndRestoreFocus(() => { rendered = true; }, { id: 'stable' }), true);
    assert.equal(rendered, true);
    assert.deepEqual(focused, { preventScroll: true });
    assert.equal(rerenderAndRestoreFocus(() => {}, { id: 'missing' }), false);
  } finally {
    global.document = original;
  }
});
