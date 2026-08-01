const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildResource, parseKeyFromSource } = require('../scripts/build-key-resource');
const { loadKey } = require('../utils/keyLoader');

const SAMPLE_KEY = 'QWERTYUIOPASDFGHJKLZXCVBNM123456';

test('parseKeyFromSource extracts a quoted 32-character key', () => {
  assert.equal(parseKeyFromSource(`$key='${SAMPLE_KEY}';`), SAMPLE_KEY);
});

test('parseKeyFromSource accepts a bare key, as written by CI from its secret', () => {
  assert.equal(parseKeyFromSource(SAMPLE_KEY), SAMPLE_KEY);
  assert.equal(parseKeyFromSource(`\uFEFF${SAMPLE_KEY}\r\n`), SAMPLE_KEY);
});

test('parseKeyFromSource rejects a missing or wrong-length key', () => {
  assert.throws(() => parseKeyFromSource('$key=;'));
  assert.throws(() => parseKeyFromSource("$key='tooshort';"));
  assert.throws(() => parseKeyFromSource(''));
  assert.throws(() => parseKeyFromSource(SAMPLE_KEY.slice(0, 19)));
});

test('buildResource writes an encrypted resource that keyLoader can read back to the original key', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-key-build-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const sourcePath = path.join(dir, 'fwinter-db-key.txt');
  const destPath = path.join(dir, 'nested', 'dbkey.resource.json');
  await fs.writeFile(sourcePath, `$key='${SAMPLE_KEY}';`, 'utf8');

  const written = buildResource(sourcePath, destPath);
  assert.equal(written, destPath);

  const raw = await fs.readFile(destPath, 'utf8');
  assert.equal(raw.includes(SAMPLE_KEY), false);

  assert.equal(await loadKey(destPath, path.join(dir, 'unused.txt')), SAMPLE_KEY);
});
