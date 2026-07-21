const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function isGameRunning(run = execAsync) {
  try {
    const result = await run('powershell -Command "Get-Process -Name ForeverWinter* -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName"', {
      encoding: 'utf8',
      maxBuffer: 4096
    });
    const names = result.stdout.split('\n').map(n => n.trim()).filter(Boolean);
    return names.length > 0 ? names : false;
  } catch {
    return false;
  }
}

module.exports = { isGameRunning };
