'use strict';

// Hidden, single-instance, health-polling launcher for the Forever Winter
// save editor. Runs the Node server detached with no console window, waits for
// /api/health, then opens the default browser. Guarantees only one editor
// instance owns the loopback server by holding a PID lockfile.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const { version: APP_VERSION } = require('../package.json');

const APP_DIR = path.resolve(__dirname, '..');
const NODE_EXE = path.join(__dirname, 'node.exe');
const SERVER_JS = path.join(APP_DIR, 'server.js');
const TOOLS_DIR = path.join(APP_DIR, 'tools');
const KEY_RESOURCE_FILE = path.join(APP_DIR, 'resources', 'dbkey.resource.json');

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const HEALTH_URL = `${BASE_URL}/api/health`;
const APP_ID = 'forever-winter-save-editor';

const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const APP_DATA_DIR = path.join(LOCALAPPDATA, 'ForeverWinter');
const LOCK_FILE = path.join(APP_DATA_DIR, 'fwinter-editor.lock');

const MAX_WAIT_MS = 30000;
const POLL_INTERVAL_MS = 500;

function readPid() {
  try {
    const raw = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeLock(pid) {
  if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  fs.writeFileSync(LOCK_FILE, String(pid), { mode: 0o600 });
}

function clearLock(expectedPid = null) {
  try {
    const current = readPid();
    if (expectedPid === null || current === expectedPid || current === null) fs.rmSync(LOCK_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { if (raw.length < 64 * 1024) raw += chunk; });
      res.on('end', () => {
        try {
          const body = JSON.parse(raw);
          const identified = body.appId === APP_ID && typeof body.appVersion === 'string';
          const owned = identified && body.appVersion === APP_VERSION;
          resolve({ reachable: true, identified, owned, compatible: owned && body.ok === true, statusCode: res.statusCode, appVersion: identified ? body.appVersion : null });
        } catch {
          resolve({ reachable: true, owned: false, compatible: false, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', () => resolve({ reachable: false, owned: false, compatible: false }));
    req.setTimeout(1000, () => { req.destroy(); resolve({ reachable: false, owned: false, compatible: false }); });
  });
}

function openBrowser(url = BASE_URL) {
  const start = spawn('cmd', ['/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' });
  start.unref();
}

function waitForHealth() {
  const deadline = Date.now() + MAX_WAIT_MS;
  return new Promise((resolve) => {
    const tick = async () => {
      const health = await healthCheck();
      if (health.reachable) return resolve(health);
      if (Date.now() >= deadline) return resolve(health);
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
  });
}

function startServer() {
  const child = spawn(NODE_EXE, [SERVER_JS], {
    cwd: APP_DIR,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      FW_SQLITE_BIN: path.join(TOOLS_DIR, 'sqlite3mc_shell_x64.exe'),
      GVAS_UESAVE_BIN: path.join(TOOLS_DIR, 'uesave.exe'),
      FW_DB_KEY_RESOURCE: KEY_RESOURCE_FILE,
      PORT: String(PORT)
    }
  });
  child.unref();
  return child.pid;
}

function getProcessInfo(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || process.platform !== 'win32') return null;
  try {
    const script = [`$p=Get-CimInstance Win32_Process -Filter "ProcessId=${String(pid)}" -ErrorAction Stop`, '$p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress'].join('; ');
    return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 5000 }));
  } catch {
    return null;
  }
}

function samePath(left, right) {
  return typeof left === 'string' && path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function isInstalledServerProcess(pid, info = getProcessInfo(pid)) {
  if (!info || Number(info.ProcessId) !== pid || !samePath(info.ExecutablePath, NODE_EXE)) return false;
  const args = String(info.CommandLine || '').match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const unquote = value => value.replace(/^"|"$/g, '');
  return args.length >= 2 && samePath(unquote(args[0]), NODE_EXE) && samePath(unquote(args[1]), SERVER_JS);
}

function stopServer() {
  const pid = readPid();
  if (!pid || !pidAlive(pid)) {
    clearLock(pid);
    return 0;
  }
  if (!isInstalledServerProcess(pid)) {
    console.error('Refusing to stop a process that does not match this installation.');
    return 4;
  }
  try {
    process.kill(pid);
    const waitArray = new Int32Array(new SharedArrayBuffer(4));
    const deadline = Date.now() + 5000;
    while (pidAlive(pid) && Date.now() < deadline) Atomics.wait(waitArray, 0, 0, 100);
    if (!pidAlive(pid)) {
      clearLock(pid);
      return 0;
    }
    console.error('The installed editor server did not exit in time.');
    return 4;
  } catch {
    console.error('The installed editor server could not be stopped.');
    return 4;
  }
}

async function main() {
  if (process.argv.slice(2).includes('--stop')) return stopServer();

  const lockPid = readPid();
  const initialHealth = await healthCheck();
  if (initialHealth.reachable && !initialHealth.owned) {
    const detail = initialHealth.identified ? `a different editor version (${initialHealth.appVersion})` : 'another application';
    console.error(`Port ${PORT} is occupied by ${detail}.`);
    return 3;
  }
  const lockMatches = !!(lockPid && pidAlive(lockPid) && isInstalledServerProcess(lockPid));
  if (lockPid && !lockMatches && !initialHealth.owned) clearLock(lockPid);
  const alreadyRunning = lockMatches || initialHealth.owned;

  if (alreadyRunning) {
    if (lockPid && !pidAlive(lockPid)) clearLock(lockPid);
    const health = initialHealth.owned ? initialHealth : await waitForHealth();
    if (!health.reachable) {
      console.error('The editor process exists but its local service is unavailable.');
      return 2;
    }
    if (!health.owned) {
      console.error(`Port ${PORT} is occupied by another application.`);
      return 3;
    }
    openBrowser(health.compatible ? BASE_URL : `${BASE_URL}/#diagnostics`);
    return 0;
  }

  const pid = startServer();
  if (!pid) {
    console.error('Failed to start the editor server.');
    return 1;
  }
  writeLock(pid);
  const health = await waitForHealth();
  if (!health.reachable) {
    console.error('The editor server did not become ready in time.');
    return 2;
  }
  if (!health.owned) {
    console.error(`Port ${PORT} was claimed by another application.`);
    return 3;
  }
  openBrowser(health.compatible ? BASE_URL : `${BASE_URL}/#diagnostics`);
  return 0;
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { APP_ID, APP_VERSION, healthCheck, isInstalledServerProcess, main, samePath, stopServer };
