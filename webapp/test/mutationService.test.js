const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createMutationService } = require('../services/mutationService');

const SAVE_FILES = ['primary.dat', 'primary.knowngood.dat', 'primary.knowngood.old.dat'];
const valid = () => ({ integrity: { passed: true, raw: 'ok' }, foreignKeys: { passed: true, errors: 0 } });
const hashFile = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex').toUpperCase();

async function harness(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-mutation-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const liveDir = path.join(root, 'live');
  const tempRoot = path.join(root, 'temp');
  await fs.mkdir(liveDir);
  await fs.mkdir(tempRoot);
  for (const [index, file] of SAVE_FILES.entries()) await fs.writeFile(path.join(liveDir, file), `live-${index}`);
  let activeDir = liveDir;
  let backupCalls = 0;
  const config = {
    getSaveDir: () => activeDir,
    withSaveDir: async (dir, callback) => { const previous = activeDir; activeDir = dir; try { return await callback(); } finally { activeDir = previous; } }
  };
  const backupService = {
    SAVE_FILES,
    hashFile,
    createBackup: async () => ({ id: `session-${++backupCalls}` })
  };
  const service = createMutationService({
    fs: overrides.fs || fs,
    config,
    backupService,
    tempRoot,
    randomUUID: () => 'operation-id',
    isGameRunning: overrides.isGameRunning || (async () => false),
    getGameProcessState: overrides.getGameProcessState,
    checkCompatibility: overrides.checkCompatibility || (async () => ({ compatible: true, reasons: [] })),
    validateDatabase: overrides.validateDatabase || (async () => valid())
  });
  const mutateStage = async content => {
    await fs.writeFile(path.join(config.getSaveDir(), SAVE_FILES[0]), content);
    return { targetVerification: { passed: true } };
  };
  return { root, liveDir, config, service, mutateStage, getBackupCalls: () => backupCalls };
}

test('successful mutation installs only the staged primary and reuses the session backup', async t => {
  const h = await harness(t);
  const knownGoodBefore = await Promise.all(SAVE_FILES.slice(1).map(file => hashFile(path.join(h.liveDir, file))));
  const first = await h.service.mutate('key', 'first', () => h.mutateStage('changed-once'));
  const second = await h.service.mutate('key', 'second', () => h.mutateStage('changed-twice'));
  assert.equal(await fs.readFile(path.join(h.liveDir, SAVE_FILES[0]), 'utf8'), 'changed-twice');
  assert.deepEqual(await Promise.all(SAVE_FILES.slice(1).map(file => hashFile(path.join(h.liveDir, file)))), knownGoodBefore);
  assert.equal(h.getBackupCalls(), 1);
  assert.equal(first.backupId, second.backupId);
});

test('concurrent mutations cannot overlap', async t => {
  const h = await harness(t);
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const first = h.service.mutate('key', 'slow', async () => { entered(); await blocked; return h.mutateStage('slow-change'); });
  await started;
  await assert.rejects(() => h.service.mutate('key', 'overlap', () => h.mutateStage('bad')), error => error.status === 409);
  release();
  await first;
});

test('game start after staging aborts before installation', async t => {
  let checks = 0;
  const h = await harness(t, { isGameRunning: async () => ++checks >= 2 });
  const before = await hashFile(path.join(h.liveDir, SAVE_FILES[0]));
  await assert.rejects(() => h.service.mutate('key', 'game-race', () => h.mutateStage('staged')), error => error.status === 409);
  assert.equal(await hashFile(path.join(h.liveDir, SAVE_FILES[0])), before);
});

test('unknown process state blocks writes before staging', async t => {
  const h = await harness(t, { getGameProcessState: async () => ({ known:false, running:null, processes:[], error:'process check denied' }) });
  const before = await hashFile(path.join(h.liveDir, SAVE_FILES[0]));
  await assert.rejects(() => h.service.mutate('key', 'unknown-process', () => h.mutateStage('bad')), error => error.status === 409 && /denied/.test(error.message));
  assert.equal(await hashFile(path.join(h.liveDir, SAVE_FILES[0])), before);
});

test('temp cleanup failure cannot turn a verified install into an error', async t => {
  const cleanupFailingFs = { ...fs, rm: async target => { if (String(target).includes('fw-editor-')) throw new Error('cleanup failed'); return fs.rm(target, { recursive:true, force:true }); } };
  const h = await harness(t, { fs: cleanupFailingFs });
  const result = await h.service.mutate('key', 'cleanup', () => h.mutateStage('installed'));
  assert.equal(result.afterIntegrity.passed, true);
  assert.equal(await fs.readFile(path.join(h.liveDir, SAVE_FILES[0]), 'utf8'), 'installed');
});

test('live hash race aborts without overwriting the external change', async t => {
  const h = await harness(t);
  await assert.rejects(() => h.service.mutate('key', 'hash-race', async () => {
    await h.mutateStage('staged');
    await fs.writeFile(path.join(h.liveDir, SAVE_FILES[0]), 'external-change');
    return { targetVerification: { passed: true } };
  }), error => error.status === 409 && /changed during/.test(error.message));
  assert.equal(await fs.readFile(path.join(h.liveDir, SAVE_FILES[0]), 'utf8'), 'external-change');
});

test('post-install validation failure rolls back exact pre-operation bytes', async t => {
  let validations = 0;
  const h = await harness(t, { validateDatabase: async () => { if (++validations === 3) throw new Error('installed validation failed'); return valid(); } });
  const before = await hashFile(path.join(h.liveDir, SAVE_FILES[0]));
  await assert.rejects(() => h.service.mutate('key', 'rollback', () => h.mutateStage('invalid-installed')), error => error.rollbackStatus.attempted && error.rollbackStatus.succeeded);
  assert.equal(await hashFile(path.join(h.liveDir, SAVE_FILES[0])), before);
  assert.equal(h.service.getState().active, false);
});

test('compatibility and action failures never install staged data', async t => {
  const incompatible = await harness(t, { checkCompatibility: async () => ({ compatible: false, reasons: ['schema'] }) });
  const before = await hashFile(path.join(incompatible.liveDir, SAVE_FILES[0]));
  await assert.rejects(() => incompatible.service.mutate('key', 'blocked', () => incompatible.mutateStage('bad')), error => error.status === 503);
  assert.equal(await hashFile(path.join(incompatible.liveDir, SAVE_FILES[0])), before);

  const failed = await harness(t);
  const failedBefore = await hashFile(path.join(failed.liveDir, SAVE_FILES[0]));
  await assert.rejects(() => failed.service.mutate('key', 'action-fail', async () => { await failed.mutateStage('staged'); throw new Error('service failure'); }), /service failure/);
  assert.equal(await hashFile(path.join(failed.liveDir, SAVE_FILES[0])), failedBefore);
});

test('failed install copy leaves the live primary untouched', async t => {
  let livePrimary;
  const failingFs = {
    ...fs,
    copyFile: async (source, destination) => {
      if (livePrimary && destination.startsWith(path.dirname(livePrimary)) && destination.endsWith('.installing') && source.includes('fw-editor-')) throw new Error('simulated install copy failure');
      return fs.copyFile(source, destination);
    }
  };
  const h = await harness(t, { fs: failingFs });
  livePrimary = path.join(h.liveDir, SAVE_FILES[0]);
  const before = await hashFile(livePrimary);
  await assert.rejects(() => h.service.mutate('key', 'copy-fail', () => h.mutateStage('staged')), error => /install copy failure/.test(error.message) && !error.rollbackStatus.attempted);
  assert.equal(await hashFile(livePrimary), before);
});

test('rollback copy failure is explicitly reported', async t => {
  const failingFs = {
    ...fs,
    copyFile: async (source, destination) => {
      if (source.endsWith('.rollback')) throw new Error('simulated rollback copy failure');
      return fs.copyFile(source, destination);
    }
  };
  let validations = 0;
  const h = await harness(t, {
    fs: failingFs,
    validateDatabase: async () => { if (++validations === 3) throw new Error('installed validation failed'); return valid(); }
  });
  await assert.rejects(() => h.service.mutate('key', 'rollback-copy-fail', () => h.mutateStage('invalid-installed')), error => {
    assert.equal(error.rollbackStatus.attempted, true);
    assert.equal(error.rollbackStatus.succeeded, false);
    assert.match(error.rollbackStatus.error, /rollback copy failure/);
    return true;
  });
});
