'use strict';

// Hidden, single-instance, health-polling launcher for the Forever Winter
// save editor. Runs the Node server detached with no console window, waits for
// /api/health, then opens the default browser. Guarantees only one editor
// instance owns the loopback server by holding a PID lockfile.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const APP_DIR = path.resolve(__dirname, '..');
const NODE_EXE = path.join(__dirname, 'node.exe');
const SERVER_JS = path.join(APP_DIR, 'server.js');
const TOOLS_DIR = path.join(APP_DIR, 'tools');
const KEY_RESOURCE_FILE = path.join(APP_DIR, 'resources', 'dbkey.resource.json');

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const HEALTH_URL = `${BASE_URL}/api/health`;

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

function clearLock() {
  try {
    if (readPid() === null) fs.rmSync(LOCK_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

function openBrowser() {
  const start = spawn('cmd', ['/c', 'start', '', BASE_URL], { windowsHide: true, stdio: 'ignore' });
  start.unref();
}

function waitForHealth() {
  const deadline = Date.now() + MAX_WAIT_MS;
  return new Promise((resolve) => {
    const tick = async () => {
      if (await healthCheck()) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
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

async function main() {
  const lockPid = readPid();
  const alreadyRunning = pidAlive(lockPid) || (await healthCheck());

  if (alreadyRunning) {
    if (lockPid && !pidAlive(lockPid)) clearLock();
    if (await waitForHealth()) openBrowser();
    return;
  }

  const pid = startServer();
  if (!pid) {
    console.error('Failed to start the editor server.');
    process.exit(1);
  }
  writeLock(pid);
  const ok = await waitForHealth();
  if (ok) openBrowser();
  else console.error('The editor server did not become ready in time.');
}

main();
