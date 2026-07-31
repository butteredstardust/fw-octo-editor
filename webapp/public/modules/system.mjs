import { FW, expose } from './runtime.mjs';

const { api, esc, actionIcon, debounce, showToast, showNotice, showLoading, setOperationFeedback, operationFeedbackFor, technicalDetails } = FW;
const feature = name => (...args) => FW[name](...args);
const loadDashboard = feature('loadDashboard');
const loadCharacters = feature('loadCharacters');
const loadHubUpgrades = feature('loadHubUpgrades');
const filterHubUpgrades = feature('filterHubUpgrades');
const loadWeaponXp = feature('loadWeaponXp');
const loadInventory = feature('loadInventory');
const loadRepair = feature('loadRepair');
const loadVendors = feature('loadVendors');
const loadStats = feature('loadStats');
const loadAddCatalog = feature('loadAddCatalog');
const loadRigs = feature('loadRigs');
const loadSettings = feature('loadSettings');
const loadCrafting = feature('loadCrafting');
const setCraftingKind = feature('setCraftingKind');
const loadPresets = feature('loadPresets');
const loadWeaponBuilds = feature('loadWeaponBuilds');
const renderPresets = feature('renderPresets');
const renderWeaponBuildSelector = feature('renderWeaponBuildSelector');
const renderWeaponBuild = feature('renderWeaponBuild');
const addMissingForOwnedWeapons = feature('addMissingForOwnedWeapons');
const renderWeaponXp = feature('renderWeaponXp');
const setAllToReference = feature('setAllToReference');
const onInvCategoryChange = feature('onInvCategoryChange');
const resetInvExpansion = feature('resetInvExpansion');
const renderInventory = feature('renderInventory');
const clearInvFilters = feature('clearInvFilters');
const renderAddCatalog = feature('renderAddCatalog');
const onAddCategoryChange = feature('onAddCategoryChange');
const clearAddFilters = feature('clearAddFilters');
const toggleAddSection = feature('toggleAddSection');
const toggleAllAddSections = feature('toggleAllAddSections');
const renderRigs = feature('renderRigs');
const clearRigFilters = feature('clearRigFilters');
const renderCraftingGrid = feature('renderCraftingGrid');
const updateCraftQty = feature('updateCraftQty');
const craftingAddMissing = feature('craftingAddMissing');
const craftingAddAll = feature('craftingAddAll');
const pickSaveDir = feature('pickSaveDir');
const clearSaveDir = feature('clearSaveDir');
const saveSettings = feature('saveSettings');
const toggleDbKeyVisibility = feature('toggleDbKeyVisibility');
const clearDbKey = feature('clearDbKey');
const markQuestReady = feature('markQuestReady');
const setResource = feature('setResource');
const addResource = feature('addResource');
const setLevel = feature('setLevel');
const prestige = feature('prestige');
const setCharXp = feature('setCharXp');
const showCharacter = feature('showCharacter');
const setDetailLevel = feature('setDetailLevel');
const detailPrestige = feature('detailPrestige');
const setDetailXp = feature('setDetailXp');
const toggleSkillNode = feature('toggleSkillNode');
const applyDetailSkills = feature('applyDetailSkills');
const confirmBulkHub = feature('confirmBulkHub');
const toggleSection = feature('toggleSection');
const toggleHubUpgrade = feature('toggleHubUpgrade');
const addUpgradeMaterials = feature('addUpgradeMaterials');
const addWeaponBuildPart = feature('addWeaponBuildPart');
const addMissingWeaponBuildBundle = feature('addMissingWeaponBuildBundle');
const selectWeaponBuild = feature('selectWeaponBuild');
const setWeaponXp = feature('setWeaponXp');
const toggleAllInvSections = feature('toggleAllInvSections');
const toggleInvSection = feature('toggleInvSection');
const updateItem = feature('updateItem');
const setQty = feature('setQty');
const addItem = feature('addItem');
const addRig = feature('addRig');
const addRigKit = feature('addRigKit');
const setFactionScore = feature('setFactionScore');
const toggleTrader = feature('toggleTrader');
const collectRepair = feature('collectRepair');

const pageScrollMemory = new Map();
let currentPageName = 'dashboard';

// Normalizes the two shapes /api/status and /api/diagnostics both use for
// "is the game running": either a list of matched processes, or a plain
// boolean/falsy sentinel when process detection itself is unavailable.
// Every call site must use this -- a raw truthiness check on an empty array
// is always true (`![]` is false), which previously let the Backups page
// claim writes were disabled while the header said otherwise.
function isGameRunning(status) {
  const value = status && status.gameRunning;
  return Array.isArray(value) ? value.length > 0 : !!value;
}

// A single place to turn a possibly-missing/unparseable timestamp into
// either a real localized string or a clear, non-alarming fallback --
// `new Date(undefined).toLocaleString()` renders the literal text
// "Invalid Date", which reads as a bug rather than "this hasn't run yet".
function formatTimestamp(value, fallback = 'Not run yet') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}
function closeMobileNav(returnFocus) {
  document.body.classList.remove('nav-open');
  document.getElementById('navToggle').setAttribute('aria-expanded', 'false');
  document.getElementById('main-content').removeAttribute('inert');
  document.querySelector('.safety-bar').removeAttribute('inert');
  document.getElementById('navBackdrop').hidden = true;
  if (returnFocus) document.getElementById('navToggle').focus();
}

// The set of page names that are safe to restore from a URL hash: exactly
// the pages reachable from the sidebar. Anything else (an unknown, stale,
// or hand-edited hash, or the id-less "character" detail page which needs
// runtime state it can't get from a hash alone) must never be trusted --
// it's only ever used as a lookup key against this allow-list, never
// interpolated into the DOM.
function knownPageNames() {
  return new Set([...document.querySelectorAll('.nav button[data-page]')].map(btn => btn.dataset.page));
}

function pageNameFromHash() {
  const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  return knownPageNames().has(raw) ? raw : null;
}

function showPage(pageName, { fromHistory = false } = {}) {
  const target = document.getElementById(`page-${pageName}`);
  if (!target) return;
  pageScrollMemory.set(currentPageName, window.scrollY);
  document.querySelectorAll('.page').forEach(page => { page.classList.remove('active'); page.hidden = true; });
  document.querySelectorAll('.nav button').forEach(button => { button.classList.remove('active'); button.removeAttribute('aria-current'); });
  target.classList.add('active');
  target.hidden = false;
  const navButton = document.querySelector(`[data-page="${pageName}"]`);
  navButton?.classList.add('active');
  navButton?.setAttribute('aria-current', 'page');
  const heading = target.querySelector('h2, h1');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  document.getElementById('appAnnouncements').textContent = `${navButton ? navButton.textContent : pageName} page opened`;
  currentPageName = pageName;
  closeMobileNav(false);
  requestAnimationFrame(() => window.scrollTo({ top: pageScrollMemory.get(pageName) || 0, behavior: 'instant' }));
  if (pageName === 'weapon-builds') loadWeaponBuilds();
  if (pageName === 'presets') loadPresets();
  if (pageName === 'vendors') loadVendors();
  if (pageName === 'stats') loadStats();
  if (pageName === 'repair') loadRepair();
  if (pageName === 'add-items') loadAddCatalog();
  if (pageName === 'rigs') loadRigs();
  if (pageName === 'settings') loadSettings();
  if (pageName === 'crafting') loadCrafting();
  if (pageName === 'backups') loadBackups();
  if (pageName === 'diagnostics') runDiagnostics();
  // fromHistory means this call originated from the browser (a hashchange
  // or popstate event, or the initial-load restore below) -- the URL
  // already reflects pageName, so pushing another entry would double up
  // history and break Back. Only reflect in-app navigation (nav clicks,
  // "show-page" actions) into a new history entry/hash.
  if (!fromHistory && knownPageNames().has(pageName)) {
    const hash = `#${pageName}`;
    if (location.hash !== hash) history.pushState(null, '', hash);
  }
}

document.querySelectorAll('.nav button').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// Restore whatever page a reload/deep link points at; fall back to the
// default Overview (already the statically-rendered active page) for an
// empty, unknown, or malformed hash rather than trying to guess.
{
  const initialPage = pageNameFromHash();
  if (initialPage && initialPage !== currentPageName) showPage(initialPage, { fromHistory: true });
  else if (location.hash && !initialPage) history.replaceState(null, '', location.pathname + location.search);
}

window.addEventListener('popstate', () => {
  const name = pageNameFromHash() || 'dashboard';
  if (name !== currentPageName) showPage(name, { fromHistory: true });
});
window.addEventListener('hashchange', () => {
  const name = pageNameFromHash() || 'dashboard';
  if (name !== currentPageName) showPage(name, { fromHistory: true });
});

document.getElementById('navToggle').addEventListener('click', event => {
  const open = document.body.classList.toggle('nav-open');
  event.currentTarget.setAttribute('aria-expanded', String(open));
  document.getElementById('main-content').toggleAttribute('inert', open);
  document.querySelector('.safety-bar').toggleAttribute('inert', open);
  document.getElementById('navBackdrop').hidden = !open;
  if (open) (document.querySelector('.nav button.active') || document.querySelector('.nav button'))?.focus();
});
document.getElementById('navBackdrop').addEventListener('click', () => closeMobileNav(true));
document.getElementById('retryConnectionButton').addEventListener('click', refreshSafetyStatus);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('nav-open')) {
    closeMobileNav(true);
  } else if (event.key === 'Tab' && document.body.classList.contains('nav-open')) {
    const focusable = [document.getElementById('navToggle'), ...document.querySelectorAll('.nav button:not(:disabled)')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

function bind(id, event, handler) { document.getElementById(id).addEventListener(event, handler); }
bind('reloadHubButton', 'click', loadHubUpgrades);
bind('presetSearch','input',debounce(renderPresets,120));
bind('presetType','change',()=>{sessionStorage.setItem('presetType',document.getElementById('presetType').value);renderPresets();});
bind('weaponBuildSearch','input',debounce(renderWeaponBuildSelector,120));
bind('weaponBuildAddOwned','click',addMissingForOwnedWeapons);
bind('weaponBuildCategory','change',renderWeaponBuildSelector);
bind('weaponBuildSelect','change',()=>selectWeaponBuild(document.getElementById('weaponBuildSelect').value));
bind('weaponFilter', 'change', renderWeaponXp);
bind('weaponXpSearch', 'input', debounce(renderWeaponXp, 120));
bind('hubStatusFilter', 'change', filterHubUpgrades);
bind('hubSearch', 'input', debounce(filterHubUpgrades, 120));
bind('setWeaponReferenceButton', 'click', setAllToReference);
bind('inventorySearch', 'input', debounce(() => { resetInvExpansion(); renderInventory(); }, 120));
bind('inventoryFilter', 'change', onInvCategoryChange);
for (const id of ['inventorySource', 'inventorySubFilter', 'inventoryQty']) bind(id, 'change', () => { resetInvExpansion(); renderInventory(); });
bind('inventoryInvalidOnly', 'change', renderInventory);
bind('clearInventoryFiltersButton', 'click', clearInvFilters);
bind('addSearch', 'input', debounce(renderAddCatalog, 120));
bind('addFilter', 'change', onAddCategoryChange);
for (const id of ['addSubFilter', 'addSource', 'addState']) bind(id, 'change', renderAddCatalog);
bind('clearAddFiltersButton', 'click', clearAddFilters);
bind('rigSearch', 'input', debounce(renderRigs, 120));
bind('rigOwnership', 'change', renderRigs);
bind('rigClass', 'change', renderRigs);
bind('clearRigFiltersButton', 'click', clearRigFilters);
bind('craftingSearch', 'input', debounce(renderCraftingGrid, 120));
bind('craftingStateFilter', 'change', renderCraftingGrid);
for (const tab of document.querySelectorAll('.crafting-tab')) tab.addEventListener('click', () => setCraftingKind(tab.dataset.kind));
// Per-card craft-quantity fields are rendered dynamically, so they're bound
// via delegation on the grid container rather than a static id.
document.getElementById('craftingGrid').addEventListener('input', debounce(event => {
  const input = event.target.closest('.recipe-qty-input');
  if (input) updateCraftQty(decodeURIComponent(input.dataset.recipe), input.value);
}, 200));
bind('pickSaveDirButton', 'click', pickSaveDir);
bind('clearSaveDirButton', 'click', clearSaveDir);
bind('saveSettingsButton', 'click', saveSettings);
bind('toggleDbKeyVisibilityButton', 'click', toggleDbKeyVisibility);
bind('clearDbKeyButton', 'click', clearDbKey);
bind('runDiagnosticsButton', 'click', runDiagnostics);

function diagnosticCard(label, passed, detail, warning = false) {
  const state = warning ? 'warn' : passed ? 'pass' : 'fail';
  const word = warning ? 'REVIEW' : passed ? 'PASS' : 'BLOCKED';
  return `<div class="diagnostic-check ${state}"><strong>${word} · ${esc(label)}</strong><span>${esc(detail)}</span></div>`;
}

async function runDiagnostics() {
  const button = document.getElementById('runDiagnosticsButton');
  const status = document.getElementById('diagnosticsStatus');
  const summary = document.getElementById('diagnosticsSummary');
  const details = document.getElementById('diagnosticsDetails');
  button.disabled = true;
  // showLoading sets aria-busy itself and renders the shared skeleton so the
  // stale previous run's cards aren't left on screen while re-checking.
  showLoading(summary, 4, 'Running diagnostics');
  status.textContent = 'Checking saves, tools, schema, and inventory round trip…';
  status.className = 'settings-msg';
  try {
    const data = await api('/diagnostics');
    const compatibility = data.compatibility || {};
    const files = compatibility.files || [];
    const tools = compatibility.tools || {};
    const inventory = data.inventoryRoundTrip || {};
    const running = isGameRunning(data);
    const reasons = compatibility.reasons || [];
    const gameVersion = data.gameVersion || {};
    const gvDetail = gameVersion.detected
      ? `Installed build ${esc(gameVersion.version)} (${esc(gameVersion.source === 'steam-buildid' ? 'Steam' : gameVersion.source === 'epic-manifest' ? 'Epic' : 'game binary')})${gameVersion.appId ? ` · app ${esc(gameVersion.appId)}` : ''}`
      : 'Installed game version could not be detected (set FW_GAME_EXE or FW_GAME_DIR if installed elsewhere).';
    const filesOk = files.length === 3 && files.every(file => file.exists);
    const sessionBackupId = data.mutation && data.mutation.sessionBackupId;
    // Each check below carries its own pass/warning state so the "Blocking
    // reasons" summary can be derived directly from the same checks the
    // cards render -- previously the summary only echoed
    // compatibility.reasons (a narrower list), so it could say "None" while
    // individual cards below it read BLOCKED.
    const checks = [
      { label: 'Game version', passed: gameVersion.detected, detail: gvDetail, warning: !gameVersion.detected },
      { label: 'Three save variants', passed: filesOk, detail: filesOk ? 'Primary and both known-good variants found.' : 'One or more required save variants are missing.' },
      { label: 'SQLite3MC', passed: !!tools.sqlite3mc, detail: tools.sqlite3mc ? 'Database shell is available.' : 'SQLite3MC executable is missing.' },
      { label: 'uesave', passed: !!tools.uesave, detail: tools.uesave ? 'Structured GVAS tool is available.' : 'uesave is missing; inventory writes are disabled.' },
      { label: 'Key and schema', passed: !!compatibility.compatible, detail: compatibility.compatible ? 'Database opened and required schema/rows were found.' : (reasons.join(', ') || 'Compatibility failed.') },
      { label: 'Inventory round trip', passed: !!inventory.byteIdentical, detail: inventory.byteIdentical ? `${inventory.bytes} bytes, ${inventory.inventoryEntries} entries, byte-identical.` : (inventory.error || 'Round trip failed.') },
      { label: 'Game process', passed: !running, detail: running ? 'Close The Forever Winter before any write.' : 'Game is closed.' },
      { label: 'Session backup', passed: !!sessionBackupId, detail: sessionBackupId || 'Created automatically before the first write.', warning: !sessionBackupId },
      { label: 'Steam Cloud', passed: false, detail: data.steamCloudWarning, warning: true }
    ];
    // "Write readiness" is the overall verdict, not an independent root
    // cause, so it's rendered as its own card but excluded from the
    // blocking-reasons rollup below (listing it there would just say
    // "Write readiness" is blocking write readiness).
    const writeReadyCheck = { label: 'Write readiness', passed: !!data.writeReady, detail: data.writeReady ? 'Safety gates currently allow writes.' : 'One or more safety gates block writes.' };
    const cards = [checks[0], checks[1], checks[2], checks[3], checks[4], checks[5], checks[6], writeReadyCheck, checks[7], checks[8]]
      .map(c => diagnosticCard(c.label, c.passed, c.detail, !!c.warning));
    const blockedLabels = checks.filter(c => !c.passed && !c.warning).map(c => c.label);
    const blockingReasonsText = blockedLabels.length
      ? blockedLabels.join(', ')
      : (data.writeReady ? 'None — all checks passed.' : 'None reported — rerun diagnostics.');
    summary.innerHTML = cards.join('');
    details.innerHTML = `<dl class="diagnostic-details">
      <dt>Checked</dt><dd>${esc(formatTimestamp(data.checkedAt))}</dd>
      <dt>Active save directory</dt><dd>${esc(data.activeSaveDir || 'Not configured — using default location.')}</dd>
      <dt>Schema fingerprint</dt><dd><code>${esc(compatibility.schemaFingerprint || 'Unavailable')}</code></dd>
      <dt>Inventory maps</dt><dd>${esc((inventory.maps || []).join(', ') || 'Unavailable')}</dd>
      <dt>Blocking reasons</dt><dd>${esc(blockingReasonsText)}</dd>
    </dl>`;
    status.textContent = data.writeReady ? 'Diagnostics complete: writes are ready.' : 'Diagnostics complete: review blocked checks.';
    status.className = `settings-msg ${data.writeReady ? 'ok' : 'err'}`;
    document.getElementById('appAnnouncements').textContent = status.textContent;
  } catch (error) {
    summary.textContent = '';
    details.textContent = '';
    status.textContent = `Diagnostics failed: ${error.message}`;
    status.className = 'settings-msg err';
  } finally {
    button.disabled = false;
    summary.setAttribute('aria-busy', 'false');
  }
}

const actionHandlers = new Map([
  ['quest-ready', control => markQuestReady(Number(control.dataset.id))],
  ['set-resource', control => setResource(control.dataset.id, control.dataset.kind)],
  ['add-resource', control => addResource(control.dataset.id)],
  ['set-level', control => setLevel(control.dataset.id)],
  ['apply-prestige', control => prestige(control.dataset.id)],
  ['set-character-xp', control => setCharXp(control.dataset.id)],
  ['show-character', control => showCharacter(control.dataset.id)],
  ['show-page', control => showPage(control.dataset.pageTarget)],
  ['set-detail-level', control => setDetailLevel(control.dataset.id)],
  ['detail-prestige', control => detailPrestige(control.dataset.id)],
  ['set-detail-xp', control => setDetailXp(control.dataset.id)],
  ['toggle-skill', control => toggleSkillNode(control)],
  ['apply-skills', control => applyDetailSkills(control.dataset.id)],
  ['bulk-hub', control => confirmBulkHub(control.dataset.enabled === 'true')],
  ['toggle-section', control => toggleSection(control.dataset.target, control)],
  ['toggle-upgrade', control => toggleHubUpgrade(control.dataset.tag, control.dataset.enabled === 'true')],
  ['add-upgrade-materials', control => addUpgradeMaterials(control.dataset.tag, control)],
  ['weapon-build-add-part', control => addWeaponBuildPart(control.dataset.weaponId, control.dataset.partId, control)],
  ['weapon-build-add-bundle', control => addMissingWeaponBuildBundle(control.dataset.id, control)],
  ['select-weapon-build', control => selectWeaponBuild(control.dataset.id)],
  ['set-weapon-xp', control => setWeaponXp(control.dataset.weapon, control.dataset.value === undefined ? undefined : Number(control.dataset.value))],
  ['toggle-all-inventory', control => toggleAllInvSections(control.dataset.open === 'true')],
  ['toggle-inventory-section', control => toggleInvSection(control.dataset.category)],
  ['toggle-all-add-items', control => toggleAllAddSections(control.dataset.open === 'true')],
  ['toggle-add-items-section', control => toggleAddSection(control.dataset.category)],
  ['update-item', control => updateItem(control.dataset.name)],
  ['set-quantity', control => setQty(control.dataset.name, Number(control.dataset.value))],
  ['add-item', control => addItem(control.dataset.id)],
  ['add-rig', control => addRig(control.dataset.id, control)],
  ['add-rig-kit', control => addRigKit(control.dataset.id, control)],
  ['craft-add-missing', control => craftingAddMissing(control.dataset.recipe)],
  ['craft-add-all', control => craftingAddAll(control.dataset.recipe)],
  ['set-faction', control => setFactionScore(control.dataset.scope, control.dataset.value === undefined ? undefined : Number(control.dataset.value))],
  ['toggle-trader', control => toggleTrader(control, control.dataset.key)],
  ['collect-repair', () => collectRepair()]
]);

document.addEventListener('click', async event => {
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  const action = control.dataset.action;
  const handler = actionHandlers.get(action);
  if (!handler) return;
  const isPendingCapable = control.tagName === 'BUTTON';
  if (isPendingCapable) control.classList.add('is-pending');
  try {
    await handler(control);
  } catch (error) {
    if (error.code === 'validation') return;
    if (error.code === 'mutation-active' || (error.status === 409 && /operation|mutation/i.test(error.message))) showToast('Please wait for the current save operation to finish.', 'error');
    else if (error.uncertainMutation) showNotice(error.message, 'Save result unknown');
    else if (!setOperationFeedback(operationFeedbackFor(control), error.message, error.payload, 'error')) showNotice(error.message, 'Change failed');
  } finally {
    if (isPendingCapable) control.classList.remove('is-pending');
  }
});

// Containers where a number input is immediately paired with the button that
// applies it (Set / Add Item / Set XP / Set Score / Set Prestige / Set XP).
const QUICK_SUBMIT_SCOPE = '.inv-actions, .add-actions, .weapon-actions, .vendor-score, .char-detail-actions';

// The button a given number input should submit to: the nearest button that
// follows it (or its wrapping <label>, when the input is label-wrapped) in
// document order, skipping over any non-button siblings (e.g. a hidden
// sourceMap input). This also correctly disambiguates containers that hold
// more than one input/button pair -- e.g. .char-detail-actions has both a
// Prestige-level and an XP field -- since each input's own nearest button is
// resolved independently rather than picking "the" primary button for the
// whole container.
function nextButtonFor(input) {
  let sib = (input.closest('label') || input).nextElementSibling;
  while (sib && sib.tagName !== 'BUTTON') sib = sib.nextElementSibling;
  return sib;
}

// Quantity/value fields: Enter submits the same as clicking the paired
// button, so a value can be typed and applied without reaching for the
// mouse -- the single most repeated action on these pages.
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  const input = event.target;
  if (input.tagName !== 'INPUT' || input.type !== 'number') return;
  if (!input.closest(QUICK_SUBMIT_SCOPE)) return;
  const primary = nextButtonFor(input);
  if (primary && !primary.disabled) { event.preventDefault(); primary.click(); }
});

// Auto-select existing text when focusing one of these fields so typing
// immediately replaces the value instead of requiring a manual select-all.
document.addEventListener('focus', event => {
  const input = event.target;
  if (input.tagName === 'INPUT' && input.type === 'number' && input.closest(QUICK_SUBMIT_SCOPE)) input.select();
}, true);

document.querySelector('.nav').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...document.querySelectorAll('.nav button')];
  const current = buttons.indexOf(document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus();
});

document.querySelectorAll('.page').forEach(page => { page.hidden = !page.classList.contains('active'); });
document.querySelector('[data-page="dashboard"]')?.setAttribute('aria-current', 'page');

function setSafetyValue(id, text, state) {
  const element = document.getElementById(id);
  element.textContent = text;
  element.className = `safety-value${state ? ` ${state}` : ''}`;
}

async function refreshSafetyStatus() {
  try {
    const status = await api('/status');
    const running = isGameRunning(status);
    setSafetyValue('safetyCompatibility', status.compatibility && status.compatibility.compatible ? 'Compatible' : 'Writes blocked', status.compatibility && status.compatibility.compatible ? 'good' : 'bad');
    const backupId = status.mutation && status.mutation.sessionBackupId;
    setSafetyValue('safetyBackup', backupId || 'Pending first write', backupId ? 'good' : 'warn');
    setSafetyValue('safetySave', status.activeSaveDir || 'Not configured', '');
    document.getElementById('safetySave').title = status.activeSaveDir || '';
    // "Not detected" (rather than the more alarming-sounding "Unknown") is
    // intentional here -- the game genuinely may not be running or
    // installed somewhere this editor can find, and that's a normal,
    // informative state, not a broken one. See the safety-item's title
    // attribute in index.html for the fuller explanation shown on hover.
    setSafetyValue('safetyGameVersion', status.verifiedGameVersion || 'Not detected', '');
    setSafetyValue('safetyAppVersion', status.appVersion ? `v${status.appVersion}` : 'Unknown', '');
    updatePreflightPanel(status);

    const gameStatus = document.getElementById('gameStatus');
    gameStatus.textContent = running ? 'Game running — writes disabled' : 'Game closed';
    gameStatus.dataset.state = running ? 'running' : 'closed';

    const writesStatus = document.getElementById('writesStatus');
    writesStatus.textContent = status.writeReady ? 'Writes ready' : 'Writes blocked';
    writesStatus.dataset.state = status.writeReady ? 'ready' : 'blocked';
    writesStatus.title = status.writeReady
      ? 'Safe to make edits.'
      : `Blocked: ${status.blockingReasons && status.blockingReasons.length ? status.blockingReasons.join(', ') : 'unknown reason'}`;
  } catch (error) {
    for (const id of ['safetyCompatibility', 'safetyBackup', 'safetySave', 'safetyGameVersion', 'safetyAppVersion']) setSafetyValue(id, 'Status unavailable', 'bad');
    const gameStatus = document.getElementById('gameStatus');
    gameStatus.textContent = 'Safety status unavailable';
    gameStatus.dataset.state = 'checking';
    const writesStatus = document.getElementById('writesStatus');
    writesStatus.textContent = 'Status unavailable';
    writesStatus.dataset.state = 'checking';
    writesStatus.title = '';
  }
}

// ---- Backups -------------------------------------------------------------
let backupDialogAction = null;
let backupDialogReturnFocus = null;

function setBackupBusy(busy, message) {
  const list = document.getElementById('backupList');
  const status = document.getElementById('backupStatus');
  const create = document.getElementById('createBackupButton');
  const refresh = document.getElementById('refreshBackupsButton');
  list.setAttribute('aria-busy', busy ? 'true' : 'false');
  create.disabled = busy;
  refresh.disabled = busy;
  status.textContent = message || '';
  status.className = 'settings-msg';
}

function showBackupReceipt(title, result) {
  const receipt = document.getElementById('backupReceipt');
  const details = [
    result.backupId ? `Backup: ${result.backupId}` : null,
    result.safetyBackupId ? `Safety backup: ${result.safetyBackupId}` : null,
    result.restoredFiles ? `Restored: ${result.restoredFiles.join(', ')}` : null
  ].filter(Boolean);
  receipt.className = 'backup-receipt';
  const disclosure = result.afterHash ? technicalDetails(`SHA-256: ${result.afterHash}`, 'Show technical details') : '';
  receipt.innerHTML = `${esc(title)}${details.length ? ' · ' + esc(details.join(' · ')) : ''}${disclosure}`;
}

async function loadBackups() {
  const list = document.getElementById('backupList');
  setBackupBusy(true, 'Loading backups…');
  // Match the skeleton affordance every other list page uses, rather than
  // leaving the previous list on screen behind a one-line status message.
  showLoading(list, 3, 'Loading backups');
  try {
    const [backups, status] = await Promise.all([api('/backups'), api('/status')]);
    const sessionId = status.mutation && status.mutation.sessionBackupId;
    if (!backups.length) {
      list.innerHTML = '<p class="char-hint">No application backups found.</p>';
    } else {
      list.innerHTML = backups.map(backup => {
        const id = esc(backup.name);
        const created = formatTimestamp(backup.created, 'Unknown time');
        const active = backup.name === sessionId;
        return `<article class="backup-row ${backup.manifestValid ? '' : 'invalid'}">
          <div class="backup-head">
            <strong class="backup-id">${id}</strong>
            <span class="backup-meta">${esc(created)}</span>
          </div>
          <div class="backup-meta">Label: ${esc(backup.label || 'legacy/unknown')} · App: ${esc(backup.appVersion || 'unknown')} · Manifest: ${backup.manifestValid ? 'verified format' : 'missing or invalid'}${active ? ' · Active session backup' : ''}</div>
          <div class="backup-actions">
            <button type="button" data-backup-action="restore" data-backup-id="${id}" ${backup.manifestValid && status.writeReady ? '' : 'disabled'}>${actionIcon('refresh')}Restore primary</button>
            <button type="button" class="danger-btn" data-backup-action="delete" data-backup-id="${id}" ${active ? 'disabled' : ''}>${actionIcon('trash')}Delete permanently</button>
          </div>
        </article>`;
      }).join('');
    }
    setBackupBusy(false, isGameRunning(status) ? 'Writes are disabled while the game is running.' : `${backups.length} backup${backups.length === 1 ? '' : 's'} found.`);
  } catch (error) {
    list.textContent = '';
    setBackupBusy(false, `Error: ${error.message}`);
    document.getElementById('backupStatus').className = 'settings-msg err';
  }
}

// Backup restore/delete use a stricter type-to-confirm dialog instead of confirmAction()
// because both operations are irreversible outside the backup system itself (restore
// overwrites the live save; delete removes the only remaining copy of that snapshot).
function openBackupConfirmation({ title, description, phrase, action, trigger }) {
  const dialog = document.getElementById('backupConfirmDialog');
  backupDialogAction = action;
  backupDialogReturnFocus = trigger || document.activeElement;
  document.getElementById('backupDialogTitle').textContent = title;
  document.getElementById('backupDialogDescription').textContent = description;
  document.getElementById('backupDialogPhrase').textContent = phrase;
  document.getElementById('backupDialogInput').value = '';
  document.getElementById('backupDialogError').textContent = '';
  dialog.showModal();
  document.getElementById('backupDialogInput').focus();
}

document.getElementById('backupConfirmDialog').addEventListener('close', () => {
  backupDialogAction = null;
  if (backupDialogReturnFocus && backupDialogReturnFocus.isConnected) backupDialogReturnFocus.focus();
});

document.getElementById('backupDialogConfirm').addEventListener('click', async () => {
  const dialog = document.getElementById('backupConfirmDialog');
  const input = document.getElementById('backupDialogInput');
  const expected = document.getElementById('backupDialogPhrase').textContent;
  const error = document.getElementById('backupDialogError');
  if (input.value !== expected) { error.textContent = 'The confirmation text does not match.'; input.focus(); return; }
  const button = document.getElementById('backupDialogConfirm');
  button.disabled = true;
  error.textContent = 'Working…';
  try {
    const result = await backupDialogAction(input.value);
    dialog.close();
    showBackupReceipt(result.deleted ? 'Backup deleted.' : 'Primary save restored and verified.', result);
    await loadBackups();
  } catch (operationError) {
    error.textContent = `Error: ${operationError.message}`;
  } finally { button.disabled = false; }
});

document.getElementById('backupList').addEventListener('click', event => {
  const button = event.target.closest('[data-backup-action]');
  if (!button || button.disabled) return;
  const id = button.dataset.backupId;
  if (button.dataset.backupAction === 'restore') {
    openBackupConfirmation({
      title: 'Restore primary save',
      description: 'This verifies all backup variants, creates a new safety backup, and replaces only the live primary save.',
      phrase: `RESTORE ${id}`,
      trigger: button,
      action: confirmation => api(`/backups/${encodeURIComponent(id)}/restore`, { method: 'POST', body: JSON.stringify({ confirmation }) })
    });
  } else {
    openBackupConfirmation({
      title: 'Delete backup permanently',
      description: 'This removes the selected backup directory and cannot be undone.',
      phrase: `DELETE ${id}`,
      trigger: button,
      action: confirmation => api(`/backups/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ confirmation }) })
    });
  }
});

document.getElementById('createBackupButton').addEventListener('click', async () => {
  const label = document.getElementById('backupLabel').value.trim();
  const status = document.getElementById('backupStatus');
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,47}$/.test(label)) { status.className = 'settings-msg err'; status.textContent = 'Use 1–48 letters, numbers, spaces, underscores, or hyphens; start with a letter or number.'; return; }
  setBackupBusy(true, 'Creating and verifying all three save variants…');
  try {
    const result = await api('/backups', { method: 'POST', body: JSON.stringify({ label }) });
    showBackupReceipt('Verified backup created.', { backupId: result.id });
    await loadBackups();
  } catch (error) { setBackupBusy(false, `Error: ${error.message}`); status.className = 'settings-msg err'; }
});

document.getElementById('refreshBackupsButton').addEventListener('click', loadBackups);

// ---- Acknowledgements modal ----------------------------------------------
const acknowledgementsDialog = document.getElementById('acknowledgementsDialog');
let acknowledgementsReturnFocus = null;

function openAcknowledgements() {
  acknowledgementsReturnFocus = document.activeElement;
  acknowledgementsDialog.showModal();
  document.getElementById('ackCloseButton').focus();
}

acknowledgementsDialog.addEventListener('close', () => {
  if (acknowledgementsReturnFocus && acknowledgementsReturnFocus.isConnected) acknowledgementsReturnFocus.focus();
});

document.getElementById('infoButton').addEventListener('click', openAcknowledgements);
document.getElementById('ackCloseButton').addEventListener('click', () => acknowledgementsDialog.close());
document.getElementById('ackAcceptButton').addEventListener('click', () => acknowledgementsDialog.close());
// Allow clicking the backdrop (outside the dialog surface) to dismiss.
acknowledgementsDialog.addEventListener('click', event => {
  if (event.target === acknowledgementsDialog) acknowledgementsDialog.close();
});

// ---- Nav scroll affordance ------------------------------------------------
// At short viewport heights (e.g. 1366x768 laptops) the sidebar nav scrolls
// internally and the whole SYSTEM group (Backups/Diagnostics/Settings) can
// sit below the fold with no visual hint that there's more nav below --
// Backups being the most safety-critical page in the app made this worth a
// dedicated, always-available affordance (in addition to the tighter nav
// density in refinements.css) rather than relying on density tuning alone.
function updateNavScrollHint() {
  const nav = document.getElementById('primaryNav');
  const hint = document.getElementById('navScrollHint');
  if (!nav || !hint) return;
  const hasMoreBelow = nav.scrollHeight - nav.clientHeight - nav.scrollTop > 4;
  hint.classList.toggle('visible', hasMoreBelow);
}
document.getElementById('primaryNav')?.addEventListener('scroll', updateNavScrollHint, { passive: true });
window.addEventListener('resize', debounce(updateNavScrollHint, 100));
updateNavScrollHint();

// ---- First-run preflight panel --------------------------------------------
// /api/status already computes everything needed to know whether the app is
// actually usable (tools present, save found, key/schema compatible, game
// closed), but previously that only surfaced when a user manually opened
// Diagnostics -- otherwise the UI rendered fully and "healthy" and the first
// sign of trouble was a cryptic error on the first edit attempt. This turns
// the same status payload already fetched by refreshSafetyStatus() into a
// plain-language, dismissible, non-blocking panel.
const PREFLIGHT_REASON_TEXT = {
  'game-process-unknown': 'This editor could not tell whether The Forever Winter is running. Close the game to be safe, then reload this page.',
  'game-running': 'The Forever Winter is currently running. Close it completely -- changes are disabled while the game is open.',
  'mutation-active': 'A change is already saving. Wait for it to finish, then try again.',
  'missing-save-variants': 'Your save files were not found in the configured folder. Open Settings and point the editor at the folder with your .dat save files.',
  'missing-sqlite3mc': 'The SQLite3MC database tool is missing. On Windows it is expected at C:\\tmp\\fw-tools\\sqlite3mc\\bin\\sqlite3mc_shell_x64.exe; on another OS, or a custom install, set the FW_SQLITE_BIN environment variable to its location, then reload.',
  'unknown-game-version': 'The installed game version could not be detected. Changes may still work, but proceed carefully and keep backups.',
  'unverified-game-version': 'The installed game version has not been verified against this editor. Changes may still work, but proceed carefully and keep backups.',
  'key-or-database-incompatible': 'The database key does not match this save, or the save could not be opened. Open Settings and check the key.',
  'missing-required-rows': 'This save is missing data the editor expects to find. It may be from an unsupported game version.'
};
function preflightReasonText(reason) {
  if (reason.startsWith('missing-required-tables:')) return `This save is missing expected data (${reason.slice('missing-required-tables:'.length)}). It may be from an unsupported game version.`;
  return PREFLIGHT_REASON_TEXT[reason] || `An unrecognized setup issue was reported: ${reason}.`;
}
function computePreflightIssues(status) {
  const issues = (status.blockingReasons || []).map(preflightReasonText);
  if (status.compatibility && status.compatibility.tools && status.compatibility.tools.uesave === false) {
    issues.push('The uesave tool used for inventory edits is missing. It is expected at tools/uesave-src/target/release/uesave.exe, or the location set by the GVAS_UESAVE_BIN environment variable. Inventory edits are disabled until it is restored.');
  }
  return issues;
}
let preflightDismissedSignature = null;
let preflightCurrentSignature = null;
function updatePreflightPanel(status) {
  const panel = document.getElementById('preflightPanel');
  if (!panel) return;
  const issues = computePreflightIssues(status);
  const signature = issues.join('|');
  preflightCurrentSignature = signature;
  if (!issues.length || signature === preflightDismissedSignature) { panel.hidden = true; return; }
  if (panel.hidden || panel.dataset.signature !== signature) {
    document.getElementById('preflightMessage').innerHTML = issues.map(text => `<p>${esc(text)}</p>`).join('');
    panel.dataset.signature = signature;
  }
  panel.hidden = false;
}
document.getElementById('preflightDismissButton')?.addEventListener('click', () => {
  preflightDismissedSignature = preflightCurrentSignature;
  document.getElementById('preflightPanel').hidden = true;
});

expose({ showPage, closeMobileNav, runDiagnostics, refreshSafetyStatus, setSafetyValue, loadBackups, openAcknowledgements });

