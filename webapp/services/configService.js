// configService.js
// Holds the optional save-directory override. Database keys are deliberately
// excluded from settings and are loaded only from the release/key resource.

const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const saveDirContext = new AsyncLocalStorage();

const DEFAULT_SAVE_DIR = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'), 'ForeverWinter', 'Saved', 'SaveGames');
const DEFAULT_KEY_FILE = process.env.FW_DB_KEY_FILE || path.resolve(__dirname, '..', '..', 'fwinter-db-key.txt');
// File name is intentionally not a .txt so it is not accidentally committed.
const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'settings.json');

// In-memory overrides; loaded once at boot from SETTINGS_FILE.
let overrides = { saveDir: null };

function sanitizeSettingsObject(parsed) {
  return { saveDir: parsed && typeof parsed.saveDir === 'string' ? parsed.saveDir : null };
}

function load() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    overrides = sanitizeSettingsObject(parsed);
    if (Object.hasOwn(parsed, 'dbKey')) persist();
  } catch {
    overrides = { saveDir: null };
  }
  return overrides;
}

function persist() {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Never echo the key back into logs; just write it to the (local) file.
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
    saveDir: overrides.saveDir
  }, null, 2), { mode: 0o600 });
}

function getOverrides() {
  return { saveDir: overrides.saveDir };
}

function getDefaultSaveDir() {
  return DEFAULT_SAVE_DIR;
}

function getDefaultKeyFile() {
  return DEFAULT_KEY_FILE;
}

// Returns the active save directory: user override if set, else built-in default.
function getSaveDir() {
  return saveDirContext.getStore()?.saveDir || overrides.saveDir || DEFAULT_SAVE_DIR;
}

function withSaveDir(saveDir, callback) {
  return saveDirContext.run({ saveDir }, callback);
}

// Returns the active DB key ONLY if the user overrode it. Returns null when the
// caller should fall back to the PowerShell key file (the default loader).
function setOverrides({ saveDir = null } = {}) {
  if (saveDir) {
    let stat;
    try {
      stat = fs.statSync(saveDir);
    } catch {
      throw new Error(`Save directory not found: ${saveDir}`);
    }
    if (!stat.isDirectory()) throw new Error(`Not a directory: ${saveDir}`);
    const hasDat = fs.readdirSync(saveDir).some(f => f.toLowerCase().endsWith('.dat'));
    if (!hasDat) throw new Error(`No .dat save files found in: ${saveDir}`);
  }
  overrides.saveDir = saveDir || null;
  persist();
  return getOverrides();
}

module.exports = {
  DEFAULT_SAVE_DIR,
  DEFAULT_KEY_FILE,
  load,
  getOverrides,
  getDefaultSaveDir,
  getDefaultKeyFile,
  getSaveDir,
  withSaveDir,
  setOverrides,
  sanitizeSettingsObject
};
