'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const config = require('../../../services/configService');
const backupService = require('../../../services/backupService');
const realMutationService = require('../../../services/mutationService');
const { loadKey } = require('../../../utils/keyLoader');
const { LIVE_SAVE_DIR, SAVE_FILES } = require('../../helpers/live-save');

// Provides an isolated copy of the REAL live save plus the DB key and a real
// mutation service wired to the actual sqlite3mc/uesave toolchain. Nothing here
// ever writes to the live save directory; the live files are only read once to
// seed a throwaway copy.
async function createE2EContext(t) {
  const saveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-e2e-save-'));
  const backupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-e2e-backup-'));

  await fs.mkdir(saveDir, { recursive: true });
  for (const name of SAVE_FILES) {
    await fs.copyFile(path.join(LIVE_SAVE_DIR, name), path.join(saveDir, name));
  }

  const previousSaveDir = config.getSaveDir();
  const previousBackupRoot = process.env.FW_BACKUP_ROOT;
  config.setOverrides({ saveDir });
  process.env.FW_BACKUP_ROOT = backupRoot;
  const key = await loadKey();

  const service = realMutationService.createMutationService({
    config,
    backupService,
    validateDatabase: async (dbPath, k) => {
      const [integrity, foreignKeys] = await Promise.all([
        require('../../../utils/validation').runIntegrityCheck(dbPath, k),
        require('../../../utils/validation').validateForeignKeys(dbPath, k)
      ]);
      if (!integrity.passed || foreignKeys.errors !== 0) {
        throw Object.assign(new Error('Database validation failed'), { status: 422, integrity, foreignKeys });
      }
      return { integrity, foreignKeys };
    }
  });

  t.after(async () => {
    config.setOverrides({ saveDir: previousSaveDir });
    if (previousBackupRoot === undefined) delete process.env.FW_BACKUP_ROOT;
    else process.env.FW_BACKUP_ROOT = previousBackupRoot;
    await fs.rm(saveDir, { recursive: true, force: true });
    await fs.rm(backupRoot, { recursive: true, force: true });
  });

  return { saveDir, backupRoot, key, service };
}

module.exports = { createE2EContext, LIVE_SAVE_DIR, SAVE_FILES };
