const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function getGameProcessState(run = execAsync) {
  try {
    // -NoProfile: a user profile that cannot be loaded (unsigned, blocked by execution
    // policy) writes its complaint to stderr. That noise used to overrun maxBuffer, and
    // since this check fails closed, it blocked every write with 'game-process-unknown'.
    const result = await run('powershell -NoProfile -Command "Get-Process -Name ForeverWinter* -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName"', {
      encoding: 'utf8',
      maxBuffer: 256 * 1024
    });
    const names = result.stdout.split('\n').map(n => n.trim()).filter(Boolean);
    return { known: true, running: names.length > 0, processes: names, error: null };
  } catch (error) {
    return { known: false, running: null, processes: [], error: `Unable to check game processes: ${error.message}` };
  }
}

async function isGameRunning(run = execAsync) {
  const state = await getGameProcessState(run);
  return state.known && state.running ? state.processes : false;
}

module.exports = { getGameProcessState, isGameRunning };
