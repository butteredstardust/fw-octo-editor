import { FW } from '../runtime.mjs';
import { showPage } from './router.mjs';
import { runDiagnostics } from './diagnostics.mjs';

const { debounce, showToast, showNotice, setOperationFeedback, operationFeedbackFor } = FW;
const feature = name => (...args) => FW[name](...args);
const loadHubUpgrades = feature('loadHubUpgrades');
const filterHubUpgrades = feature('filterHubUpgrades');
const setCraftingKind = feature('setCraftingKind');
const renderPresets = feature('renderPresets');
const renderWeaponBuildSelector = feature('renderWeaponBuildSelector');
const addMissingForOwnedWeapons = feature('addMissingForOwnedWeapons');
const renderWeaponXp = feature('renderWeaponXp');
const setAllToReference = feature('setAllToReference');
const onInvCategoryChange = feature('onInvCategoryChange');
const resetInvExpansion = feature('resetInvExpansion');
const renderInventory = feature('renderInventory');
const clearInvFilters = feature('clearInvFilters');
const renderAddCatalog = feature('renderAddCatalog');
const resetAddExpansion = feature('resetAddExpansion');
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
bind('addSearch', 'input', debounce(() => { resetAddExpansion(); renderAddCatalog(); }, 120));
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
