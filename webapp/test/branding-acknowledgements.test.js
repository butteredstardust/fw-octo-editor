const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('public branding uses FW OCTO Editor and the concise tagline', () => {
  const html = read('webapp/public/index.html');
  assert.match(html, /<title>FW OCTO Editor<\/title>/);
  assert.match(html, /Forged in the bio-slums, upgraded with hope\.<\/span>FW OCTO Editor/);
  assert.doesNotMatch(html, /Forged in the bio-slums, upgraded with hope\. Stay alive out there\./);
  assert.doesNotMatch(html, /Forever Winter Save Editor/);
});

test('acknowledgement sources retain aligned notices and safe external links', () => {
  const markdown = read('ACKNOWLEDGEMENTS.md');
  const html = read('webapp/public/index.html');
  for (const phrase of ['CC BY-SA', 'creativecommons.org/licenses/by-sa/4.0/', 'MIT License', 'SQLite3MC', 'uesave', 'Playwright', 'Chart.js 4.5.1', '@kurkle/color 0.3.4', 'Black Ops One', 'single-player use only']) {
    assert.match(markdown, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(markdown, /mc_loop_res1\.gif.*favicon.*application icons/s);
  for (const link of html.matchAll(/<a href="https:[^"]+"([^>]*)>/g)) assert.match(link[1], /target="_blank"/), assert.match(link[1], /rel="noopener"/);
});

test('README gallery references six committed, nontrivial screenshots', () => {
  const readme = read('README.md');
  for (const name of ['overview', 'characters', 'weapon-builds', 'inventory', 'stats', 'acknowledgements']) {
    const file = path.join(root, 'docs', 'screenshots', `${name}.png`);
    assert.match(readme, new RegExp(`docs/screenshots/${name}\\.png`));
    assert.ok(fs.existsSync(file), `${name} screenshot exists`);
    assert.ok(fs.statSync(file).size > 10_000, `${name} screenshot is nontrivial`);
    const png = fs.readFileSync(file);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${name} is a PNG`);
    // 1440x900 viewport captured at deviceScaleFactor 2 (see
    // scripts/capture-readme-screenshots.js), so README art stays sharp on
    // HiDPI displays.
    assert.equal(png.readUInt32BE(16), 2880, `${name} width`);
    assert.equal(png.readUInt32BE(20), 1800, `${name} height`);
  }
});
