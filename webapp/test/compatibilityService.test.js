const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_TABLES, evaluateGameVersion, VERIFIED_STEAM_BUILD } = require('../services/compatibilityService');

test('compatibility gate names every table required by mutations', () => {
  for (const name of ['BinaryData','Characters','Currencies','Names','ScopedCounterValues']) assert.ok(REQUIRED_TABLES.includes(name));
  assert.equal(new Set(REQUIRED_TABLES).size, REQUIRED_TABLES.length);
});

test('game build gate accepts only verified Steam/semantic builds unless explicitly overridden', () => {
  assert.equal(evaluateGameVersion({ detected:true, source:'steam-buildid', version:VERIFIED_STEAM_BUILD }, false).verified, true);
  assert.equal(evaluateGameVersion({ detected:true, source:'steam-buildid', version:'wrong' }, false).verified, false);
  assert.equal(evaluateGameVersion({ detected:false, version:null }, true).overridden, true);
});
