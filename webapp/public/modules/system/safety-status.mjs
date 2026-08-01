import { FW } from '../runtime.mjs';
import { isGameRunning } from './status-utils.mjs';
import { updatePreflightPanel } from './diagnostics.mjs';

const { api } = FW;

export function setSafetyValue(id, text, state) {
  const element = document.getElementById(id);
  element.textContent = text;
  element.className = `safety-value${state ? ` ${state}` : ''}`;
}

export async function refreshSafetyStatus() {
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
    const gameBuild = status.compatibility && status.compatibility.gameBuild;
    const detectedVersion = gameBuild && gameBuild.detected && gameBuild.detected.version;
    setSafetyValue('safetyGameVersion', detectedVersion || 'Not detected', gameBuild && !gameBuild.verified ? 'warn' : '');
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
