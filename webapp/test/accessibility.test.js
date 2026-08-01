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
const valueEditorJs = fs.readFileSync(path.join(publicRoot, 'modules', 'value-editor.mjs'), 'utf8');
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

test('interpolated hub and inventory category/name text is escaped', () => {
  // Regression guard: these were previously interpolated raw while sibling
  // fields on the same rendered card were already escaped. Hub titles now
  // route through entityCard, whose title field is escaped centrally.
  assert.match(frontendJs, /title: meta\.name/);
  assert.match(frontendJs, /<\$\{Heading\} class="card-ui__title"\$\{titleAttributes\}>\$\{esc\(title\)\}\$\{titleHtml\}/);
  assert.match(frontendJs, /<span class="hub-chevron">▾<\/span>\$\{esc\(group\)\}/);
  assert.match(frontendJs, /<span class="inv-cat-title">\$\{esc\(cat\)\}<\/span>/);
  assert.match(frontendJs, /<span class="add-cat-title">\$\{esc\(cat\)\}<\/span>/);
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

test('overview leads with an at-a-glance character/quest pair and leaves technical save data to diagnostics', () => {
  const overview = html.match(/id="page-dashboard">([\s\S]*?)<div class="page" id="page-characters">/)[1];
  assert.ok(overview.indexOf('id="dashCharacter"') < overview.indexOf('id="dashQuests"'));
  assert.ok(overview.indexOf('id="dashQuests"') < overview.indexOf('id="dashResources"'));
  assert.ok(overview.indexOf('id="dashResources"') < overview.indexOf('id="dashInventory"'));
  assert.doesNotMatch(overview, /Save Readiness|Save Verification|schemaList|id="hashes"/);
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

test('overview resource cards include all six reference-save-confirmed Codex variants', () => {
  // Only variants actually present in items.canonical.json (confirmed via a
  // 100% reference save) are listed -- Toothy/OrgaMech/Kotleta are named on
  // the wiki but not yet confirmed, so they're intentionally absent here.
  const codexIds = ['Codex.RatKing', 'Codex.MediumMech', 'Codex.Grabber', 'CodexShieldOfficer', 'Codex.MotherCourage', 'Codex.Opal'];
  const items = require('../data/items.canonical.json').items;
  for (const id of codexIds) {
    assert.ok(items[id], `expected ${id} to exist in items.canonical.json`);
    assert.match(frontendJs, new RegExp(`id:\\s*'${id.replace('.', '\\.')}'.*kind:\\s*'inventory'`));
  }
});

test('overview rig build hides its internal row behind the shared technical disclosure', () => {
  assert.match(frontendJs, /technicalDetails\(loadout\.rigRow, 'Show rig technical ID'\)/);
  assert.doesNotMatch(frontendJs, /<span class="dash-wtag">\$\{loadout\.rigRow\}<\/span>/);
});

test('remaining pages share one consistent full-width tier', () => {
  assert.match(frontendCss, /#page-inventory, #page-add-items, #page-rigs, #page-hub-upgrades, #page-weapon-xp, #page-characters, #page-character, #page-vendors, #page-repair, #page-crafting, #page-backups, #page-weapon-builds, #page-presets, #page-stats \{ max-width:var\(--content-wide\)/);
  assert.match(frontendCss, /#page-settings, #page-diagnostics \{ max-width:var\(--content-wide\)/);
});

// Crafting was rewritten from a single dropdown-driven detail view to a
// searchable/filterable card-per-recipe grid (matching the Rigs/Inventory/
// Weapon XP pattern) so every recipe, and which ones are already craftable,
// is scannable at a glance instead of hidden behind a product picker.
test('crafting recipes render as a searchable, filterable card grid with per-card actions', () => {
  assert.match(html, /id="craftingSearch"/);
  assert.match(html, /id="craftingStateFilter"/);
  assert.match(html, /id="craftingGrid" class="recipe-grid"/);
  assert.doesNotMatch(html, /id="craftingProduct"/);
  assert.match(frontendJs, /cardClass: `recipe-card \$\{ready \? 'is-ready' : ''\}`/);
  assert.match(frontendJs, /data-action="craft-add-missing"/);
  assert.match(frontendJs, /data-action="craft-add-all"/);
});

test('dense app-wide controls retain mobile and reduced-motion fallbacks', () => {
  assert.match(frontendCss, /input, select, button \{ min-height:var\(--control-h\)/);
  assert.match(frontendCss, /@media \(max-width:800px\)/);
  assert.match(frontendCss, /\.filter-bar--sticky \{ position:sticky/);
  assert.match(frontendCss, /@media \(max-width:1050px\)/);
  assert.match(frontendCss, /\.filter-bar--sticky \{ position:static/);
});

test('value editors are explicitly opted in and bind one primary submit safely', () => {
  assert.match(valueEditorJs, /export function bindValueEditors\(root = document\)/);
  assert.match(valueEditorJs, /const bindings = new WeakMap\(\)/);
  assert.match(valueEditorJs, /classList\.contains\('value-editor'\)/);
  assert.match(valueEditorJs, /closest\('\.value-editor-pair'\)\?\.querySelector\('\[data-value-submit\]:not\(:disabled\)'\)/);
  assert.match(valueEditorJs, /event\.target\.select\(\)/);
  assert.match(valueEditorJs, /bindings\.get\(root\) !== unbind/);
  assert.match(frontendJs, /import \{ bindValueEditors \} from '\.\.\/value-editor\.mjs';/);
  assert.match(frontendJs, /bindValueEditors\(\);/);
  assert.doesNotMatch(frontendJs, /QUICK_SUBMIT_SCOPE|function nextButtonFor/);
  for (const source of ['inventory/list.mjs', 'inventory/add-items.mjs', 'weapons.mjs', 'vendors-repair.mjs', 'dashboard.mjs', 'characters.mjs']) {
    const moduleJs = fs.readFileSync(path.join(publicRoot, 'modules', 'features', source), 'utf8');
    assert.match(moduleJs, /value-editor/);
    assert.match(moduleJs, /data-value-submit/);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(publicRoot, 'modules', 'features', 'settings-planners.mjs'), 'utf8'), /value-editor|data-value-submit/);
  assert.match(frontendCss, /\.value-editor-pair \{ display:flex/);
});

test('filter toolbars are labelled landmarks with shared sticky behavior and scoped clear actions', () => {
  const filterBars = [...html.matchAll(/<div class="[^"]*\bfilter-bar\b[^"]*"[^>]*>/g)].map(match => match[0]);
  assert.equal(filterBars.length, 8);
  for (const bar of filterBars) {
    assert.match(bar, /\bfilter-bar--sticky\b/);
    assert.match(bar, /role="search"/);
    assert.match(bar, /aria-label="Filter [^"]+"/);
  }
  for (const action of ['clear-hub-filters', 'clear-preset-filters', 'clear-weapon-xp-filters', 'clear-crafting-filters']) {
    assert.match(html, new RegExp(`<button type="button" class="mini" data-action="${action}"`));
  }
  assert.doesNotMatch(html, /data-action="clear-weapon-build-filters"/);
});

test('inventory and add-item cards expose local iconography and visible taxonomy', () => {
  assert.match(frontendJs, /function itemTypeIcon\(category, subtype/);
  assert.match(frontendJs, /<svg viewBox="0 0 24 24" focusable="false">/);
  assert.match(frontendJs, /class="item-type-icon" aria-hidden="true"/);
  assert.match(frontendJs, /function itemCategoryPills\(category, subtype, source/);
  assert.match(frontendJs, /export function itemIdentityHtml/);
  assert.match(frontendJs, /itemTypeIcon\(category, subtype\)/);
  assert.match(frontendJs, /itemCategoryPills\(category, subtype, sourceMap\)/);
  assert.match(frontendJs, /category: r\.d\.cat,[\s\S]*subtype: r\.d\.sub/);
  assert.match(frontendJs, /category: r\.grp,[\s\S]*subtype: r\.sub \|\| r\.category/);
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
  assert.match(frontendJs, /cardClass: 'trader-card'/);
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

test('static markup avoids banned jargon and app-invented gaming slang', () => {
  // Copy style guide section 3/4a: these terms must never reach the player
  // unprompted in index.html. "BIS" is confirmed not a game term (app-invented
  // slang for "best in slot"); "Trader"/"FactionScore" are internal names the
  // glossary requires translating to "Vendor"/"Faction trust" everywhere.
  // Ids, classes, and data-* attributes are exempt (never shown to the player);
  // strip attribute values that hold implementation names before checking.
  const userFacing = html.replace(/\s(?:id|class|data-[a-z-]*)="[^"]*"/g, '');
  assert.doesNotMatch(userFacing, /\bBIS\b/);
  assert.doesNotMatch(userFacing, /\bTrader\b/);
  assert.doesNotMatch(userFacing, /FactionScore/);
  assert.doesNotMatch(userFacing, /\bmutation\b/i);
  assert.doesNotMatch(userFacing, /\bschema\b/i);
});

test('every SPA page has a heading distinct from every other page (no duplicate announcements)', () => {
  const pages = [...html.matchAll(/<div class="page(?: active)?" id="page-([^"]+)">([\s\S]*?)(?=<div class="page(?: active)?" id="page-|<\/main>)/g)];
  const headings = pages.map(([, id, body]) => {
    const match = body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    return { id, text: match ? match[1].replace(/<[^>]+>/g, '').trim() : null };
  }).filter(entry => entry.text);
  const seen = new Map();
  for (const { id, text } of headings) {
    assert.ok(!seen.has(text), `duplicate <h2> text "${text}" on page-${id} (already used by page-${seen.get(text)})`);
    seen.set(text, id);
  }
});

test('filter/select labels use one consistent style: no trailing colon', () => {
  // Style guide section 2/6: form labels get no trailing colon. Guards
  // against regressions like "Category:" creeping back in next to
  // colon-free siblings such as "Status".
  const labelTexts = [...html.matchAll(/<label>([A-Za-z][A-Za-z /-]*)\s*\n/g)].map(m => m[1]);
  for (const text of labelTexts) assert.ok(!text.endsWith(':'), `label "${text}" has a trailing colon`);
});

test('loading placeholders use a consistent ellipsis character, not three dots', () => {
  assert.doesNotMatch(html, /\.\.\./);
});

test('the weapon XP intro cites the real reference-save value, not a stale example', () => {
  // Regression guard for the PST02 = 100k factual error: the app's actual
  // fallback is only used when a weapon is absent from the reference save,
  // and PST02 IS present (186 XP), so the intro must not claim 100k for it.
  const weaponXpRef = require('../data/weapon-xp-reference.canonical.json').weaponXp;
  assert.equal(weaponXpRef['Scope.Weapon.PST02'], 186);
  assert.doesNotMatch(html, /PST02\s*=\s*100k/);
  assert.match(html, /PST02\s*=\s*186/);
});

test('overview surfaces read-only faction trust with a vendor shortcut', () => {
  const overview = html.match(/id="page-dashboard">([\s\S]*?)<div class="page" id="page-characters">/)[1];
  assert.ok(overview.indexOf('id="dashResources"') < overview.indexOf('id="dashFactionTrust"'));
  assert.ok(overview.indexOf('id="dashFactionTrust"') < overview.indexOf('id="dashInventory"'));
  assert.match(overview, /data-page-target="vendors"/);
  assert.match(frontendJs, /function renderDashFactionTrust\(factions\)/);
  assert.match(frontendJs, /api\('\/vendors'\)\.catch/);
});


test('buttons with both visible text and an aria-label satisfy WCAG 2.5.3 Label in Name', () => {
  // A visible label that is not contained in the accessible name breaks
  // voice control: the user says what they can see, and no element matches.
  // This regressed once when a button's visible text was shortened to
  // "Set filtered to 100k" while its aria-label stayed the long form.
  const offenders = [];
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = match[1];
    const ariaLabel = (attrs.match(/aria-label="([^"]*)"/) || [])[1];
    if (!ariaLabel) continue;
    // Strip nested markup (icons are aria-hidden) and sr-only spans, leaving
    // the text a sighted user actually reads on the control.
    const visible = match[2]
      .replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!visible) continue;
    const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!normalize(ariaLabel).includes(normalize(visible))) {
      offenders.push(`visible "${visible}" not contained in aria-label "${ariaLabel}"`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('every FW helper a module calls is actually destructured from FW', () => {
  // Three shipped features were silently broken by this exact omission:
  // characters.mjs called confirmAction (Apply prestige), and
  // vendors-repair.mjs / weapons.mjs called validateInteger (the trust tier
  // presets and the per-weapon "Set XP to 100,000" button). Each threw a
  // ReferenceError that the central dispatcher swallowed into a generic
  // failure banner, so the button simply appeared not to work.
  const modulesRoot = path.join(publicRoot, 'modules');
  const readTreePaths = root => fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => (
    entry.isDirectory()
      ? readTreePaths(path.join(root, entry.name))
      : entry.name.endsWith('.mjs') ? [path.join(root, entry.name)] : []
  ));
  const moduleFiles = readTreePaths(modulesRoot);
  const coreSrc = fs.readFileSync(path.join(modulesRoot, 'core.mjs'), 'utf8');
  const exposed = new Set();
  for (const block of coreSrc.matchAll(/expose\(\{([\s\S]*?)\}\)/g)) {
    for (const entry of block[1].split(',')) {
      const name = entry.split(':')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) exposed.add(name);
    }
  }
  const missing = [];
  for (const file of moduleFiles) {
    const src = fs.readFileSync(file, 'utf8');
    const destructure = src.match(/const \{([^}]*)\} = FW;/);
    const imported = new Set(destructure ? destructure[1].split(',').map(s => s.trim()) : []);
    // A helper can also legitimately arrive via a direct ES import from a
    // sibling leaf module (e.g. feedback.mjs importing esc from dom.mjs)
    // rather than through the FW registry -- that's not the ReferenceError
    // bug this test guards against, so those names count as satisfied too.
    for (const importBlock of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
      for (const entry of importBlock[1].split(',')) {
        const name = entry.trim().split(/\s+as\s+/).pop().trim();
        if (name) imported.add(name);
      }
    }
    const localDefs = new Set([...src.matchAll(/(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
    // Strip comments so a helper merely *mentioned* in prose isn't counted.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const name of exposed) {
      if (imported.has(name) || localDefs.has(name)) continue;
      if (new RegExp('(?<![\\w$.\'"`])' + name + '\\s*\\(').test(code)) {
        missing.push(`${path.basename(file)} calls ${name}() without destructuring it from FW`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
