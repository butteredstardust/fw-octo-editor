const test = require('node:test');
const assert = require('node:assert/strict');
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

test('legacy plaintext key fields are discarded from settings objects', () => {
  const sanitized = config.sanitizeSettingsObject({ saveDir: 'C:\\Saves', dbKey: 'must-not-survive' });
  assert.deepEqual(sanitized, { saveDir: 'C:\\Saves' });
  assert.equal(JSON.stringify(sanitized).includes('must-not-survive'), false);
});

test('default save path is derived from the current user environment', () => {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  assert.equal(config.getDefaultSaveDir(), path.join(localAppData, 'ForeverWinter', 'Saved', 'SaveGames'));
  assert.match(config.getDefaultSaveDir(), /ForeverWinter[\\/]Saved[\\/]SaveGames$/);
});
