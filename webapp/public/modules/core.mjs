import * as FWAPI from './api-client.mjs';
import {
  filterAndRank,
  cleanFallbackName,
  debounce,
  readIntegerInput,
  validateInteger
} from './ui-utils.mjs';
import { FW, expose } from './runtime.mjs';
import { esc, technicalDetails, setRenderedHtml, showLoading, setLocalBusy, filterSummaryHtml, operationFeedbackFor } from './dom.mjs';
import { itemTypeIcon, appIcon, actionIcon, itemCategoryPills } from './icons.mjs';
import { showToast, receiptHtml, userMessage, errorDetailHtml, loadErrorHtml, noMatchesHtml, setOperationFeedback, setInlineFeedback, openAppDialog, showNotice, confirmAction } from './feedback.mjs';
import {
  CHARACTER_META,
  PRESTIGE_CAP_LEVEL,
  PRESTIGE_MAX_FOR_WARNING,
  PRESTIGE_XP_CAP,
  prestigeBonus,
  HUB_UPGRADE_META,
  HUB_UPGRADE_RECIPES,
  HUB_UPGRADE_TAGS,
  HUB_CATEGORY_LABELS
} from './game-data.mjs';

const MUTATION_ACTIONS = new Set(['quest-ready','set-resource','add-resource','set-level','apply-prestige','set-character-xp','set-detail-level','detail-prestige','set-detail-xp','apply-skills','bulk-hub','toggle-upgrade','add-upgrade-materials','weapon-build-add-part','weapon-build-add-bundle','set-weapon-xp','update-item','set-quantity','add-item','add-rig','add-rig-kit','set-faction','toggle-trader','collect-repair','craft-add-missing','craft-add-all']);
const DIRECT_MUTATION_IDS = new Set(['setWeaponReferenceButton','weaponBuildAddOwned','saveSettingsButton','clearDbKeyButton','createBackupButton']);
let mutationClock = null;
let mutationStartedAt = 0;
const mutationDisabledState = new Map();
function mutationControls() {
  return [...document.querySelectorAll('button')].filter(button => MUTATION_ACTIONS.has(button.dataset.action) || DIRECT_MUTATION_IDS.has(button.id) || button.dataset.mutation === 'true');
}
function setGlobalMutationBusy(busy, detail) {
  const status = document.getElementById('mutationStatus');
  const elapsed = document.getElementById('mutationElapsed');
  if (busy) {
    mutationStartedAt = Date.now();
    document.body.dataset.mutationActive = 'true';
    document.body.setAttribute('aria-busy', 'true');
    document.getElementById('mutationStatusLabel').textContent = detail.label;
    status.hidden = false;
    for (const control of mutationControls()) { mutationDisabledState.set(control, control.disabled); control.disabled = true; }
    mutationClock = setInterval(() => { elapsed.textContent = `${Math.floor((Date.now() - mutationStartedAt) / 1000)}s`; }, 1000);
  } else {
    clearInterval(mutationClock); mutationClock = null;
    document.body.removeAttribute('data-mutation-active'); document.body.removeAttribute('aria-busy');
    for (const [control, wasDisabled] of mutationDisabledState) if (control.isConnected) control.disabled = wasDisabled;
    mutationDisabledState.clear(); status.hidden = true; elapsed.textContent = '0s';
  }
}
function refreshSafetyStatus(...args) { return FW.refreshSafetyStatus?.(...args); }
function setSafetyValue(...args) { return FW.setSafetyValue?.(...args); }
FWAPI.configure({
  onMutationStart: detail => setGlobalMutationBusy(true, detail),
  onMutationEnd: () => { setGlobalMutationBusy(false); refreshSafetyStatus(); },
  onConnectionChange: connected => { document.getElementById('connectionBanner').hidden = connected; }
});
async function api(path, options = {}) {
  const result = await FWAPI.request(path, options);
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET' && result && result.afterIntegrity && result.afterIntegrity.passed) {
    setSafetyValue('safetyLastEdit', new Date().toLocaleTimeString(), 'good');
  }
  return result;
}

expose({
  esc,
  filterAndRank,
  cleanFallbackName,
  debounce,
  readIntegerInput,
  validateInteger,
  technicalDetails,
  itemTypeIcon,
  appIcon,
  actionIcon,
  itemCategoryPills,
  showToast,
  receiptHtml,
  userMessage,
  errorDetailHtml,
  loadErrorHtml,
  noMatchesHtml,
  setOperationFeedback,
  setInlineFeedback,
  operationFeedbackFor,
  filterSummaryHtml,
  showLoading,
  setRenderedHtml,
  setLocalBusy,
  CHARACTER_META,
  PRESTIGE_CAP_LEVEL,
  PRESTIGE_MAX_FOR_WARNING,
  PRESTIGE_XP_CAP,
  prestigeBonus,
  HUB_UPGRADE_META,
  HUB_UPGRADE_RECIPES,
  HUB_UPGRADE_TAGS,
  HUB_CATEGORY_LABELS,
  api,
  openAppDialog,
  showNotice,
  confirmAction
});
