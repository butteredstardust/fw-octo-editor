const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function getGameProcessState(run = execAsync) {
  try {
    const result = await run('powershell -Command "Get-Process -Name ForeverWinter* -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName"', {
      encoding: 'utf8',
      maxBuffer: 4096
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
