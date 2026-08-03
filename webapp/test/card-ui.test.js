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

test('entityCard allows h3 through h5 card titles and supports compact cards', async () => {
  const { entityCard } = await import(pathToFileURL(path.join(publicRoot, 'modules', 'card-ui.mjs')));
  assert.match(entityCard({ title: 'Default' }), /<h3 class="card-ui__title">Default<\/h3>/);
  assert.match(entityCard({ title: 'Nested', headingLevel: 4 }), /<h4 class="card-ui__title">Nested<\/h4>/);
  assert.match(entityCard({ title: 'Deeply nested', headingLevel: 5 }), /<h5 class="card-ui__title">Deeply nested<\/h5>/);
  assert.match(entityCard({ title: 'Compact', compact: true }), /class="card-ui card-ui--compact /);
  assert.match(entityCard({ title: 'Invalid', headingLevel: 2 }), /<h3 class="card-ui__title">Invalid<\/h3>/);
  assert.doesNotMatch(entityCard({ title: 'Hostile', headingLevel: '3><script>' }), /<script>|<h3><script>/);
});

test('metricGrid escapes metric fields and keeps paired dt/dd semantics', async () => {
  const { metricGrid } = await import(pathToFileURL(path.join(publicRoot, 'modules', 'card-ui.mjs')));
  const html = metricGrid({
    className: 'fixture <bad>',
    ariaLabel: 'Summary <img data-metric-probe>',
    items: [
      { className: 'zero <bad>', label: '<script>Label</script>', value: '4 & 5', suffix: ' / 9', detail: '<img data-metric-probe>', detailHtml: '<span class="trusted-detail">Trusted</span>' },
      { label: 'Second', value: 0 }
    ]
  });
  assert.doesNotMatch(html, /<script>|<img data-metric-probe>/);
  assert.match(html, /aria-label="Summary &lt;img data-metric-probe&gt;"/);
  assert.match(html, /&lt;script&gt;Label&lt;\/script&gt;/);
  assert.match(html, /4 &amp; 5/);
  assert.match(html, /class="metric-tile__suffix"> \/ 9/);
  assert.match(html, /trusted-detail/);
  assert.equal((html.match(/<dt class="metric-tile__label">/g) || []).length, 2);
  assert.equal((html.match(/<dd class="metric-tile__value">/g) || []).length, 2);
  assert.match(metricGrid(), /^<dl class="metric-grid "><\/dl>$/);
});

test('recipes, rigs, and presets compose their feature content through entityCard', () => {
  const files = [
    'modules/features/settings-planners.mjs',
    'modules/features/inventory/rigs.mjs',
    'modules/features/weapons.mjs'
  ].map(file => fs.readFileSync(path.join(publicRoot, file), 'utf8'));
  for (const source of files) {
    assert.match(source, /import \{[^}]*entityCard/);
    assert.match(source, /entityCard\(\{/);
  }
  assert.match(files[0], /data: \{ 'recipe-card': encId \}/);
  assert.match(files[1], /titleId: `rig-heading-\$\{enc\}`/);
  assert.match(files[1], /focusableTitle: true/);
});

test('characters, weapon XP, and faction trust cards use shared anatomy without losing controls', () => {
  const characters = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'characters.mjs'), 'utf8');
  const weapons = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'weapons.mjs'), 'utf8');
  const vendors = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'vendors-repair.mjs'), 'utf8');
  for (const source of [characters, weapons, vendors]) {
    assert.match(source, /import \{[^}]*entityCard/);
    assert.match(source, /entityCard\(\{/);
  }
  assert.match(characters, /data-action="set-level"/);
  assert.match(characters, /data-action="set-character-xp"/);
  assert.match(weapons, /class="weapon-cat"><h3>/);
  assert.match(weapons, /headingLevel: 4/);
  assert.match(weapons, /data-action="set-weapon-xp"/);
  assert.match(vendors, /bodyHtml: `[^`]*\$\{trustTrack\(f\.score\)\}`/);
  assert.match(vendors, /data-action="set-faction"/);
});

test('hub, vendor roster, and repair recipes use compact shared cards with semantic status', () => {
  const hub = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'hub.mjs'), 'utf8');
  const vendorsRepair = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'vendors-repair.mjs'), 'utf8');
  assert.match(hub, /import \{[^}]*entityCard/);
  assert.match(hub, /headingLevel: 5/);
  assert.match(hub, /<h3 class="hub-category-heading">/);
  assert.match(hub, /<h4 class="hub-group-heading">/);
  assert.match(hub, /data-action="toggle-upgrade"/);
  assert.match(vendorsRepair, /compact: true/);
  assert.match(vendorsRepair, /cardClass: `trader-card trader-card--\$\{statusCls\}`/);
  assert.match(vendorsRepair, /cardClass: `repair-card/);
  assert.match(vendorsRepair, /repair-availability/);
  assert.doesNotMatch(vendorsRepair, /repair-card-dot/);
});

test('Stats, Repair, Rigs, and IFF summaries compose through metricGrid', () => {
  const lifetime = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'lifetime-summary.mjs'), 'utf8');
  const vendorsRepair = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'vendors-repair.mjs'), 'utf8');
  const rigs = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'inventory', 'rigs.mjs'), 'utf8');
  for (const source of [lifetime, vendorsRepair, rigs]) assert.match(source, /import \{[^}]*metricGrid/);
  assert.match(lifetime, /ariaLabel: 'Lifetime player statistics'/);
  assert.match(vendorsRepair, /ariaLabel: 'Repair bench summary'/);
  assert.match(vendorsRepair, /ariaLabel: 'Faction IFF chip inventory'/);
  assert.match(rigs, /ariaLabel: 'Rig ownership summary'/);
});

// The Overview and Stats pages must render the same lifetime numbers from one
// component -- two copies would drift the moment either is restyled.
test('the lifetime summary is one component used by both pages', () => {
  const dashboard = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'dashboard.mjs'), 'utf8');
  const stats = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'stats.mjs'), 'utf8');
  for (const source of [dashboard, stats]) assert.match(source, /import \{ lifetimeSummaryHtml \} from '\.\/lifetime-summary\.mjs'/);
  assert.match(dashboard, /lifetimeSummaryHtml\(stats\.player\)/);
  const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
  assert.match(html, /id="dashLifetime"/);
});

// Every codex the game defines is editable here; the set used to stop at six
// because three of them were missing from the catalog.
test('the overview lists all nine codexes and renders them compactly', () => {
  const dashboard = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'dashboard.mjs'), 'utf8');
  const canonical = require('../data/items.canonical.json').items;
  const listed = [...dashboard.matchAll(/\{ id: '([^']+)'[^}]*group: 'codex' \}/g)].map(match => match[1]);
  assert.equal(listed.length, 9);
  for (const id of listed) assert.ok(canonical[id], `${id} is on the overview but absent from the catalog`);
  const catalogCodexes = Object.keys(canonical).filter(id => /^Codex/i.test(id));
  assert.deepEqual(listed.slice().sort(), catalogCodexes.slice().sort());
  // Compact rows, not full cards: nine codex cards pushed the page's other sections off-screen.
  assert.match(dashboard, /group: 'codex'/);
  assert.match(dashboard, /function resourceRow/);
  assert.match(fs.readFileSync(path.join(publicRoot, 'css', 'shared-pages.css'), 'utf8'), /\.resource-compact \{[^}]*grid-template-columns/);
});

test('shared card CSS owns structure while feature CSS retains domain variants', () => {
  const shared = fs.readFileSync(path.join(publicRoot, 'css', 'shared-pages.css'), 'utf8');
  const planners = fs.readFileSync(path.join(publicRoot, 'css', 'planners.css'), 'utf8');
  const refinements = fs.readFileSync(path.join(publicRoot, 'css', 'refinements.css'), 'utf8');
  assert.match(shared, /\.card-ui \{[^}]*display:flex[^}]*border:1px solid var\(--gunmetal\)/);
  assert.match(shared, /\.card-ui__footer \{[^}]*margin-top:auto[^}]*border-top/);
  assert.match(shared, /\.card-ui--compact \{[^}]*padding:\.7rem \.8rem/);
  assert.match(shared, /@media \(max-width:700px\)[\s\S]{0,250}\.card-ui__header \{ flex-wrap:wrap/);
  assert.match(planners, /\.recipe-card\.is-ready/);
  assert.match(refinements, /\.rig-card\.owned/);
  assert.match(refinements, /\.preset-card\.is-active/);
});
