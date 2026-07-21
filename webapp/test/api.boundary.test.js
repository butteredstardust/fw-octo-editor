'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
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
let realSaveDir;

test.before(async () => {
  tempSaveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-route-'));
  for (const name of ['primary.dat', 'primary.knowngood.dat', 'primary.knowngood.old.dat']) {
    await fs.writeFile(path.join(tempSaveDir, name), `placeholder-${name}`);
  }
  realSaveDir = config.getSaveDir();
  config.setOverrides({ saveDir: tempSaveDir });
  app = createTestApiServer({ dbKey: 'test-key-0123456789abcdef test-key' });
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise(resolve => httpServer.once('listening', resolve));
  baseURL = `http://127.0.0.1:${httpServer.address().port}`;
});

test.after(async () => {
  config.setOverrides({ saveDir: realSaveDir, dbKey: null });
  if (httpServer) {
    httpServer.closeAllConnections && httpServer.closeAllConnections();
    await new Promise(resolve => httpServer.close(resolve));
  }
  if (tempSaveDir) await fs.rm(tempSaveDir, { recursive: true, force: true });
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

test('settings endpoint accepts a syntactically valid dbKey when no live save exists to verify against', { timeout: 10000 }, async () => {
  const token = await sessionToken();
  const res = await call('POST', '/api/settings', { origin: baseURL, token, body: { dbKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.hasCustomKey, true);
  assert.equal(res.body.keySource, 'user-override');
  const settled = await call('GET', '/api/settings');
  assert.equal(settled.body.hasCustomKey, true);
  // Picked up dynamically by resolveKey() without a server restart.
  assert.equal(config.getActiveKeyOverride(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
  await call('POST', '/api/settings', { origin: baseURL, token, body: { dbKey: null } });
});

test('settings endpoint rejects a dbKey that fails to open the live save, and does not persist it', { timeout: 15000 }, async () => {
  const saveFileName = '0002524f464349c086ad775367f0b95a.dat';
  const savePath = path.join(tempSaveDir, saveFileName);
  await fs.writeFile(savePath, 'not a real sqlite database');
  try {
    const token = await sessionToken();
    const res = await call('POST', '/api/settings', { origin: baseURL, token, body: { dbKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /does not open/i);
    assert.equal((await call('GET', '/api/settings')).body.hasCustomKey, false);
    assert.equal(config.getActiveKeyOverride(), null);
  } finally {
    await fs.rm(savePath, { force: true });
  }
});

test('settings endpoint clears a custom key back to the bundled default', { timeout: 10000 }, async () => {
  const token = await sessionToken();
  await call('POST', '/api/settings', { origin: baseURL, token, body: { dbKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' } });
  const res = await call('POST', '/api/settings', { origin: baseURL, token, body: { dbKey: null } });
  assert.equal(res.status, 200);
  assert.equal(res.body.hasCustomKey, false);
  assert.equal(res.body.keySource, 'bundled-resource');
  assert.equal(config.getActiveKeyOverride(), null);
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
