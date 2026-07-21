const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_TABLES } = require('../services/compatibilityService');

test('compatibility gate names every table required by mutations', () => {
  for (const name of ['BinaryData','Characters','Currencies','Names','ScopedCounterValues']) assert.ok(REQUIRED_TABLES.includes(name));
  assert.equal(new Set(REQUIRED_TABLES).size, REQUIRED_TABLES.length);
});
