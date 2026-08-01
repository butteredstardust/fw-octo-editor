import { receiptSummary } from './ui-utils.mjs';
import { esc, technicalDetails } from './dom.mjs';
import { actionIcon } from './icons.mjs';
import { createDialogController } from './dialog-ui.mjs';

// Caps the visible toast stack so a burst of failures (e.g. a batch
// operation that fails item-by-item) can't grow the region unbounded.
const MAX_STACKED_TOASTS = 5;

export function showToast(message, type = 'success') {
  const region = document.getElementById('toastRegion');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'toast-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss notification');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => toast.remove());
  toast.append(text, dismiss);
  region.appendChild(toast);
  while (region.children.length > MAX_STACKED_TOASTS) region.firstElementChild.remove();
  // Error toasts stay until the user dismisses them (or enough new toasts
  // push them out) -- they're often the only record of what went wrong, and
  // 4.2s isn't always enough time to read and act on it. Success toasts keep
  // the short auto-expiry so routine confirmations don't pile up.
  if (type !== 'error') setTimeout(() => toast.remove(), 4200);
  return toast;
}

export function receiptHtml(result) {
  const summary = receiptSummary(result);
  if (!summary) return '';
  const passed = !(result && ((result.afterIntegrity && result.afterIntegrity.passed === false) || (result.afterFk && result.afterFk.passed === false)));
  const label = passed ? 'Change verified' : 'Verification issue — details';
  return `<details class="receipt"><summary>${esc(label)}</summary><div>${esc(summary)}</div></details>`;
}

// Plain-language sentences for the error categories a non-technical Nexus
// audience will actually hit. Raw backend text (SQL fragments, absolute
// tool/file paths) never reaches the user directly -- it's only ever tucked
// into the existing technical-details disclosure via errorDetailHtml() below.
const ERROR_MESSAGE_RULES = [
  [/game.*(is running|must be closed)|close.*the game|process.*running/i, 'The Forever Winter is still running. Close the game completely, then try again.'],
  [/mutation.*(already|in progress|active)|wait for the current/i, 'A change is already saving. Wait for it to finish, then try again.'],
  [/ENOENT|no such file|not found.*\.(exe|dll)|could not find.*(tool|binary|executable)|sqlite3mc|uesave/i, 'A required tool could not be found. Open Diagnostics to see which one and how to fix it.'],
  [/cipher|decrypt|PRAGMA key|wrong key|key.*(invalid|incorrect)|compatibility/i, 'The database key could not open this save. Check the key in Settings.'],
  [/save (directory|file).*(not found|missing)|no such (save|directory)|ENOTDIR/i, 'Your save could not be found. Check the save location in Settings.'],
  [/EACCES|EPERM|permission denied|access is denied/i, 'Permission was denied while saving. Close the game and make sure the save file isn’t read-only.'],
  [/ECONNREFUSED|ECONNRESET|NetworkError|Failed to fetch|fetch failed|network/i, 'Lost the connection to the editor. Reload the page and try again.'],
  [/integrity check failed|foreign key/i, 'A check after saving found a problem, so the change was not kept.']
];

// Maps an Error (or error-like object) to a plain-language sentence. Falls
// back to `fallback` for anything unrecognized rather than ever showing the
// raw technical string inline.
export function userMessage(error, fallback = 'Something went wrong completing that action.') {
  const raw = (error && (error.message || String(error))) || '';
  for (const [pattern, friendly] of ERROR_MESSAGE_RULES) {
    if (pattern.test(raw)) return friendly;
  }
  return fallback;
}

// Friendly sentence for inline display, with the raw technical detail (if
// any) tucked into the existing collapsed technical-details disclosure
// rather than shown inline.
export function errorDetailHtml(error, fallback) {
  const raw = (error && (error.message || String(error))) || '';
  const friendly = userMessage(error, fallback);
  return raw ? `${esc(friendly)}${technicalDetails(raw, 'Show technical details')}` : esc(friendly);
}

// Standard "could not load X" empty-state block, used whenever a page's
// initial fetch fails. Consolidates what were near-identical inline strings
// spread across every feature module into one place, so the wording (and
// the error's plain-language three-part shape) stays consistent everywhere.
export function loadErrorHtml(label, error) {
  const sentenceCase = label.charAt(0).toUpperCase() + label.slice(1);
  return `<div class="empty-state"><strong>Could not load ${esc(label)}</strong><br>${errorDetailHtml(error, sentenceCase + ' could not be read.')}</div>`;
}

const EMPTY_STATE_ROLES = new Set(['status', 'alert']);

// `actionHtml` is a trusted slot for locally generated controls. Dynamic
// title and hint copy is always escaped here.
export function emptyStateHtml(title, hint = '', { actionHtml = '', role = '' } = {}) {
  const roleAttr = EMPTY_STATE_ROLES.has(role) ? ` role="${role}"` : '';
  const hintHtml = hint ? `<p class="empty-state__hint">${esc(hint)}</p>` : '';
  const actionsHtml = actionHtml ? `<div class="empty-state__actions">${actionHtml}</div>` : '';
  return `<div class="empty-state"${roleAttr}><strong class="empty-state__title">${esc(title)}</strong>${hintHtml}${actionsHtml}</div>`;
}

// Standard "nothing matches the current search/filter" empty state, used by
// every searchable list page instead of restating slightly different
// "Try a different filter" wording per module.
export function noMatchesHtml(title, hint = 'Try a different search or filter.') {
  return emptyStateHtml(title, hint);
}

const INLINE_FEEDBACK_STATES = new Set(['info', 'pending', 'success', 'error']);

export function setInlineFeedback(target, {
  state = 'info',
  message = '',
  result = null,
  error = null,
  fallback = ''
} = {}) {
  const element = typeof target === 'string' ? document.getElementById(target) : target;
  if (!element) return false;
  const safeState = INLINE_FEEDBACK_STATES.has(state) ? state : 'info';
  element.className = `operation-inline${safeState === 'info' ? '' : ` ${safeState}`}`;
  const isError = safeState === 'error';
  element.setAttribute('role', isError ? 'alert' : 'status');
  element.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  const body = isError ? errorDetailHtml(error, fallback || message) : esc(message);
  element.innerHTML = `${body}${receiptHtml(result)}`;
  return true;
}

export function setOperationFeedback(target, message, result, state = 'success', error = null) {
  const element = typeof target === 'string' ? document.getElementById(target) : target;
  if (!element) return false;
  element.className = `operation-banner ${state}`;
  element.setAttribute('role', state === 'error' ? 'alert' : 'status');
  const rawDetail = error && (error.message || (typeof error === 'string' ? error : ''));
  const detail = rawDetail && rawDetail !== message ? technicalDetails(rawDetail, 'Show technical details') : '';
  element.innerHTML = `<strong>${esc(message)}</strong>${detail}${receiptHtml(result)}`;
  document.getElementById('appAnnouncements').textContent = message;
  return true;
}

let appDialogResolve = null;
const appDialog = document.getElementById('appDialog');
const appDialogController = createDialogController(appDialog, {
  initialFocus: () => document.getElementById('appDialogAccept')
});
function openAppDialog({ title, message, confirm = false, acceptLabel, tone = 'primary', icon }) {
  if (appDialog.open) return Promise.resolve(false);
  const trigger = document.activeElement;
  document.getElementById('appDialogTitle').textContent = title;
  document.getElementById('appDialogMessage').textContent = message;
  const cancel = document.getElementById('appDialogCancel');
  const accept = document.getElementById('appDialogAccept');
  cancel.hidden = !confirm;
  const label = acceptLabel || (confirm ? 'Confirm' : 'Close');
  const acceptIcon = icon || (confirm ? 'check' : 'close');
  accept.innerHTML = `${actionIcon(acceptIcon)}${esc(label)}`;
  accept.className = tone === 'danger' ? 'danger-btn' : tone === 'warning' ? 'btn-warn' : 'btn-primary';
  if (!appDialogController.open({ trigger })) return Promise.resolve(false);
  return new Promise(resolve => { appDialogResolve = resolve; });
}

export function showNotice(message, title = 'Result') {
  document.getElementById('appAnnouncements').textContent = message;
  return openAppDialog({ title, message });
}

export function confirmAction(message, { title = 'Confirm change', acceptLabel = 'Confirm', tone = 'primary', icon = 'check' } = {}) {
  return openAppDialog({ title, message, confirm: true, acceptLabel, tone, icon });
}

document.getElementById('appDialogAccept').addEventListener('click', () => appDialogController.close('accept'));
appDialog.addEventListener('close', event => {
  const accepted = event.target.returnValue === 'accept';
  if (appDialogResolve) appDialogResolve(accepted);
  appDialogResolve = null;
});

export { openAppDialog };
