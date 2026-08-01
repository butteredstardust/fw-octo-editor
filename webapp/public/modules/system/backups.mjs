import { FW } from '../runtime.mjs';
import { isGameRunning, formatTimestamp } from './status-utils.mjs';
import { createDialogController } from '../dialog-ui.mjs';

const { api, esc, actionIcon, showLoading, technicalDetails, emptyStateHtml, errorDetailHtml } = FW;

// ---- Backups -------------------------------------------------------------
let backupDialogAction = null;
let backupDialogFallbackFocus = null;
const backupDialog = document.getElementById('backupConfirmDialog');
const backupDialogController = createDialogController(backupDialog, {
  initialFocus: () => document.getElementById('backupDialogInput'),
  fallbackFocus: () => backupDialogFallbackFocus?.() || document.getElementById('createBackupButton')
});

function setBackupDialogBusy(busy) {
  document.getElementById('backupDialogConfirm').disabled = busy;
  document.getElementById('backupDialogCancel').disabled = busy;
  backupDialogController.setBusy(busy);
}

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

export async function loadBackups() {
  const list = document.getElementById('backupList');
  setBackupBusy(true, 'Loading backups…');
  // Match the skeleton affordance every other list page uses, rather than
  // leaving the previous list on screen behind a one-line status message.
  showLoading(list, 3, 'Loading backups');
  try {
    const [backups, status] = await Promise.all([api('/backups'), api('/status')]);
    const sessionId = status.mutation && status.mutation.sessionBackupId;
    if (!backups.length) {
      list.innerHTML = emptyStateHtml('No application backups found');
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
  if (backupDialog.open) return false;
  backupDialogAction = action;
  const backupAction = trigger?.dataset.backupAction;
  const backupId = trigger?.dataset.backupId;
  backupDialogFallbackFocus = () => {
    if (backupAction === 'restore') {
      return [...document.querySelectorAll('[data-backup-action="restore"]')].find(button => button.dataset.backupId === backupId) || null;
    }
    return document.getElementById('createBackupButton');
  };
  document.getElementById('backupDialogTitle').textContent = title;
  document.getElementById('backupDialogDescription').textContent = description;
  document.getElementById('backupDialogPhrase').textContent = phrase;
  document.getElementById('backupDialogInput').value = '';
  document.getElementById('backupDialogError').textContent = '';
  setBackupDialogBusy(false);
  return backupDialogController.open({ trigger });
}

backupDialog.addEventListener('close', () => {
  backupDialogAction = null;
  setBackupDialogBusy(false);
});

document.getElementById('backupDialogCancel').addEventListener('click', () => backupDialogController.close('cancel'));

document.getElementById('backupDialogConfirm').addEventListener('click', async () => {
  const input = document.getElementById('backupDialogInput');
  const expected = document.getElementById('backupDialogPhrase').textContent;
  const error = document.getElementById('backupDialogError');
  if (input.value !== expected) { error.textContent = 'The confirmation text does not match.'; input.focus(); return; }
  setBackupDialogBusy(true);
  error.textContent = 'Working…';
  try {
    const result = await backupDialogAction(input.value);
    showBackupReceipt(result.deleted ? 'Backup deleted.' : 'Primary save restored and verified.', result);
    await loadBackups();
    setBackupDialogBusy(false);
    backupDialogController.close('accept');
  } catch (operationError) {
    error.innerHTML = errorDetailHtml(operationError, 'This backup operation could not be completed.');
    input.focus({ preventScroll: true });
  } finally {
    if (backupDialog.open) setBackupDialogBusy(false);
  }
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
