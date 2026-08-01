const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const publicRoot = path.join(__dirname, '..', 'public');

test('statusBadgeHtml escapes text and legacy classes without accepting raw markup', async () => {
  const { statusBadgeHtml } = await import(pathToFileURL(path.join(publicRoot, 'modules', 'status-ui.mjs')));
  const html = statusBadgeHtml('<img data-status-probe src=x>', {
    tone: 'success',
    className: 'legacy" data-status-probe="bad'
  });
  assert.doesNotMatch(html, /<img|data-status-probe="bad"/);
  assert.match(html, /&lt;img data-status-probe src=x&gt;/);
  assert.match(html, /legacy&quot; data-status-probe=&quot;bad/);
  assert.doesNotMatch(html, /role=|<svg|<button/);
});

test('statusBadgeHtml allowlists semantic tones and falls back to neutral', async () => {
  const { statusBadgeHtml } = await import(pathToFileURL(path.join(publicRoot, 'modules', 'status-ui.mjs')));
  for (const tone of ['success', 'warning', 'danger', 'info', 'neutral']) {
    assert.match(statusBadgeHtml(tone, { tone }), new RegExp(`status-badge--${tone}`));
  }
  const fallback = statusBadgeHtml('Fallback', { tone: 'success" onclick="bad()' });
  assert.match(fallback, /status-badge--neutral/);
  assert.doesNotMatch(fallback, /onclick/);
});

test('selected card families compose status through the shared helper and retain domain hooks', () => {
  const sources = {
    hub: fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'hub.mjs'), 'utf8'),
    recipes: fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'settings-planners.mjs'), 'utf8'),
    rigs: fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'inventory', 'rigs.mjs'), 'utf8'),
    repair: fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'vendors-repair.mjs'), 'utf8')
  };
  for (const source of Object.values(sources)) {
    assert.match(source, /import \{ statusBadgeHtml \}/);
    assert.match(source, /statusBadgeHtml\(/);
  }
  assert.match(sources.hub, /className: `hub-pill \$\{status\}`/);
  assert.match(sources.recipes, /className: 'recipe-badge ready'/);
  assert.match(sources.recipes, /className: 'recipe-badge missing'/);
  assert.match(sources.rigs, /className: `rig-owned-badge/);
  assert.match(sources.repair, /className: `repair-availability/);
});

test('foundation owns shared badge structure and all semantic tone tokens', () => {
  const css = fs.readFileSync(path.join(publicRoot, 'css', 'foundation.css'), 'utf8');
  assert.match(css, /\.status-badge \{[^}]*display:inline-flex[^}]*max-width:100%[^}]*overflow-wrap:anywhere/);
  for (const tone of ['success', 'warning', 'danger', 'info', 'neutral']) {
    assert.match(css, new RegExp(`\\.status-badge--${tone} \\{`));
  }
});
