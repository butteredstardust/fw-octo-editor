const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadKey } = require('../utils/keyLoader');

test('key loader reads the quoted 32-character resource without PowerShell', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-key-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const resource = path.join(dir, 'release key șț.dat');
  const expected = '12345678901234567890123456789012';
  await fs.writeFile(resource, `placeholder '${expected}'`, 'utf8');
  assert.equal(await loadKey(resource), expected);
});

test('key loader rejects malformed resources without echoing their contents', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-key-bad-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const resource = path.join(dir, 'bad.dat');
  await fs.writeFile(resource, "'secret-that-must-not-appear'", 'utf8');
  await assert.rejects(() => loadKey(resource), error => !error.message.includes('secret-that-must-not-appear'));
});
