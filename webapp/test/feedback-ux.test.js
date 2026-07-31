const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicRoot = path.join(__dirname, '..', 'public');
const readTree = (root, extension) => fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => (
  entry.isDirectory()
    ? readTree(path.join(root, entry.name), extension)
    : entry.name.endsWith(extension) ? [fs.readFileSync(path.join(root, entry.name), 'utf8')] : []
));

const coreJs = fs.readFileSync(path.join(publicRoot, 'modules', 'core.mjs'), 'utf8');
const featureFiles = fs.readdirSync(path.join(publicRoot, 'modules', 'features'))
  .filter(name => name.endsWith('.mjs'))
  .map(name => ({ name, text: fs.readFileSync(path.join(publicRoot, 'modules', 'features', name), 'utf8') }));
const featureJs = featureFiles.map(f => f.text).join('\n');
const frontendCss = [
  fs.readFileSync(path.join(publicRoot, 'styles.css'), 'utf8'),
  ...readTree(path.join(publicRoot, 'css'), '.css')
].join('\n');

test('core.mjs exposes a shared error-to-plain-language mapper', () => {
  assert.match(coreJs, /function userMessage\(error, fallback/);
  assert.match(coreJs, /function errorDetailHtml\(error, fallback\)/);
  assert.match(coreJs, /const ERROR_MESSAGE_RULES = \[/);
  // Covers the categories called out in the task: game running, missing
  // tool, key/compatibility, save not found, permission denied, network,
  // mutation already in flight -- with a safe generic fallback.
  assert.match(coreJs, /must be closed/i);
  assert.match(coreJs, /already in progress/i);
  assert.match(coreJs, /could not be found\. Check the tool paths/i);
  assert.match(coreJs, /database key could not open this save/i);
  assert.match(coreJs, /save could not be found/i);
  assert.match(coreJs, /Permission was denied/i);
  assert.match(coreJs, /Lost the connection to the local server/i);
  assert.match(coreJs, /Something went wrong completing that action\./);
});

test('errorDetailHtml renders the raw technical detail inside the existing technical-details disclosure, not inline', () => {
  assert.match(coreJs, /function errorDetailHtml\(error, fallback\) \{[\s\S]{0,400}technicalDetails\(raw, 'Show technical details'\)/);
});

test('setOperationFeedback accepts an optional error and keeps raw detail out of the visible strong text', () => {
  assert.match(coreJs, /function setOperationFeedback\(target, message, result, state = 'success', error = null\)/);
  assert.match(coreJs, /technicalDetails\(rawDetail, 'Show technical details'\)/);
  // The strong (headline) text is always the curated `message`, never the
  // raw error -- receiptHtml()/role/aria-live wiring is untouched.
  assert.match(coreJs, /<strong>\$\{esc\(message\)\}<\/strong>\$\{detail\}\$\{receiptHtml\(result\)\}/);
  assert.match(coreJs, /element\.setAttribute\('role', state === 'error' \? 'alert' : 'status'\)/);
});

test('userMessage and errorDetailHtml are exposed through FW for feature modules to use', () => {
  assert.match(coreJs, /expose\(\{[\s\S]*userMessage,[\s\S]*errorDetailHtml,[\s\S]*\}\)/);
});

test('showToast renders a labelled, keyboard-reachable dismiss control and caps the stacked toast count', () => {
  assert.match(coreJs, /function showToast\(message, type = 'success'\)/);
  assert.match(coreJs, /dismiss\.setAttribute\('aria-label', 'Dismiss notification'\)/);
  assert.match(coreJs, /dismiss\.type = 'button'/);
  assert.match(coreJs, /const MAX_STACKED_TOASTS = 5/);
  assert.match(coreJs, /while \(region\.children\.length > MAX_STACKED_TOASTS\) region\.firstElementChild\.remove\(\)/);
});

test('error toasts persist (no auto-expiry) while success toasts keep the short auto-expiry', () => {
  assert.match(coreJs, /if \(type !== 'error'\) setTimeout\(\(\) => toast\.remove\(\), 4200\)/);
  assert.doesNotMatch(coreJs, /if \(type === 'error'\)[^\n]*setTimeout/);
});

test('feature modules route caught errors through the friendly mapper instead of interpolating error.message/err.message directly', () => {
  // A couple of client-side validation errors (readIntegerInput/
  // validateInteger, already plain-language e.g. "Quantity must be a whole
  // number.") are intentionally left as direct .textContent assignments --
  // this only guards against the raw *backend* error.message being escaped
  // straight into markup, which is what leaked SQL/path text previously.
  for (const { name, text } of featureFiles) {
    const matches = text.match(/esc\((?:error|err|e)\.message\)/g) || [];
    assert.deepEqual(matches, [], `${name} still interpolates a raw error message with esc(): ${matches.join(', ')}`);
  }
});

test('inventory catalog load failures are surfaced to the user, not silently swallowed', () => {
  const inventoryJs = featureFiles.find(f => f.name === 'inventory.mjs').text;
  assert.match(inventoryJs, /let _catalogLoadFailed = false;/);
  assert.match(inventoryJs, /_catalogLoadFailed = true;/);
  assert.match(inventoryJs, /showToast\(userMessage\(e, 'Could not load the item catalog[^']*'\), 'error'\)/);
  assert.match(inventoryJs, /function catalogWarningHtml\(\)/);
  assert.match(inventoryJs, /catalogWarningHtml\(\)/);
});

test('inventory.mjs resolves refreshSafetyStatus through FW instead of a dangling bare reference', () => {
  const inventoryJs = featureFiles.find(f => f.name === 'inventory.mjs').text;
  assert.match(inventoryJs, /function refreshSafetyStatus\(\.\.\.args\) \{ return FW\.refreshSafetyStatus\?\.\(\.\.\.args\); \}/);
});

test('crafting component-add reports per-item failures honestly instead of only console.error while the success count climbs', () => {
  const settingsJs = featureFiles.find(f => f.name === 'settings-planners.mjs').text;
  assert.match(settingsJs, /const failures = \[\];/);
  assert.match(settingsJs, /failures\.push\(\{ name: component\.name, error \}\);/);
  assert.match(settingsJs, /messageEl\.innerHTML = `Verified \$\{updated\} component type\(s\)/);
  assert.match(settingsJs, /errorDetailHtml\(f\.error, 'could not be added'\)/);
});

test('Settings and Crafting use the shared skeleton loading affordance instead of bare "Loading…" text', () => {
  const settingsJs = featureFiles.find(f => f.name === 'settings-planners.mjs').text;
  assert.match(settingsJs, /showLoading\(statusEl, 2, 'Loading settings'\)/);
  assert.match(settingsJs, /showLoading\(grid, 6, 'Loading crafting recipes'\)/);
  assert.doesNotMatch(settingsJs, /textContent = 'Loading…'/);
});

test('mutation receipts (operationId/backupId/integrity) still render via receiptHtml on both success and error paths', () => {
  assert.match(featureJs, /setOperationFeedback\('weaponBuildsOperationStatus',[^\n]*,result,result\.success\?'success':'error'\)/);
  assert.match(featureJs, /setOperationFeedback\('weaponXpOperationStatus', `Weapon XP set/);
  assert.match(coreJs, /function receiptHtml\(result\)/);
});

test('toast styling lives in the owned shared-pages.css and preserves the toast region live-region semantics', () => {
  assert.match(frontendCss, /\.toast-dismiss \{/);
  assert.match(frontendCss, /\.toast \{ display:flex/);
});
