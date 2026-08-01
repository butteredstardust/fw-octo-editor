const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const publicRoot = path.join(__dirname, '..', 'public');

test('entityCard escapes data fields and renders each shared anatomy region once', async () => {
  const { entityCard } = await import(pathToFileURL(path.join(publicRoot, 'modules', 'card-ui.mjs')));
  const html = entityCard({
    cardClass: 'fixture <bad>',
    data: { fixture: 'one" data-probe="bad', 'Bad Name': 'ignored' },
    eyebrow: '<img data-probe>',
    title: '<script>bad()</script>',
    titleId: 'heading"bad',
    focusableTitle: true,
    subtitle: 'A & B',
    statusHtml: '<span class="trusted-status">Ready</span>',
    bodyHtml: '<div class="trusted-body">Body</div>',
    footerHtml: '<button>Action</button>'
  });

  assert.doesNotMatch(html, /<script>|<img data-probe>|data-probe="bad"/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /id="heading&quot;bad" tabindex="-1"/);
  assert.match(html, /data-fixture="one&quot; data-probe=&quot;bad"/);
  for (const className of ['card-ui__header', 'card-ui__identity', 'card-ui__title', 'card-ui__status', 'card-ui__body', 'card-ui__footer']) {
    assert.equal((html.match(new RegExp(`class="${className}`, 'g')) || []).length, 1, `${className} should render once`);
  }
  assert.match(html, /trusted-status/);
  assert.match(html, /trusted-body/);
});

test('recipes, rigs, and presets compose their feature content through entityCard', () => {
  const files = [
    'modules/features/settings-planners.mjs',
    'modules/features/inventory/rigs.mjs',
    'modules/features/weapons.mjs'
  ].map(file => fs.readFileSync(path.join(publicRoot, file), 'utf8'));
  for (const source of files) {
    assert.match(source, /import \{ entityCard \}/);
    assert.match(source, /entityCard\(\{/);
  }
  assert.match(files[0], /data: \{ 'recipe-card': encId \}/);
  assert.match(files[1], /titleId: `rig-heading-\$\{enc\}`/);
  assert.match(files[1], /focusableTitle: true/);
});

test('shared card CSS owns structure while feature CSS retains domain variants', () => {
  const shared = fs.readFileSync(path.join(publicRoot, 'css', 'shared-pages.css'), 'utf8');
  const planners = fs.readFileSync(path.join(publicRoot, 'css', 'planners.css'), 'utf8');
  const refinements = fs.readFileSync(path.join(publicRoot, 'css', 'refinements.css'), 'utf8');
  assert.match(shared, /\.card-ui \{[^}]*display:flex[^}]*border:1px solid var\(--gunmetal\)/);
  assert.match(shared, /\.card-ui__footer \{[^}]*margin-top:auto[^}]*border-top/);
  assert.match(shared, /@media \(max-width:700px\)[\s\S]{0,250}\.card-ui__header \{ flex-wrap:wrap/);
  assert.match(planners, /\.recipe-card\.is-ready/);
  assert.match(refinements, /\.rig-card\.owned/);
  assert.match(refinements, /\.preset-card\.is-active/);
});
