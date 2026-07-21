'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeOutput } = require('../utils/validation');
const { isGameRunning } = require('../utils/processCheck');

// The DB key is secret: it must never appear in shell stdout/stderr that could
// be surfaced in logs or error messages. sanitizeOutput redacts it.
test('sanitizeOutput redacts the key from stdout and stderr text', () => {
  const key = 'super-secret-db-key-0123456789';
  const mixed = `PRAGMA key = '${key}';\nintegrity_check ok\nerror near ${key}: syntax`;
  const clean = sanitizeOutput(mixed, key);
  assert.equal(clean.includes(key), false);
  assert.ok(clean.includes('***REDACTED***'));
  assert.ok(clean.includes('integrity_check ok'));
});

test('sanitizeOutput is a no-op when no key is supplied', () => {
  const text = "plain output with no secret";
  assert.equal(sanitizeOutput(text, ''), text);
  assert.equal(sanitizeOutput(text, null), text);
});

test('sanitizeOutput escapes regex-special characters in the key', () => {
  const key = 'key$.*+?()[]\\';
  const out = sanitizeOutput(`value=${key} end`, key);
  assert.equal(out.includes(key), false);
  assert.ok(out.includes('***REDACTED***'));
});

test('sanitizeOutput handles missing text gracefully', () => {
  assert.equal(sanitizeOutput('', 'k'), '');
  assert.equal(sanitizeOutput(null, 'k'), '');
});

// isGameRunning shells out to PowerShell to detect the live game process.
test('isGameRunning returns false when no game process is present', async () => {
  const result = await isGameRunning();
  assert.equal(result, false);
});

test('isGameRunning returns an array of process names when the game is detected', async () => {
  // We cannot force the real game to run in CI, but the contract is:
  // empty/whitespace stdout -> false; non-empty -> array of names.
  const fakeExec = async () => ({ stdout: 'ForeverWinter\nForeverWinter-Win64-Shipping\n', stderr: '' });
  const result = await isGameRunning(fakeExec);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 2);
  assert.deepEqual(result, ['ForeverWinter', 'ForeverWinter-Win64-Shipping']);
});

test('isGameRunning treats a spawn error as not-running', async () => {
  const fakeExec = async () => { throw new Error('boom'); };
  assert.equal(await isGameRunning(fakeExec), false);
});
