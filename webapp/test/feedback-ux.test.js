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

// core.mjs was split into a composition root plus cohesive dom/icons/feedback/
// game-data modules; these tests check properties of "what used to be
// core.mjs" as a whole, so read the successor files back as one blob.
const coreJs = ['core.mjs', 'dom.mjs', 'icons.mjs', 'feedback.mjs', 'game-data.mjs']
  .map(name => fs.readFileSync(path.join(publicRoot, 'modules', name), 'utf8'))
  .join('\n');
const readFeatureFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => (
  entry.isDirectory()
    ? readFeatureFiles(path.join(dir, entry.name))
    : entry.name.endsWith('.mjs') ? [{ name: entry.name, text: fs.readFileSync(path.join(dir, entry.name), 'utf8') }] : []
));
const featureFiles = readFeatureFiles(path.join(publicRoot, 'modules', 'features'));
const featureJs = featureFiles.map(f => f.text).join('\n');
// inventory.mjs was split into a composition root plus cohesive catalog/list/
// add-items/rigs modules under features/inventory/; these tests check
// properties of "what used to be inventory.mjs" as a whole, so read the
// successor files back as one blob (mirrors the coreJs pattern above).
const inventoryJs = ['catalog.mjs', 'list.mjs', 'add-items.mjs', 'rigs.mjs', 'index.mjs']
  .map(name => fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'inventory', name), 'utf8'))
  .join('\n');
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
  assert.match(coreJs, /already saving/i);
  assert.match(coreJs, /could not be found\. Open Diagnostics/i);
  assert.match(coreJs, /database key could not open this save/i);
  assert.match(coreJs, /save could not be found/i);
  assert.match(coreJs, /Permission was denied/i);
  assert.match(coreJs, /Lost the connection to the editor/i);
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

test('setInlineFeedback centralizes safe inline states, live-region semantics, errors, and receipts', () => {
  assert.match(coreJs, /const INLINE_FEEDBACK_STATES = new Set\(\['info', 'pending', 'success', 'error'\]\)/);
  assert.match(coreJs, /function setInlineFeedback\(target, \{[\s\S]{0,300}if \(!element\) return false/);
  assert.match(coreJs, /element\.setAttribute\('role', isError \? 'alert' : 'status'\)/);
  assert.match(coreJs, /element\.setAttribute\('aria-live', isError \? 'assertive' : 'polite'\)/);
  assert.match(coreJs, /isError \? errorDetailHtml\(error, fallback \|\| message\) : esc\(message\)/);
  assert.match(coreJs, /element\.innerHTML = `\$\{body\}\$\{receiptHtml\(result\)\}`/);
  assert.match(coreJs, /expose\(\{[\s\S]*setInlineFeedback,[\s\S]*\}\)/);
});

test('inventory mutations use shared inline feedback without duplicating receipt/error markup', () => {
  for (const name of ['list.mjs', 'add-items.mjs', 'rigs.mjs']) {
    const text = featureFiles.find(file => file.name === name).text;
    assert.match(text, /setInlineFeedback\(/, `${name} does not use setInlineFeedback()`);
    assert.doesNotMatch(text.split('\n')[2] || '', /receiptHtml|errorDetailHtml/, `${name} still imports legacy inline render helpers`);
  }
  const rigsJs = featureFiles.find(file => file.name === 'rigs.mjs').text;
  assert.match(rigsJs, /titleId: `rig-heading-\$\{enc\}`/);
  assert.match(rigsJs, /focusableTitle: true/);
  assert.match(rigsJs, /getElementById\(`rig-heading-\$\{encId\}`\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(rigsJs, /getElementById\(`rig-hq-\$\{encId\}`\)\?\.focus\(\{ preventScroll: true \}\)/);
});

test('userMessage and errorDetailHtml are exposed through FW for feature modules to use', () => {
  assert.match(coreJs, /expose\(\{[\s\S]*userMessage,[\s\S]*errorDetailHtml,[\s\S]*\}\)/);
});

test('empty states share escaped copy, constrained live roles, and a documented trusted action slot', () => {
  assert.match(coreJs, /const EMPTY_STATE_ROLES = new Set\(\['status', 'alert'\]\)/);
  assert.match(coreJs, /export function emptyStateHtml\(title, hint = '', \{ actionHtml = '', role = '' \} = \{\}\)/);
  assert.match(coreJs, /EMPTY_STATE_ROLES\.has\(role\)/);
  assert.match(coreJs, /empty-state__title[^`]*\$\{esc\(title\)\}/);
  assert.match(coreJs, /empty-state__hint[^`]*\$\{esc\(hint\)\}/);
  assert.match(coreJs, /`actionHtml` is a trusted slot for locally generated controls/);
  assert.match(coreJs, /function noMatchesHtml[\s\S]{0,180}return emptyStateHtml\(title, hint\)/);
  assert.match(coreJs, /expose\(\{[\s\S]*emptyStateHtml,[\s\S]*noMatchesHtml/);
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
  assert.match(inventoryJs, /let _catalogLoadFailed = false;/);
  assert.match(inventoryJs, /_catalogLoadFailed = true;/);
  assert.match(inventoryJs, /showToast\(userMessage\(e, 'Could not load the item catalog[^']*'\), 'error'\)/);
  assert.match(inventoryJs, /function catalogWarningHtml\(\)/);
  assert.match(inventoryJs, /catalogWarningHtml\(\)/);
});

test('inventory/rigs.mjs resolves refreshSafetyStatus through FW instead of a dangling bare reference', () => {
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

// ---- Copy-guard tests (style guide compliance) ----------------------------
// These guard the Nexus-facing copy pass: banned gaming-slang/jargon terms,
// sentence-case confirm accept labels, and the 30-word confirm-body budget.
// See the copy style guide for the full rules; this only encodes the
// mechanically-checkable subset.

test('copy: "BIS" / "Best in slot" gaming slang never appears in rendered module text', () => {
  // Internal API field names (bisScore, bisSupported, bisMatches, bisMissing)
  // are allowed -- only the user-facing uppercase "BIS" token is banned.
  const offenders = (featureJs.match(/BIS/g) || []);
  assert.deepEqual(offenders, [], `found ${offenders.length} literal "BIS" occurrence(s) -- use "recommended parts" instead`);
  assert.doesNotMatch(featureJs, /best.in.slot/i);
});

test('copy: "Trader" does not appear in user-facing vendor headings (internal Trader.* keys/classes excluded)', () => {
  assert.doesNotMatch(featureJs, />Trader Unlock</);
  assert.match(featureJs, />Vendor unlock</);
  assert.match(featureJs, />Vendor stock</);
});

test('copy: confirmAction accept labels are sentence case, not Title Case', () => {
  const labels = [...featureJs.matchAll(/acceptLabel:\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(labels.length >= 10, 'expected to find confirmAction acceptLabel options across feature modules');
  for (const label of labels) {
    for (const word of label.split(' ').slice(1)) {
      assert.ok(!/^[A-Z][a-z]+$/.test(word), `acceptLabel "${label}" looks like Title Case, not sentence case`);
    }
  }
});

test('copy: confirmAction bodies stay within the style guide\'s 30-word budget', () => {
  const calls = [...featureJs.matchAll(/confirmAction\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g)].map(m => m[1]);
  assert.ok(calls.length >= 10, 'expected to find confirmAction call sites across feature modules');
  for (const raw of calls) {
    const text = raw.slice(1, -1).replace(/\$\{[^}]*\}/g, 'X');
    const words = text.trim().split(/\s+/).filter(Boolean);
    assert.ok(words.length <= 30, `confirmAction body exceeds 30 words (${words.length}): "${text}"`);
  }
});

test('copy: confirmAction bodies drop the undefined "experimental" hedge', () => {
  const calls = [...featureJs.matchAll(/confirmAction\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g)].map(m => m[1]);
  for (const raw of calls) assert.doesNotMatch(raw, /experimental/i);
});

// POST /api/inventory/add is the complete operation: it appends a row when the
// item is absent (added: true) and increments the existing row when it is
// already present (added: false). Three call sites read added === false as
// "the write did not happen" and chased it with an absolute /inventory/update,
// which either re-sent the same total (rejected by mutationService's no-op
// guard and surfaced as a phantom "1 failed") or clobbered the stack with just
// the amount added. Nothing may follow an add with an update again.
test('inventory add is never followed by a compensating quantity update', () => {
  for (const file of featureFiles) {
    // Strip line comments first -- the modules explain this rule in prose that
    // necessarily names both endpoints.
    const code = file.text.replace(/^\s*\/\/.*$/gm, '');
    for (const match of code.matchAll(/added\s*===?\s*false/g)) {
      const window = code.slice(match.index, match.index + 400);
      assert.doesNotMatch(window, /inventory\/update/,
        `${file.name} treats added === false as a failed write and re-issues /inventory/update; add already applied the quantity`);
    }
  }
});
