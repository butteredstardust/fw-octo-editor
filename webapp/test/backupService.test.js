const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { hashFile, SAVE_FILES, STALE_PARTIAL_AGE_MS, createBackup, listBackups, restoreBackup, deleteBackup } = require('../services/backupService');

test('hashFile returns the expected uppercase SHA-256', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-hash-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'unicode-șț.dat');
  await fs.writeFile(file, 'Forever Winter');
  const expected = crypto.createHash('sha256').update('Forever Winter').digest('hex').toUpperCase();
  assert.equal(await hashFile(file), expected);
});

test('save variants remain three distinct filenames', () => {
  assert.equal(SAVE_FILES.length, 3);
  assert.equal(new Set(SAVE_FILES).size, 3);
  assert.match(SAVE_FILES[0], /^[a-f0-9]+\.dat$/);
});

async function makeLive(dir, prefix) {
  await fs.mkdir(dir, { recursive: true });
  for (const [index, name] of SAVE_FILES.entries()) await fs.writeFile(path.join(dir, name), `${prefix}-${index}`);
}

test('backup manifests verify hashes and sort by manifest timestamp', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-backups-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const live = path.join(root, 'live');
  const backups = path.join(root, 'backups');
  await makeLive(live, 'original');
  const first = await createBackup('first', { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false });
  await new Promise(resolve => setTimeout(resolve, 5));
  const second = await createBackup('second', { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false });
  const listed = await listBackups({ backupRoot: backups });
  assert.deepEqual(listed.map(item => item.name), [second.id, first.id]);
  assert.ok(listed.every(item => item.manifestValid));
});

test('same-second backups have unique ids and partial directories are ignored', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-backup-collision-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const live = path.join(root, 'live');
  const backups = path.join(root, 'backups');
  await makeLive(live, 'same');
  const [first, second] = await Promise.all([
    createBackup('collision', { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false }),
    createBackup('collision', { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false })
  ]);
  assert.notEqual(first.id, second.id);
  const stalePartial = path.join(backups, '.interrupted.partial');
  const freshPartial = path.join(backups, '.active.partial');
  await fs.mkdir(stalePartial);
  await fs.mkdir(freshPartial);
  const old = new Date(Date.now() - STALE_PARTIAL_AGE_MS - 1000);
  await fs.utimes(stalePartial, old, old);
  const listed = await listBackups({ backupRoot: backups });
  assert.equal(listed.length, 2);
  await assert.rejects(() => fs.stat(stalePartial), error => error.code === 'ENOENT');
  assert.equal((await fs.stat(freshPartial)).isDirectory(), true);
});

test('restore requires exact confirmation and restores only the primary', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-restore-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const live = path.join(root, 'live');
  const backups = path.join(root, 'backups');
  await makeLive(live, 'restore-target');
  const backup = await createBackup('target', { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false });
  await makeLive(live, 'current');
  await assert.rejects(() => restoreBackup(backup.id, 'yes', { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false }), /Confirmation/);
  const result = await restoreBackup(backup.id, `RESTORE ${backup.id}`, { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false, validatePrimary: async () => {} });
  assert.deepEqual(result.restoredFiles, [SAVE_FILES[0]]);
  assert.equal(await fs.readFile(path.join(live, SAVE_FILES[0]), 'utf8'), 'restore-target-0');
  assert.equal(await fs.readFile(path.join(live, SAVE_FILES[1]), 'utf8'), 'current-1');
  assert.equal(await fs.readFile(path.join(live, SAVE_FILES[2]), 'utf8'), 'current-2');
});

test('restore rejects a backup whose bytes do not match its manifest', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-tamper-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const live = path.join(root, 'live');
  const backups = path.join(root, 'backups');
  await makeLive(live, 'original');
  const backup = await createBackup('tamper', { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false });
  await fs.writeFile(path.join(backup.backupDir, SAVE_FILES[0]), 'tampered');
  await assert.rejects(() => restoreBackup(backup.id, `RESTORE ${backup.id}`, { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false }), /hash mismatch/);
});

test('post-install validation failure rolls the primary back byte-for-byte', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-rollback-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const live = path.join(root, 'live');
  const backups = path.join(root, 'backups');
  await makeLive(live, 'restore-target');
  const backup = await createBackup('rollback-target', { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false });
  await makeLive(live, 'current');
  const before = await hashFile(path.join(live, SAVE_FILES[0]));
  let validations = 0;
  await assert.rejects(() => restoreBackup(backup.id, `RESTORE ${backup.id}`, {
    liveSaveDir: live,
    backupRoot: backups,
    isGameRunning: async () => false,
    validatePrimary: async () => { if (++validations === 2) throw new Error('simulated installed validation failure'); }
  }), error => error.rollbackStatus && error.rollbackStatus.succeeded === true);
  assert.equal(await hashFile(path.join(live, SAVE_FILES[0])), before);
});

test('backup deletion requires typed confirmation and verifies removal', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-delete-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const live = path.join(root, 'live');
  const backups = path.join(root, 'backups');
  await makeLive(live, 'delete-target');
  const backup = await createBackup('delete-me', { liveSaveDir: live, backupRoot: backups, isGameRunning: async () => false });
  await assert.rejects(() => deleteBackup(backup.id, 'DELETE wrong', { backupRoot: backups }), error => error.status === 400);
  assert.equal((await fs.stat(backup.backupDir)).isDirectory(), true);
  const receipt = await deleteBackup(backup.id, `DELETE ${backup.id}`, { backupRoot: backups });
  assert.deepEqual(receipt, { success: true, backupId: backup.id, deleted: true });
  await assert.rejects(() => fs.stat(backup.backupDir), error => error.code === 'ENOENT');
});

test('backup deletion rejects traversal and missing ids', async () => {
  await assert.rejects(() => deleteBackup('../outside', 'DELETE ../outside'), error => error.status === 400);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-delete-missing-'));
  try { await assert.rejects(() => deleteBackup('missing-backup', 'DELETE missing-backup', { backupRoot: root }), error => error.status === 404); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
});
