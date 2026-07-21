// configService.js
// Holds the optional save-directory override and an optional user-supplied DB
// key override. The key override is never stored in plaintext -- it is
// AES-256-GCM encrypted at rest with a per-install secret (see
// getOrCreateInstanceSecret / utils/keyProtect.js) and decrypted only in
// memory when needed.

const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const keyProtect = require('../utils/keyProtect');
const saveDirContext = new AsyncLocalStorage();

const DEFAULT_SAVE_DIR = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'), 'ForeverWinter', 'Saved', 'SaveGames');
const DEFAULT_KEY_FILE = process.env.FW_DB_KEY_FILE || path.resolve(__dirname, '..', '..', 'fwinter-db-key.txt');
const DEFAULT_KEY_RESOURCE_FILE = process.env.FW_DB_KEY_RESOURCE || path.join(__dirname, '..', 'resources', 'dbkey.resource.json');
// File name is intentionally not a .txt so it is not accidentally committed.
const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'settings.json');
const INSTANCE_SECRET_FILE = path.join(__dirname, '..', 'config', '.instance-secret');

// In-memory overrides; loaded once at boot from SETTINGS_FILE.
let overrides = { saveDir: null, dbKeyOverride: null };
let cachedInstanceSecret = null;

function getOrCreateInstanceSecret() {
  if (cachedInstanceSecret) return cachedInstanceSecret;
  try {
    cachedInstanceSecret = fs.readFileSync(INSTANCE_SECRET_FILE, 'utf8').trim();
    if (cachedInstanceSecret) return cachedInstanceSecret;
  } catch {
    // fall through to generation
  }
  cachedInstanceSecret = require('crypto').randomBytes(32).toString('hex');
  const dir = path.dirname(INSTANCE_SECRET_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(INSTANCE_SECRET_FILE, cachedInstanceSecret, { mode: 0o600 });
  return cachedInstanceSecret;
}

// Accepts only the exact encrypted-resource shape produced by keyProtect's
// encryptWithSecret(); anything else (a bare plaintext string, wrong shape)
// is dropped so a legacy/malformed value can never survive a settings round-trip.
function sanitizeSettingsObject(parsed) {
  const dbKeyOverride = parsed && keyProtect.isEncryptedResourceShape(parsed.dbKeyOverride) ? parsed.dbKeyOverride : null;
  return {
    saveDir: parsed && typeof parsed.saveDir === 'string' ? parsed.saveDir : null,
    dbKeyOverride
  };
}

function load() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    overrides = sanitizeSettingsObject(parsed);
    if (Object.hasOwn(parsed, 'dbKey')) persist();
  } catch {
    overrides = { saveDir: null, dbKeyOverride: null };
  }
  return overrides;
}

function persist() {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Never write plaintext key material; dbKeyOverride (if set) is already
  // AES-256-GCM ciphertext at this point.
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
    saveDir: overrides.saveDir,
    dbKeyOverride: overrides.dbKeyOverride
  }, null, 2), { mode: 0o600 });
}

function getOverrides() {
  return { saveDir: overrides.saveDir, hasCustomKey: !!overrides.dbKeyOverride };
}

// Returns the plaintext user-supplied key override, or null when none is set
// (the caller should fall back to the bundled default key).
function getActiveKeyOverride() {
  if (!overrides.dbKeyOverride) return null;
  return keyProtect.decryptWithSecret(overrides.dbKeyOverride, getOrCreateInstanceSecret());
}

function getDefaultSaveDir() {
  return DEFAULT_SAVE_DIR;
}

function getDefaultKeyFile() {
  return DEFAULT_KEY_FILE;
}

function getDefaultKeyResourceFile() {
  return DEFAULT_KEY_RESOURCE_FILE;
}

// Returns the active save directory: user override if set, else built-in default.
function getSaveDir() {
  return saveDirContext.getStore()?.saveDir || overrides.saveDir || DEFAULT_SAVE_DIR;
}

function withSaveDir(saveDir, callback) {
  return saveDirContext.run({ saveDir }, callback);
}

// Updates the save-directory override and/or the DB key override.
// dbKey: undefined leaves the existing override untouched; null (or '')
// clears it; a 32-character string encrypts and stores it (never plaintext).
function setOverrides({ saveDir = null, dbKey } = {}) {
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

  if (dbKey !== undefined) {
    if (dbKey === null || dbKey === '') {
      overrides.dbKeyOverride = null;
    } else {
      if (typeof dbKey !== 'string' || dbKey.length !== 32) {
        throw new Error('Database key must be exactly 32 characters');
      }
      overrides.dbKeyOverride = keyProtect.encryptWithSecret(dbKey, getOrCreateInstanceSecret());
    }
  }

  persist();
  return getOverrides();
}

module.exports = {
  DEFAULT_SAVE_DIR,
  DEFAULT_KEY_FILE,
  load,
  getOverrides,
  getActiveKeyOverride,
  getDefaultSaveDir,
  getDefaultKeyFile,
  getDefaultKeyResourceFile,
  getSaveDir,
  withSaveDir,
  setOverrides,
  sanitizeSettingsObject
};
