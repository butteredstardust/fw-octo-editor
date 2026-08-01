// Static/structural coverage for the shell-UX fixes: the gameRunning
// truthiness bug (Task 2), broken/empty value formatting (Task 1), the
// SYSTEM nav scroll affordance (Task 3), the first-run preflight panel
// (Task 6), and hash deep linking (Task 7). Behavioural coverage for these
// lives in test/browser/shell-ux.spec.js; this file guards the source
// structure so a future edit can't silently regress the underlying fix
// while still "looking" correct.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicRoot = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
// system.mjs was split into public/modules/system/*.mjs (router, dispatcher,
// diagnostics, safety-status, backups, acknowledgements, status-utils,
// index); these tests check properties of "what used to be system.mjs" as a
// whole, so read the successor files back as one blob.
const systemDir = path.join(publicRoot, 'modules', 'system');
const systemJs = fs.readdirSync(systemDir)
  .filter(name => name.endsWith('.mjs'))
  .map(name => fs.readFileSync(path.join(systemDir, name), 'utf8'))
  .join('\n');
const refinementsCss = fs.readFileSync(path.join(publicRoot, 'css', 'refinements.css'), 'utf8');

test('gameRunning is normalized through one shared helper at every call site', () => {
  assert.match(systemJs, /function isGameRunning\(status\)/);
  // The three previously-inconsistent sites (diagnostics summary, safety
  // bar refresh, and the Backups status line) must all route through it --
  // and none of them should fall back to a raw truthiness check on
  // `.gameRunning`, which is always true for an empty (not-running) array.
  assert.match(systemJs, /const running = isGameRunning\(data\);/);
  assert.match(systemJs, /const running = isGameRunning\(status\);/);
  assert.match(systemJs, /isGameRunning\(status\) \? 'Writes are disabled while the game is running\.'/);
  assert.doesNotMatch(systemJs, /status\.gameRunning \? 'Writes/);
  assert.doesNotMatch(systemJs, /Array\.isArray\(status\.gameRunning\)/);
  assert.doesNotMatch(systemJs, /Array\.isArray\(data\.gameRunning\)/);
});

test('timestamps fall back to plain language instead of rendering "Invalid Date"', () => {
  assert.match(systemJs, /function formatTimestamp\(value, fallback = 'Not run yet'\)/);
  assert.match(systemJs, /Number\.isNaN\(date\.getTime\(\)\)/);
  assert.match(systemJs, /<dt>Checked<\/dt><dd>\$\{esc\(formatTimestamp\(data\.checkedAt\)\)\}<\/dd>/);
  assert.match(systemJs, /formatTimestamp\(backup\.created, 'Unknown time'\)/);
  assert.doesNotMatch(systemJs, /new Date\(data\.checkedAt\)\.toLocaleString\(\)/);
});

test('diagnostics blocking-reasons summary is derived from the same checks the cards render', () => {
  assert.match(systemJs, /const blockedLabels = checks\.filter\(c => !c\.passed && !c\.warning\)\.map\(c => c\.label\);/);
  assert.match(systemJs, /const blockingReasonsText = blockedLabels\.length/);
  assert.match(systemJs, /<dt>Blocking reasons<\/dt><dd>\$\{esc\(blockingReasonsText\)\}<\/dd>/);
  // The overall verdict card must not be able to cite itself as a root cause.
  const checksBlock = systemJs.slice(systemJs.indexOf('const checks = ['), systemJs.indexOf('];', systemJs.indexOf('const checks = [')));
  assert.doesNotMatch(checksBlock, /label: 'Write readiness'/);
});

test('diagnostics active save directory and safety-bar values have explicit fallbacks', () => {
  assert.match(systemJs, /esc\(data\.activeSaveDir \|\| 'Not configured — using default location\.'\)/);
  assert.match(systemJs, /setSafetyValue\('safetySave', status\.activeSaveDir \|\| 'Not configured', ''\)/);
  assert.match(systemJs, /const detectedVersion = gameBuild && gameBuild\.detected && gameBuild\.detected\.version;/);
  assert.match(systemJs, /setSafetyValue\('safetyGameVersion', detectedVersion \|\| 'Not detected', gameBuild && !gameBuild\.verified \? 'warn' : ''\)/);
});

test('editor version is surfaced from /api/status appVersion', () => {
  assert.match(systemJs, /setSafetyValue\('safetyAppVersion', status\.appVersion \? `v\$\{status\.appVersion\}` : 'Unknown', ''\)/);
});

test('empty Settings interpolations fall back at the source, not via CSS masking', () => {
  // These were briefly masked with `:empty::after` content rules because of a
  // file-ownership split during development. The fallback belongs in the one
  // place that produces the value, so the CSS masks must stay gone.
  assert.doesNotMatch(refinementsCss, /#settingsDefaultDir:empty::after/);
  assert.doesNotMatch(refinementsCss, /\.active-dir:empty::after/);
  const settingsJs = fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'settings-planners.mjs'), 'utf8');
  assert.match(settingsJs, /defDirEl\.textContent = s\.defaultSaveDir \|\| 'an automatically detected location'/);
  assert.match(settingsJs, /const active = s\.activeSaveDir \|\| s\.defaultSaveDir \|\| 'not set — using the default location'/);
});

test('SYSTEM nav group has a compact-density fallback and a scroll affordance', () => {
  assert.match(html, /id="navScrollHint"/);
  assert.match(html, /aria-hidden="true"[^>]*id="navScrollHint"|id="navScrollHint"[^>]*aria-hidden="true"/);
  assert.match(refinementsCss, /@media \(max-height:850px\)/);
  assert.match(refinementsCss, /\.nav-scroll-hint/);
  assert.match(systemJs, /function updateNavScrollHint\(/);
  assert.match(systemJs, /nav\.scrollHeight - nav\.clientHeight - nav\.scrollTop > 4/);
  // Must not disturb the existing mobile off-canvas nav breakpoint/logic.
  assert.match(refinementsCss, /@media \(max-width:780px\) \{[\s\S]*body\.nav-open \.nav \{ transform:translateX\(0\); \}/);
});

test('first-run preflight panel is markup-present, informational, and dismissible without a focus trap', () => {
  assert.match(html, /id="preflightPanel" class="preflight-panel" role="region" aria-label="Setup check" hidden>/);
  assert.match(html, /id="preflightMessage"/);
  assert.match(html, /id="preflightDismissButton"/);
  assert.doesNotMatch(html, /<dialog[^>]*id="preflightPanel"/);
  assert.match(html, /data-action="show-page" data-page-target="diagnostics"/);
  // Reuses the panel-region area's diagnostics/settings shortcuts.
  assert.match(html, /data-action="show-page" data-page-target="settings"/);
  assert.match(systemJs, /function computePreflightIssues\(status\)/);
  assert.match(systemJs, /function updatePreflightPanel\(status\)/);
  assert.match(systemJs, /preflightDismissedSignature = preflightCurrentSignature;/);
  assert.match(systemJs, /function clearPreflightDismissTimer\(\)/);
  assert.match(systemJs, /function schedulePreflightDismiss\(panel, signature\)/);
  assert.match(systemJs, /preflightDismissedSignature = signature;/);
  assert.match(systemJs, /if \(!issues\.length\) \{\s*preflightDismissedSignature = null;/);
  assert.match(systemJs, /}, 15000\);/);
  assert.match(systemJs, /generation !== preflightTimerGeneration \|\| panel\.hidden \|\| panel\.dataset\.signature !== signature/);
  assert.match(systemJs, /clearPreflightDismissTimer\(\);\s*panel\.hidden = true;/);
  assert.match(systemJs, /updatePreflightPanel\(status\);/);
});

test('preflight panel leaves breathing room before the navigation frame', () => {
  assert.match(refinementsCss, /\.preflight-panel \{ margin:\.75rem clamp\(\.75rem,2vw,2rem\) 1\.25rem;/);
});

test('preflight reason text is plain-language and named per specific blocker', () => {
  assert.match(systemJs, /'game-running': 'The Forever Winter is currently running\./);
  assert.match(systemJs, /'missing-sqlite3mc': 'The SQLite3MC database tool is missing\./);
  assert.match(systemJs, /'missing-save-variants': 'Your save files were not found/);
  // The Windows-only default tool path is qualified so it doesn't read as
  // the only possible location on a non-Windows setup.
  assert.match(systemJs, /On Windows it is expected at C:\\\\tmp\\\\fw-tools/);
  assert.match(systemJs, /on another OS, or a custom install, set the FW_SQLITE_BIN/);
  assert.match(systemJs, /function preflightReasonText\(reason\)/);
});

test('hash routing validates against a known-page allow-list and never injects the hash into the DOM', () => {
  assert.match(systemJs, /function knownPageNames\(\)/);
  assert.match(systemJs, /function pageNameFromHash\(\)/);
  assert.match(systemJs, /knownPageNames\(\)\.has\(raw\)/);
  assert.match(systemJs, /window\.addEventListener\('popstate'/);
  assert.match(systemJs, /window\.addEventListener\('hashchange'/);
  assert.match(systemJs, /history\.pushState\(null, '', hash\)/);
  assert.match(systemJs, /history\.replaceState\(null, '', location\.pathname \+ location\.search\)/);
  // The hash must only ever be used as a Set lookup key, never written into
  // innerHTML/outerHTML or an attribute value.
  assert.doesNotMatch(systemJs, /innerHTML[^;]*location\.hash/);
  assert.doesNotMatch(systemJs, /location\.hash[^;]*innerHTML/);
});

test('showPage accepts a fromHistory option so history-originated navigation does not push duplicate entries', () => {
  assert.match(systemJs, /function showPage\(pageName, \{ fromHistory = false \} = \{\}\)/);
  assert.match(systemJs, /if \(!fromHistory && knownPageNames\(\)\.has\(pageName\)\)/);
});

test('router uses one immutable page-loader registry for page-specific refreshes', () => {
  assert.match(systemJs, /const PAGE_LOADERS = new Map\(\[/);
  for (const page of ['weapon-builds', 'presets', 'vendors', 'stats', 'repair', 'add-items', 'rigs', 'settings', 'crafting', 'backups', 'diagnostics']) {
    assert.match(systemJs, new RegExp(`\\['${page.replace('-', '\\-')}',`));
  }
  assert.match(systemJs, /PAGE_LOADERS\.get\(pageName\)\?\.\(\);/);
  assert.doesNotMatch(systemJs, /if \(pageName === '(?:weapon-builds|presets|vendors|stats|repair|add-items|rigs|settings|crafting|backups|diagnostics)'\)/);
});

test('HTML ids remain unique after the new markup', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});

test('no inline event handlers were introduced by the new markup or logic', () => {
  assert.doesNotMatch(html, /\son(?:click|change|input)\s*=/i);
  assert.doesNotMatch(systemJs, /\son(?:click|change|input)\s*=/i);
  assert.doesNotMatch(systemJs, /\b(?:alert|confirm)\s*\(/);
});
