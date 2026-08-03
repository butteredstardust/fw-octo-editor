'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Shared fixture describing the REAL live save location and its known-good
// variants. Tests that need the live blob read it ONCE to seed an isolated
// temp copy; they never write back. Override via FW_LIVE_SAVE_DIR for portability.
//
// The game is Windows-only, so there is no meaningful default elsewhere: on
// other platforms the live save exists only if FW_LIVE_SAVE_DIR points at a
// copy. On Windows, derive the path from LOCALAPPDATA rather than assuming a
// particular user account.
const DEFAULT_LIVE_SAVE_DIR = process.platform === 'win32'
  ? path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'ForeverWinter', 'Saved', 'SaveGames'
    )
  : '';
const SAVE_FILES = [
  '0002524f464349c086ad775367f0b95a.dat',
  '0002524f464349c086ad775367f0b95a.knowngood.dat',
  '0002524f464349c086ad775367f0b95a.knowngood.old.dat'
];

const LIVE_SAVE_DIR = process.env.FW_LIVE_SAVE_DIR || DEFAULT_LIVE_SAVE_DIR;

// True only when every file the e2e harness copies is actually present. Suites
// that need the live save skip themselves when this is false, rather than
// failing with ENOENT on a machine that does not have the game installed.
function liveSaveAvailable() {
  if (!LIVE_SAVE_DIR) return false;
  return SAVE_FILES.every(name => fs.existsSync(path.join(LIVE_SAVE_DIR, name)));
}

module.exports = { LIVE_SAVE_DIR, SAVE_FILES, DEFAULT_LIVE_SAVE_DIR, liveSaveAvailable };
