const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadKey } = require('../utils/keyLoader');
const keyProtect = require('../utils/keyProtect');
const { buildResource } = require('../scripts/build-key-resource');

const SAMPLE_KEY = '12345678901234567890123456789012';

test('key loader decrypts a well-formed encrypted resource', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-key-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const resourcePath = path.join(dir, 'dbkey.resource.json');
  const resource = keyProtect.encryptWithSecret(SAMPLE_KEY, keyProtect.APP_RESOURCE_SECRET);
  resource.verifier = keyProtect.deriveVerifier(SAMPLE_KEY);
  await fs.writeFile(resourcePath, JSON.stringify(resource), 'utf8');
  assert.equal(await loadKey(resourcePath, path.join(dir, 'does-not-exist.txt')), SAMPLE_KEY);
});

test('key loader rejects a malformed resource without echoing any key material', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-key-bad-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const resourcePath = path.join(dir, 'dbkey.resource.json');
  await fs.writeFile(resourcePath, JSON.stringify({ ciphertext: 'not-a-real-secret-value' }), 'utf8');
  await assert.rejects(() => loadKey(resourcePath, path.join(dir, 'nope.txt')), error => !error.message.includes('not-a-real-secret-value'));
});

test('key loader rejects a resource that fails its own verifier (tamper/corruption)', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-key-tamper-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const resourcePath = path.join(dir, 'dbkey.resource.json');
  const resource = keyProtect.encryptWithSecret(SAMPLE_KEY, keyProtect.APP_RESOURCE_SECRET);
  resource.verifier = keyProtect.deriveVerifier('00000000000000000000000000000000');
  await fs.writeFile(resourcePath, JSON.stringify(resource), 'utf8');
  await assert.rejects(() => loadKey(resourcePath, path.join(dir, 'nope.txt')), /integrity verification/);
});

test('key loader auto-builds and persists a resource from a plaintext source when the resource is missing (dev convenience)', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-key-fallback-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const sourcePath = path.join(dir, 'fwinter-db-key.txt');
  const resourcePath = path.join(dir, 'dbkey.resource.json');
  await fs.writeFile(sourcePath, `$key='${SAMPLE_KEY}';`, 'utf8');
  assert.equal(fsSync.existsSync(resourcePath), false);
  assert.equal(await loadKey(resourcePath, sourcePath), SAMPLE_KEY);
  assert.equal(fsSync.existsSync(resourcePath), true);
  // Second call should use the now-persisted resource without needing the source.
  await fs.rm(sourcePath);
  assert.equal(await loadKey(resourcePath, sourcePath), SAMPLE_KEY);
});

test('resource takes precedence over the plaintext source when both exist', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-key-precedence-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const sourcePath = path.join(dir, 'fwinter-db-key.txt');
  const resourcePath = path.join(dir, 'dbkey.resource.json');
  const otherKey = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  await fs.writeFile(sourcePath, `$key='${SAMPLE_KEY}';`, 'utf8');
  buildResource(sourcePath, resourcePath);
  // Now change the source; the already-built resource should still win.
  await fs.writeFile(sourcePath, `$key='${otherKey}';`, 'utf8');
  assert.equal(await loadKey(resourcePath, sourcePath), SAMPLE_KEY);
});

test('key loader throws a clear error when neither resource nor source exists', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-key-missing-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await assert.rejects(() => loadKey(path.join(dir, 'no-resource.json'), path.join(dir, 'no-source.txt')));
});
