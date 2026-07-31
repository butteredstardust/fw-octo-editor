'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const testConfigDir = path.join(os.tmpdir(), `fw-api-config-${process.pid}`);
process.env.FW_SETTINGS_FILE = path.join(testConfigDir, 'settings.json');
process.env.FW_INSTANCE_SECRET_FILE = path.join(testConfigDir, '.instance-secret');
const { createTestApiServer } = require('./helpers/api-harness');
const config = require('../services/configService');

// Boots the REAL API router (routes/api.js) behind the same security middleware
// as server.js, against a temporary save directory, so we can assert
// HTTP-boundary behaviour without touching the live game save. Only routes that
// reject at the middleware layer (or are handler-light) are exercised, so the
// tests never invoke the real sqlite3mc/uesave toolchain on placeholder files.
let httpServer;
let app;
let baseURL;
let tempSaveDir;

test.before(async () => {
  tempSaveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-route-'));
  for (const name of ['primary.dat', 'primary.knowngood.dat', 'primary.knowngood.old.dat']) {
    await fs.writeFile(path.join(tempSaveDir, name), `placeholder-${name}`);
  }
  config.setOverrides({ saveDir: tempSaveDir });
  app = createTestApiServer({ dbKey: 'test-key-0123456789abcdef test-key' });
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise(resolve => httpServer.once('listening', resolve));
  baseURL = `http://127.0.0.1:${httpServer.address().port}`;
});

test.after(async () => {
  config.setOverrides({ saveDir: null, dbKey: null });
  if (httpServer) {
    httpServer.closeAllConnections && httpServer.closeAllConnections();
    await new Promise(resolve => httpServer.close(resolve));
  }
  if (tempSaveDir) await fs.rm(tempSaveDir, { recursive: true, force: true });
  await fs.rm(testConfigDir, { recursive: true, force: true });
});

async function call(method, urlPath, { token, origin, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-csrf-token'] = token;
  if (origin) headers.origin = origin;
  const res = await fetch(baseURL + urlPath, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, headers: res.headers, body: json };
}

async function sessionToken() {
  const res = await call('GET', '/api/session');
  return res.body.csrfToken;
}

test('security headers are applied to API responses', { timeout: 10000 }, async () => {
  const res = await call('GET', '/api/session');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
});

test('unknown API paths return JSON 404', { timeout: 10000 }, async () => {
  const res = await call('GET', '/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /application\/json/);
});

test('mutations reject a missing CSRF token', { timeout: 10000 }, async () => {
  const res = await call('PUT', '/api/currencies/WaterBarrels', { origin: baseURL, body: { amount: 5 } });
  assert.equal(res.status, 403);
  assert.match(res.body.error, /CSRF/i);
});

test('mutations reject a cross-origin request', { timeout: 10000 }, async () => {
  const token = await sessionToken();
  const res = await call('PUT', '/api/currencies/WaterBarrels', { origin: 'http://example.com', token, body: { amount: 5 } });
  assert.equal(res.status, 403);
  assert.match(res.body.error, /Cross-origin/i);
});

test('settings endpoint rejects a dbKey of the wrong length', { timeout: 10000 }, async () => {
  const token = await sessionToken();
  const res = await call('POST', '/api/settings', { origin: baseURL, token, body: { dbKey: 'should-not-be-accepted' } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /32 characters/i);
  assert.equal((await call('GET', '/api/settings')).body.hasCustomKey, false);
});

test('settings endpoint rejects a key change when the expected primary save is absent', { timeout: 10000 }, async () => {
  const token = await sessionToken();
  const res = await call('POST', '/api/settings', { origin: baseURL, token, body: { dbKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' } });
  assert.equal(res.status, 422);
  assert.match(res.body.error, /expected primary save/i);
  assert.equal((await call('GET', '/api/settings')).body.hasCustomKey, false);
});

test('settings endpoint rejects a dbKey that fails to open the live save, and does not persist it', { timeout: 15000 }, async () => {
  const saveFileName = '0002524f464349c086ad775367f0b95a.dat';
  const savePath = path.join(tempSaveDir, saveFileName);
  await fs.writeFile(savePath, 'not a real sqlite database');
  try {
    const token = await sessionToken();
    const res = await call('POST', '/api/settings', { origin: baseURL, token, body: { dbKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' } });
    assert.equal(res.status, 422);
    assert.match(res.body.error, /not compatible/i);
    assert.equal((await call('GET', '/api/settings')).body.hasCustomKey, false);
    assert.equal(config.getActiveKeyOverride(), null);
  } finally {
    await fs.rm(savePath, { force: true });
  }
});

test('settings endpoint does not clear a custom key to a missing default save', { timeout: 10000 }, async () => {
  const token = await sessionToken();
  config.setOverrides({ saveDir: tempSaveDir, dbKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' });
  const res = await call('POST', '/api/settings', { origin: baseURL, token, body: { saveDir: null, dbKey: null } });
  assert.equal(res.status, 422);
  assert.equal(config.getActiveKeyOverride(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
  config.setOverrides({ saveDir: tempSaveDir, dbKey: null });
});

test('weapon-xp batch rejects an empty items array', { timeout: 10000 }, async () => {
  const token = await sessionToken();
  const res = await call('POST', '/api/weapon-xp/batch', { origin: baseURL, token, body: { items: [] } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /items/i);
});

test('session endpoint issues a CSRF token', { timeout: 10000 }, async () => {
  const res = await call('GET', '/api/session');
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.csrfToken === 'string' && res.body.csrfToken.length > 0);
});

test('mutation gate rejects writes while the game is running', { timeout: 10000 }, async () => {
  const token = await sessionToken();
  app.setGameRunning(true);
  const res = await call('PUT', '/api/currencies/WaterBarrels', { origin: baseURL, token, body: { amount: 5 } });
  app.setGameRunning(false);
  assert.equal(res.status, 409);
  assert.match(res.body.error, /running/i);
});
