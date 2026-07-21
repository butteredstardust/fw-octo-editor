const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../services/configService');

test('withSaveDir isolates a staged path and restores the live path', async () => {
  const live = config.getSaveDir();
  await config.withSaveDir('C:\\staged unicode șț', async () => {
    assert.equal(config.getSaveDir(), 'C:\\staged unicode șț');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(config.getSaveDir(), 'C:\\staged unicode șț');
  });
  assert.equal(config.getSaveDir(), live);
});

test('parallel async contexts do not leak staged paths', async () => {
  const seen = await Promise.all(['A', 'B'].map(name => config.withSaveDir(name, async () => {
    await new Promise(resolve => setImmediate(resolve));
    return config.getSaveDir();
  })));
  assert.deepEqual(seen, ['A', 'B']);
});

test('a legacy plaintext dbKey field never survives sanitization', () => {
  const sanitized = config.sanitizeSettingsObject({ saveDir: 'C:\\Saves', dbKey: 'must-not-survive' });
  assert.deepEqual(sanitized, { saveDir: 'C:\\Saves', dbKeyOverride: null });
  assert.equal(JSON.stringify(sanitized).includes('must-not-survive'), false);
});

test('a malformed dbKeyOverride (wrong shape, not the real encrypted resource shape) is dropped', () => {
  assert.deepEqual(config.sanitizeSettingsObject({ dbKeyOverride: 'plaintext-string' }), { saveDir: null, dbKeyOverride: null });
  assert.deepEqual(config.sanitizeSettingsObject({ dbKeyOverride: { v: 1, salt: 'aa' } }), { saveDir: null, dbKeyOverride: null });
  assert.deepEqual(config.sanitizeSettingsObject({}), { saveDir: null, dbKeyOverride: null });
});

test('a well-formed encrypted dbKeyOverride survives sanitization unchanged', () => {
  const keyProtect = require('../utils/keyProtect');
  const encrypted = keyProtect.encryptWithSecret('12345678901234567890123456789012', 'some-secret');
  const sanitized = config.sanitizeSettingsObject({ saveDir: null, dbKeyOverride: encrypted });
  assert.deepEqual(sanitized.dbKeyOverride, encrypted);
});

test('setOverrides({dbKey}) round-trips through encryption: getActiveKeyOverride returns the plaintext, but it is never stored as plaintext', async () => {
  const key32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  const before = config.getOverrides();
  try {
    const result = config.setOverrides({ dbKey: key32 });
    assert.equal(result.hasCustomKey, true);
    assert.equal(config.getActiveKeyOverride(), key32);

    const settingsPath = path.join(__dirname, '..', 'config', 'settings.json');
    const onDisk = fs.readFileSync(settingsPath, 'utf8');
    assert.equal(onDisk.includes(key32), false);

    // getOverrides() must never expose key material, only the boolean flag.
    const overrides = config.getOverrides();
    assert.equal(JSON.stringify(overrides).includes(key32), false);
    assert.deepEqual(Object.keys(overrides).sort(), ['hasCustomKey', 'saveDir']);
  } finally {
    config.setOverrides({ saveDir: before.saveDir, dbKey: null });
  }
});

test('setOverrides({dbKey: null}) clears an existing override', () => {
  try {
    config.setOverrides({ dbKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' });
    assert.equal(config.getOverrides().hasCustomKey, true);
    const cleared = config.setOverrides({ dbKey: null });
    assert.equal(cleared.hasCustomKey, false);
    assert.equal(config.getActiveKeyOverride(), null);
  } finally {
    config.setOverrides({ dbKey: null });
  }
});

test('setOverrides rejects a dbKey that is not exactly 32 characters', () => {
  assert.throws(() => config.setOverrides({ dbKey: 'tooshort' }), /32 characters/);
});

test('setOverrides({}) (dbKey omitted) leaves an existing key override untouched', () => {
  try {
    config.setOverrides({ dbKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' });
    config.setOverrides({ saveDir: null });
    assert.equal(config.getOverrides().hasCustomKey, true);
  } finally {
    config.setOverrides({ dbKey: null });
  }
});

test('default save path is derived from the current user environment', () => {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  assert.equal(config.getDefaultSaveDir(), path.join(localAppData, 'ForeverWinter', 'Saved', 'SaveGames'));
  assert.match(config.getDefaultSaveDir(), /ForeverWinter[\\/]Saved[\\/]SaveGames$/);
});
