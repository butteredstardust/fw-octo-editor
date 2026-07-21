const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const publicRoot = path.join(__dirname, '..', 'public');
const readTree = (root, extension) => fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => (
  entry.isDirectory()
    ? readTree(path.join(root, entry.name), extension)
    : entry.name.endsWith(extension) ? [fs.readFileSync(path.join(root, entry.name), 'utf8')] : []
));
const frontendJs = [fs.readFileSync(path.join(publicRoot, 'app.mjs'), 'utf8'), ...readTree(path.join(publicRoot, 'modules'), '.mjs')].join('\n');
const apiClientJs = fs.readFileSync(path.join(publicRoot, 'modules', 'api-client.mjs'), 'utf8');
const frontendCss = [fs.readFileSync(path.join(publicRoot, 'styles.css'), 'utf8'), ...readTree(path.join(publicRoot, 'css'), '.css')].join('\n');
const markupAndCss = html + frontendCss;

test('application shell exposes core landmarks and skip navigation', () => {
  assert.match(html, /<a class="skip-link" href="#main-content">/);
  assert.match(html, /<header class="header">/);
  assert.match(html, /<nav class="nav"[^>]*aria-label="Primary">/);
  assert.match(html, /<main class="content" id="main-content"/);
  assert.match(html, /aria-label="Save editing safety status"/);
  assert.match(html, /id="primaryNav"/);
  assert.match(html, /class="nav-group-title">Progression/);
  assert.match(html, /id="navToggle"[^>]*aria-controls="primaryNav"/);
});

test('frontend uses a native module entry and external CSS manifest', () => {
  assert.match(html, /<script type="module" src="app\.mjs\?v=/);
  assert.doesNotMatch(html, /<style[ >]/);
  assert.match(html, /href="styles\.css\?v=/);
  assert.match(fs.readFileSync(path.join(publicRoot, 'styles.css'), 'utf8'), /@import url\('\.\/css\/foundation\.css(\?v=[^']*)?'\)/);
  assert.match(frontendJs, /const actionHandlers = new Map/);
});

test('HTML ids are unique', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});

test('every SPA page has a programmatically focusable heading target', () => {
  const pages = [...html.matchAll(/<div class="page(?: active)?" id="page-[^"]+">([\s\S]*?)(?=<div class="page(?: active)?" id="page-|<\/main>)/g)];
  assert.ok(pages.length >= 10);
  for (const page of pages) assert.match(page[1], /<h2[ >]/);
});

test('backup confirmation dialog is labelled and reports errors', () => {
  assert.match(html, /<dialog id="backupConfirmDialog" aria-labelledby="backupDialogTitle" aria-describedby="backupDialogDescription">/);
  assert.match(html, /id="backupDialogError"[^>]*role="alert"/);
});

test('application dialogs replace blocking browser alert and confirm calls', () => {
  assert.match(html, /<dialog id="appDialog" aria-labelledby="appDialogTitle" aria-describedby="appDialogMessage">/);
  assert.doesNotMatch(frontendJs, /\b(?:alert|confirm)\s*\(/);
  assert.match(frontendJs, /function confirmAction\(/);
  assert.match(frontendJs, /function showNotice\(/);
});

test('frontend rejects duplicate mutation requests', () => {
  assert.match(apiClientJs, /mutationActive/);
  assert.match(apiClientJs, /Please wait for the current save operation to finish/);
  assert.match(frontendJs, /id="mutationStatus"|getElementById\('mutationStatus'\)/);
});

test('mobile navigation isolates background content and restores focus', () => {
  assert.match(html, /id="navBackdrop"/);
  assert.match(frontendJs, /toggleAttribute\('inert', open\)/);
  assert.match(frontendJs, /function closeMobileNav\(/);
  assert.match(frontendJs, /event\.key === 'Tab'/);
});

test('resource mutations use the structured API request signature', () => {
  assert.doesNotMatch(frontendJs, /api\([^\n]+,\s*'(?:PUT|POST|DELETE)'\s*,/);
  assert.match(frontendJs, /api\('\/currencies\/'[\s\S]*method: 'PUT'[\s\S]*JSON\.stringify\(\{ amount: qty \}\)/);
  assert.match(frontendJs, /api\('\/inventory\/update'[\s\S]*method: 'POST'[\s\S]*itemId: id, quantity: qty/);
});

test('static HTML contains no inline event handlers', () => {
  assert.doesNotMatch(html, /\son(?:click|change|input)\s*=/i);
});

test('dynamically rendered markup contains no inline event handlers', () => {
  assert.doesNotMatch(frontendJs, /\son(?:click|change|input)\s*=/i);
  assert.match(frontendJs, /document\.addEventListener\('click'/);
  assert.match(frontendJs, /data-action/);
});

test('diagnostics UI exposes progress and live status semantics', () => {
  assert.match(html, /id="page-diagnostics"/);
  assert.match(html, /id="diagnosticsStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="diagnosticsSummary"[^>]*aria-busy="false"/);
  assert.match(frontendJs, /async function runDiagnostics\(/);
  assert.match(frontendJs, /Inventory round trip/);
});

test('reduced-motion preference and visible focus styling are present', () => {
  assert.match(markupAndCss, /prefers-reduced-motion:reduce/);
  assert.match(markupAndCss, /:focus-visible/);
});

test('reactive search and mutation feedback expose live status regions', () => {
  assert.match(html, /id="invFilterSummary"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="addFilterSummary"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="toastRegion"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(frontendJs, /function showToast\(/);
  assert.match(frontendJs, /function receiptHtml\(/);
});

test('routine mutation results use contextual verification receipts', () => {
  for (const id of ['dashboardOperationStatus', 'charactersOperationStatus', 'characterOperationStatus', 'hubOperationStatus', 'weaponXpOperationStatus', 'vendorsOperationStatus', 'repairOperationStatus']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*data-operation-status`));
  }
  assert.match(frontendJs, /function setOperationFeedback\(/);
  assert.match(frontendJs, /setOperationFeedback\('charactersOperationStatus'/);
  assert.match(frontendJs, /setOperationFeedback\('weaponXpOperationStatus'/);
  assert.match(frontendJs, /setOperationFeedback\('vendorsOperationStatus'/);
  assert.equal((frontendJs.match(/showNotice\(/g) || []).length, 3, 'showNotice remains only as its definition and two exceptional fallbacks');
});

test('technical identifiers use keyboard and touch accessible disclosures', () => {
  assert.match(frontendJs, /<details class="technical-details">/);
  assert.match(frontendJs, /aria-label=/);
});

test('user-facing overview copy omits database implementation notes', () => {
  assert.doesNotMatch(html, /Water and Credits live in the save/);
  assert.match(html, /Every change is backed up and verified/);
});

test('overview is resources-first and leaves technical save data to diagnostics', () => {
  const overview = html.match(/id="page-dashboard">([\s\S]*?)<div class="page" id="page-characters">/)[1];
  assert.ok(overview.indexOf('id="dashResources"') < overview.indexOf('id="dashCharacter"'));
  assert.ok(overview.indexOf('id="dashCharacter"') < overview.indexOf('id="dashQuests"'));
  assert.ok(overview.indexOf('id="dashQuests"') < overview.indexOf('id="dashInventory"'));
  assert.doesNotMatch(overview, /Save Readiness|Save Verification|schemaList|id="hashes"/);
  assert.match(overview, /Steam Cloud:/);
});

test('overview mutations and disclosures preserve surrounding dashboard state', () => {
  assert.match(frontendJs, /document\.getElementById\('resvalue-' \+ id\)\.textContent/);
  assert.match(frontendJs, /dash-attachments-disclosure/);
  assert.match(frontendJs, /dash-quest-more/);
  assert.match(frontendJs, /role="status" aria-live="polite"/);
});

test('overview does not present the internal GRL00 throw mechanism as an equipped throwable', () => {
  assert.doesNotMatch(frontendJs, /renderLoadoutWeapon\(loadout && loadout\.throw/);
  assert.doesNotMatch(frontendJs, /<span class="dash-slot">Throwable<\/span>/);
  assert.doesNotMatch(frontendJs, /Selection is not stored in PlayerLoadout/);
});

test('overview rig build hides its internal row behind the shared technical disclosure', () => {
  assert.match(frontendJs, /technicalDetails\(loadout\.rigRow, 'Show rig technical ID'\)/);
  assert.doesNotMatch(frontendJs, /<span class="dash-wtag">\$\{loadout\.rigRow\}<\/span>/);
});

test('remaining pages use consistent width tiers and crafting split layouts', () => {
  assert.match(frontendCss, /#page-inventory, #page-add-items, #page-rigs, #page-hub-upgrades, #page-weapon-xp \{ max-width:var\(--content-wide\)/);
  assert.match(frontendCss, /#page-characters[\s\S]*#page-backups \{ max-width:var\(--content-medium\)/);
  assert.match(frontendCss, /#page-settings, #page-diagnostics \{ max-width:var\(--content-narrow\)/);
  assert.equal((html.match(/class="planner-split"/g) || []).length, 1);
  assert.equal((html.match(/class="planner-result-pane"/g) || []).length, 1);
});

test('dense app-wide controls retain mobile and reduced-motion fallbacks', () => {
  assert.match(frontendCss, /input, select, button \{ min-height:var\(--control-h\)/);
  assert.match(frontendCss, /@media \(max-width:800px\)/);
  assert.match(frontendCss, /\.planner-control-pane \{ position:static/);
});

test('inventory and add-item cards expose local iconography and visible taxonomy', () => {
  assert.match(frontendJs, /function itemTypeIcon\(category, subtype/);
  assert.match(frontendJs, /<svg viewBox="0 0 24 24" focusable="false">/);
  assert.match(frontendJs, /class="item-type-icon" aria-hidden="true"/);
  assert.match(frontendJs, /function itemCategoryPills\(category, subtype, source/);
  assert.match(frontendJs, /itemTypeIcon\(r\.d\.cat, r\.d\.sub\)/);
  assert.match(frontendJs, /itemTypeIcon\(r\.grp, r\.sub \|\| r\.category\)/);
  assert.match(frontendJs, /itemCategoryPills\(r\.d\.cat, r\.d\.sub, r\.sourceMap\)/);
  assert.match(frontendJs, /itemCategoryPills\(r\.grp, r\.sub \|\| r\.category, sourceMapForCatalog\(r\)\)/);
});

test('app-wide decorative icons render through the local SVG registry', () => {
  assert.match(frontendJs, /const APP_ICON_PATHS = \{/);
  assert.match(frontendJs, /function appIcon\(name, className = ''\)/);
  assert.doesNotMatch(frontendJs, /<span class="(?:dash-char-icon|char-icon|hub-icon|res-icon)">[^$<]*\p{Extended_Pictographic}/u);
  assert.match(frontendCss, /\.app-icon svg/);
});

test('add-items source filtering trusts canonical inventory maps', () => {
  assert.match(frontendJs, /meta\.inventoryMap === 'Weapons'\) return 'Base Weapons'/);
  assert.match(frontendJs, /meta\.inventoryMap === 'DamagedWeapons'\) return 'Damaged Weapons'/);
  assert.match(frontendJs, /sourceMap !== 'Items'/);
});

test('manage and add-items share one canonical presentation taxonomy', () => {
  assert.match(frontendJs, /function itemPresentation\(name, meta = \{\}\)/);
  assert.match(frontendJs, /if \(e\) return itemPresentation\(name, e\)/);
  assert.match(frontendJs, /const presentation = itemPresentation\(c\.id, c\)/);
  assert.match(frontendJs, /const ADD_CAT_ORDER = ITEM_CAT_ORDER/);
});

test('manage and add-items expose the same primary filter anatomy', () => {
  for (const id of ['inventorySearch', 'inventoryFilter', 'inventorySubFilter', 'inventorySource', 'inventoryQty', 'addSearch', 'addFilter', 'addSubFilter', 'addSource', 'addState']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html + frontendJs, /addMissingOnly|addBaseWeaponsOnly/);
  assert.match(frontendJs, /stateFilter === 'missing'/);
  assert.match(frontendJs, /stateFilter === 'owned'/);
});

test('vendors render as cards with an accessible three-stage trust track', () => {
  assert.match(frontendJs, /function trustProgress\(score\)/);
  assert.match(frontendJs, /function trustTrack\(score\)/);
  assert.match(frontendJs, /class="trust-track" role="img" aria-label=/);
  assert.match(frontendJs, /class="trader-grid"/);
  assert.match(frontendJs, /class="trader-card"/);
  assert.match(frontendCss, /\.trust-track-labels/);
  assert.match(frontendJs, /<span>Untrusted<\/span><span>Neutral<\/span><span>Trusted<\/span>/);
});

test('rig page exposes ownership filters, accessible cards, and explicit verified actions', () => {
  assert.match(html, /data-page="rigs"/);
  assert.match(html, /id="page-rigs"/);
  assert.match(html, /id="rigFilterSummary"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(frontendJs, /async function loadRigs\(/);
  assert.match(frontendJs, /data-action="add-rig"/);
  assert.match(frontendJs, /data-action="add-rig-kit"/);
  assert.match(frontendJs, /This will not equip it or change the active character's loadout/);
  assert.match(frontendJs, /Existing quantities will not be replaced/);
  assert.match(frontendJs, /sessionStorage\.setItem\(RIG_FILTER_KEY/);
});

test('overview surfaces read-only faction trust near the top with a vendor shortcut', () => {
  const overview = html.match(/id="page-dashboard">([\s\S]*?)<div class="page" id="page-characters">/)[1];
  assert.ok(overview.indexOf('id="dashResources"') < overview.indexOf('id="dashFactionTrust"'));
  assert.ok(overview.indexOf('id="dashFactionTrust"') < overview.indexOf('id="dashCharacter"'));
  assert.match(overview, /data-page-target="vendors"/);
  assert.match(frontendJs, /function renderDashFactionTrust\(factions\)/);
  assert.match(frontendJs, /api\('\/vendors'\)\.catch/);
});

