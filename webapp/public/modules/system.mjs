import { FW, expose } from './runtime.mjs';

const { api, esc, debounce, showToast, showNotice, setOperationFeedback, operationFeedbackFor } = FW;
const feature = name => (...args) => FW[name](...args);
const loadDashboard = feature('loadDashboard');
const loadCharacters = feature('loadCharacters');
const loadHubUpgrades = feature('loadHubUpgrades');
const loadWeaponXp = feature('loadWeaponXp');
const loadInventory = feature('loadInventory');
const loadRepair = feature('loadRepair');
const loadVendors = feature('loadVendors');
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
const craftingCompute = feature('craftingCompute');
const craftingFilter = feature('craftingFilter');
const craftingAddMissing = feature('craftingAddMissing');
const craftingAddAll = feature('craftingAddAll');
const pickSaveDir = feature('pickSaveDir');
const clearSaveDir = feature('clearSaveDir');
const saveSettings = feature('saveSettings');
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
const addMissingWeaponBuild = feature('addMissingWeaponBuild');
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
function closeMobileNav(returnFocus) {
  document.body.classList.remove('nav-open');
  document.getElementById('navToggle').setAttribute('aria-expanded', 'false');
  document.getElementById('main-content').removeAttribute('inert');
  document.querySelector('.safety-bar').removeAttribute('inert');
  document.getElementById('navBackdrop').hidden = true;
  if (returnFocus) document.getElementById('navToggle').focus();
}

function showPage(pageName) {
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
  if (pageName === 'repair') loadRepair();
  if (pageName === 'add-items') loadAddCatalog();
  if (pageName === 'rigs') loadRigs();
  if (pageName === 'settings') loadSettings();
  if (pageName === 'crafting') loadCrafting();
  if (pageName === 'backups') loadBackups();
  if (pageName === 'diagnostics') runDiagnostics();
}

document.querySelectorAll('.nav button').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
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
bind('weaponBuildSelect','change',()=>{sessionStorage.setItem('weaponBuildId',document.getElementById('weaponBuildSelect').value);renderWeaponBuild();});
bind('weaponFilter', 'change', renderWeaponXp);
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
bind('craftingProduct', 'change', craftingCompute);
bind('craftingSearch', 'input', debounce(craftingFilter, 120));
bind('craftingQty', 'input', craftingCompute);
bind('craftingAddMissingButton', 'click', craftingAddMissing);
bind('craftingAddAllButton', 'click', craftingAddAll);
for (const tab of document.querySelectorAll('.crafting-tab')) tab.addEventListener('click', () => setCraftingKind(tab.dataset.kind));
bind('pickSaveDirButton', 'click', pickSaveDir);
bind('clearSaveDirButton', 'click', clearSaveDir);
bind('saveSettingsButton', 'click', saveSettings);
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
  summary.setAttribute('aria-busy', 'true');
  status.textContent = 'Checking saves, tools, schema, and inventory round trip…';
  status.className = 'settings-msg';
  try {
    const data = await api('/diagnostics');
    const compatibility = data.compatibility || {};
    const files = compatibility.files || [];
    const tools = compatibility.tools || {};
    const inventory = data.inventoryRoundTrip || {};
    const running = Array.isArray(data.gameRunning) ? data.gameRunning.length > 0 : !!data.gameRunning;
    const reasons = compatibility.reasons || [];
    const gameVersion = data.gameVersion || {};
    const gvDetail = gameVersion.detected
      ? `Installed build ${esc(gameVersion.version)} (${esc(gameVersion.source === 'steam-buildid' ? 'Steam' : gameVersion.source === 'epic-manifest' ? 'Epic' : 'game binary')})${gameVersion.appId ? ` · app ${esc(gameVersion.appId)}` : ''}`
      : 'Installed game version could not be detected (set FW_GAME_EXE or FW_GAME_DIR if installed elsewhere).';
    const cards = [
      diagnosticCard('Game version', gameVersion.detected, gvDetail, !gameVersion.detected),
      diagnosticCard('Three save variants', files.length === 3 && files.every(file => file.exists), files.length === 3 && files.every(file => file.exists) ? 'Primary and both known-good variants found.' : 'One or more required save variants are missing.'),
      diagnosticCard('SQLite3MC', !!tools.sqlite3mc, tools.sqlite3mc ? 'Database shell is available.' : 'SQLite3MC executable is missing.'),
      diagnosticCard('uesave', !!tools.uesave, tools.uesave ? 'Structured GVAS tool is available.' : 'uesave is missing; inventory writes are disabled.'),
      diagnosticCard('Key and schema', !!compatibility.compatible, compatibility.compatible ? 'Database opened and required schema/rows were found.' : reasons.join(', ') || 'Compatibility failed.'),
      diagnosticCard('Inventory round trip', !!inventory.byteIdentical, inventory.byteIdentical ? `${inventory.bytes} bytes, ${inventory.inventoryEntries} entries, byte-identical.` : inventory.error || 'Round trip failed.'),
      diagnosticCard('Game process', !running, running ? 'Close The Forever Winter before any write.' : 'Game is closed.'),
      diagnosticCard('Write readiness', !!data.writeReady, data.writeReady ? 'Safety gates currently allow writes.' : 'One or more safety gates block writes.'),
      diagnosticCard('Session backup', !!(data.mutation && data.mutation.sessionBackupId), data.mutation && data.mutation.sessionBackupId ? data.mutation.sessionBackupId : 'Created automatically before the first write.', !(data.mutation && data.mutation.sessionBackupId)),
      diagnosticCard('Steam Cloud', false, data.steamCloudWarning, true)
    ];
    summary.innerHTML = cards.join('');
    details.innerHTML = `<dl class="diagnostic-details">
      <dt>Checked</dt><dd>${esc(new Date(data.checkedAt).toLocaleString())}</dd>
      <dt>Active save directory</dt><dd>${esc(data.activeSaveDir)}</dd>
      <dt>Schema fingerprint</dt><dd><code>${esc(compatibility.schemaFingerprint || 'Unavailable')}</code></dd>
      <dt>Inventory maps</dt><dd>${esc((inventory.maps || []).join(', ') || 'Unavailable')}</dd>
      <dt>Blocking reasons</dt><dd>${esc(reasons.join(', ') || 'None')}</dd>
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
  ['weapon-build-add', control => addMissingWeaponBuild(control.dataset.id, control)],
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
    else if (!setOperationFeedback(operationFeedbackFor(control), error.message, error.payload, 'error')) showNotice(error.message, 'Operation failed');
  } finally {
    if (isPendingCapable) control.classList.remove('is-pending');
  }
});

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
    const running = Array.isArray(status.gameRunning) ? status.gameRunning.length > 0 : !!status.gameRunning;
    setSafetyValue('safetyGame', running ? 'Running — close game' : 'Closed', running ? 'bad' : 'good');
    setSafetyValue('safetyCompatibility', status.compatibility && status.compatibility.compatible ? 'Compatible' : 'Writes blocked', status.compatibility && status.compatibility.compatible ? 'good' : 'bad');
    setSafetyValue('safetyWrites', status.writeReady ? 'Enabled' : `Disabled${status.blockingReasons && status.blockingReasons.length ? `: ${status.blockingReasons.join(', ')}` : ''}`, status.writeReady ? 'good' : 'bad');
    const backupId = status.mutation && status.mutation.sessionBackupId;
    setSafetyValue('safetyBackup', backupId || 'Pending first write', backupId ? 'good' : 'warn');
    setSafetyValue('safetySave', status.activeSaveDir || 'Unknown', '');
    const gameStatus = document.getElementById('gameStatus');
    gameStatus.textContent = running ? 'Game running — writes disabled' : 'Game closed';
    gameStatus.dataset.state = running ? 'running' : 'closed';
  } catch (error) {
    for (const id of ['safetyGame', 'safetyCompatibility', 'safetyWrites', 'safetyBackup', 'safetySave']) setSafetyValue(id, 'Status unavailable', 'bad');
    const gameStatus = document.getElementById('gameStatus');
    gameStatus.textContent = 'Safety status unavailable';
    gameStatus.dataset.state = 'checking';
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
    title,
    result.backupId ? `Backup: ${result.backupId}` : null,
    result.safetyBackupId ? `Safety backup: ${result.safetyBackupId}` : null,
    result.restoredFiles ? `Restored: ${result.restoredFiles.join(', ')}` : null,
    result.afterHash ? `Installed SHA-256: ${result.afterHash}` : null
  ].filter(Boolean);
  receipt.className = 'backup-receipt';
  receipt.textContent = details.join(' · ');
}

async function loadBackups() {
  const list = document.getElementById('backupList');
  setBackupBusy(true, 'Loading backups…');
  try {
    const [backups, status] = await Promise.all([api('/backups'), api('/status')]);
    const sessionId = status.mutation && status.mutation.sessionBackupId;
    if (!backups.length) {
      list.innerHTML = '<p class="char-hint">No application backups found.</p>';
    } else {
      list.innerHTML = backups.map(backup => {
        const id = esc(backup.name);
        const created = backup.created ? new Date(backup.created).toLocaleString() : 'Unknown time';
        const active = backup.name === sessionId;
        return `<article class="backup-row ${backup.manifestValid ? '' : 'invalid'}">
          <div class="backup-head">
            <strong class="backup-id">${id}</strong>
            <span class="backup-meta">${esc(created)}</span>
          </div>
          <div class="backup-meta">Label: ${esc(backup.label || 'legacy/unknown')} · App: ${esc(backup.appVersion || 'unknown')} · Manifest: ${backup.manifestValid ? 'verified format' : 'missing or invalid'}${active ? ' · Active session backup' : ''}</div>
          <div class="backup-actions">
            <button type="button" data-backup-action="restore" data-backup-id="${id}" ${backup.manifestValid && status.writeReady ? '' : 'disabled'}>Restore primary</button>
            <button type="button" class="danger-btn" data-backup-action="delete" data-backup-id="${id}" ${active ? 'disabled' : ''}>Delete permanently</button>
          </div>
        </article>`;
      }).join('');
    }
    setBackupBusy(false, status.gameRunning ? 'Writes are disabled while the game is running.' : `${backups.length} backup${backups.length === 1 ? '' : 's'} found.`);
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

expose({ showPage, closeMobileNav, runDiagnostics, refreshSafetyStatus, setSafetyValue, loadBackups, openAcknowledgements });

