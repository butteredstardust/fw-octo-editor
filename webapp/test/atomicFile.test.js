const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicInstall } = require('../utils/atomicFile');

const hashFile = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex').toUpperCase();
const lockError = code => Object.assign(new Error(`${code}: operation not permitted, rename`), { code });

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-atomic-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'staged.dat');
  const destination = path.join(root, 'live.dat');
  await fs.writeFile(source, 'staged-bytes');
  await fs.writeFile(destination, 'live-bytes');
  return { root, source, destination, options: { sleep: async () => {}, randomUUID: () => 'op-id' } };
}

test('a transient rename lock is retried until it clears', async t => {
  const { source, destination, options } = await fixture(t);
  let attempts = 0;
  const flakyFs = { ...fs, rename: async (from, to) => { if (++attempts < 3) throw lockError('EPERM'); return fs.rename(from, to); } };
  const expected = await hashFile(source);

  assert.equal(await atomicInstall(source, destination, expected, { ...options, fs: flakyFs }), expected);
  assert.equal(attempts, 3);
  assert.equal(await fs.readFile(destination, 'utf8'), 'staged-bytes');
});

test('a persistent rename lock fails with an actionable message and no partial install', async t => {
  const { root, source, destination, options } = await fixture(t);
  const lockedFs = { ...fs, rename: async () => { throw lockError('EPERM'); } };
  const before = await hashFile(destination);
  const staged = await hashFile(source);

  await assert.rejects(
    () => atomicInstall(source, destination, staged, { ...options, fs: lockedFs, retryDelaysMs: [0, 0] }),
    error => error.code === 'EPERM' && error.atomicInstalled === false
      && error.lockRetriesExhausted === 3 && /locked by another program/.test(error.message) && /Steam/.test(error.message)
  );
  assert.equal(await hashFile(destination), before);
  assert.deepEqual((await fs.readdir(root)).sort(), ['live.dat', 'staged.dat']);
});

test('a non-lock error is not retried', async t => {
  const { source, destination, options } = await fixture(t);
  let attempts = 0;
  const brokenFs = { ...fs, rename: async () => { attempts += 1; throw Object.assign(new Error('disk gone'), { code: 'EIO' }); } };
  const staged = await hashFile(source);

  await assert.rejects(() => atomicInstall(source, destination, staged, { ...options, fs: brokenFs }), /disk gone/);
  assert.equal(attempts, 1);
});
