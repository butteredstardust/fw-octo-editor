'use strict';

// Shared fixture describing the REAL live save location and its known-good
// variants. Tests that need the live blob read it ONCE to seed an isolated
// temp copy; they never write back. Override via FW_LIVE_SAVE_DIR for portability.
const DEFAULT_LIVE_SAVE_DIR = 'C:\\Users\\Admin\\AppData\\Local\\ForeverWinter\\Saved\\SaveGames';
const SAVE_FILES = [
  '0002524f464349c086ad775367f0b95a.dat',
  '0002524f464349c086ad775367f0b95a.knowngood.dat',
  '0002524f464349c086ad775367f0b95a.knowngood.old.dat'
];

const LIVE_SAVE_DIR = process.env.FW_LIVE_SAVE_DIR || DEFAULT_LIVE_SAVE_DIR;

module.exports = { LIVE_SAVE_DIR, SAVE_FILES, DEFAULT_LIVE_SAVE_DIR };
