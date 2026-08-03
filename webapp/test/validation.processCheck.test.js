'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeOutput, sqliteStringLiteral } = require('../utils/validation');
const { getGameProcessState, isGameRunning } = require('../utils/processCheck');

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

test('SQLite literals double quotes and reject control-character injection', () => {
  assert.equal(sqliteStringLiteral("abc'; DROP TABLE Saves;--"), "'abc''; DROP TABLE Saves;--'");
  assert.throws(() => sqliteStringLiteral('abc\n.quit'), error => error.status === 400);
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

// A blocked PowerShell profile prints several hundred bytes of complaint to stderr on every
// invocation. It must not overrun the buffer, because this check fails closed and would then
// block every write with 'game-process-unknown'.
test('process enumeration ignores the profile and survives stderr noise', async () => {
  let received;
  const fakeExec = async (command, options) => { received = { command, options }; return { stdout: '', stderr: 'x'.repeat(64 * 1024) }; };
  const state = await getGameProcessState(fakeExec);
  assert.match(received.command, /-NoProfile\b/);
  assert.ok(received.options.maxBuffer > 64 * 1024);
  assert.deepEqual(state, { known: true, running: false, processes: [], error: null });
});

test('structured process state fails closed when process enumeration fails', async () => {
  const state = await getGameProcessState(async () => { throw new Error('access denied'); });
  assert.deepEqual(state.processes, []);
  assert.equal(state.known, false);
  assert.equal(state.running, null);
  assert.match(state.error, /access denied/);
});
