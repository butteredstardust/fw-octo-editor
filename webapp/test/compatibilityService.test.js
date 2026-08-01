const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_TABLES, evaluateGameVersion, gameVersionWarning, VERIFIED_STEAM_BUILD } = require('../services/compatibilityService');

test('compatibility gate names every table required by mutations', () => {
  for (const name of ['BinaryData','Characters','Currencies','Names','ScopedCounterValues']) assert.ok(REQUIRED_TABLES.includes(name));
  assert.equal(new Set(REQUIRED_TABLES).size, REQUIRED_TABLES.length);
});

test('unverified game builds are advisory warnings, not compatibility failures', () => {
  assert.equal(evaluateGameVersion({ detected:true, source:'steam-buildid', version:VERIFIED_STEAM_BUILD }, false).verified, true);
  assert.equal(gameVersionWarning(evaluateGameVersion({ detected:true, source:'steam-buildid', version:'wrong' })), 'unverified-game-version');
  assert.equal(gameVersionWarning(evaluateGameVersion({ detected:false, version:null })), 'unknown-game-version');
  assert.equal(gameVersionWarning(evaluateGameVersion({ detected:true, source:'steam-buildid', version:VERIFIED_STEAM_BUILD })), null);
});
