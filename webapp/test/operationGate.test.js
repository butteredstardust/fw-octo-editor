'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../services/operationGate');

test('exclusive gate remains locked until backend work settles', async () => {
  gate.resetForTests();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const first = gate.runExclusive('slow-backend', () => blocked);
  assert.equal(gate.getState().active, true);
  await assert.rejects(() => gate.runExclusive('overlap', async () => {}), error => error.status === 409);
  release();
  await first;
  assert.equal(gate.getState().active, false);
});
