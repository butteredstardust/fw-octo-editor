import { FW } from '../runtime.mjs';
import { isGameRunning, formatTimestamp } from './status-utils.mjs';

const { api, esc, showLoading } = FW;

function diagnosticCard(label, passed, detail, warning = false) {
  const state = warning ? 'warn' : passed ? 'pass' : 'fail';
  const word = warning ? 'REVIEW' : passed ? 'PASS' : 'BLOCKED';
  return `<div class="diagnostic-check ${state}"><strong>${word} · ${esc(label)}</strong><span>${esc(detail)}</span></div>`;
}

export async function runDiagnostics() {
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
    const gameBuild = compatibility.gameBuild || { verified: !!gameVersion.detected };
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
      { label: 'Game version', passed: !!gameBuild.verified, detail: gameBuild.verified ? `${gvDetail} This build is verified.` : `${gvDetail} This build has not been verified; edits remain available because the save, schema, and tools passed their safety checks.`, warning: !gameBuild.verified },
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
  const issues = [...(status.blockingReasons || []), ...((status.compatibility && status.compatibility.warnings) || [])].map(preflightReasonText);
  if (status.compatibility && status.compatibility.tools && status.compatibility.tools.uesave === false) {
    issues.push('The uesave tool used for inventory edits is missing. It is expected at tools/uesave-src/target/release/uesave.exe, or the location set by the GVAS_UESAVE_BIN environment variable. Inventory edits are disabled until it is restored.');
  }
  return issues;
}
let preflightDismissedSignature = null;
let preflightCurrentSignature = null;
export function updatePreflightPanel(status) {
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
