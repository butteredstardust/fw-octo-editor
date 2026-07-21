const nodeFs = require('fs').promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const config = require('./configService');
const backupService = require('./backupService');
const processCheck = require('../utils/processCheck');
const validation = require('../utils/validation');
const compatibilityService = require('./compatibilityService');

function httpError(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

async function defaultValidateDatabase(dbPath, key) {
  const [integrity, foreignKeys] = await Promise.all([
    validation.runIntegrityCheck(dbPath, key),
    validation.validateForeignKeys(dbPath, key)
  ]);
  if (!integrity.passed || foreignKeys.errors !== 0) {
    throw Object.assign(new Error('Database validation failed'), { status: 422, integrity, foreignKeys });
  }
  return { integrity, foreignKeys };
}

function createMutationService(dependencies = {}) {
  const fs = dependencies.fs || nodeFs;
  const configService = dependencies.config || config;
  const backups = dependencies.backupService || backupService;
  const isGameRunning = dependencies.isGameRunning || processCheck.isGameRunning;
  const checkCompatibility = dependencies.checkCompatibility || compatibilityService.checkCompatibility;
  const validateDatabase = dependencies.validateDatabase || defaultValidateDatabase;
  const tempRoot = dependencies.tempRoot || os.tmpdir();
  const randomUUID = dependencies.randomUUID || crypto.randomUUID;
  let active = false;
  let sessionBackup = null;

  async function requireGameClosed() {
    if (await isGameRunning()) throw httpError('The Forever Winter is running. Close it before editing.');
  }

  async function mutate(key, label, action) {
    if (active) throw httpError('Another save mutation is active');
    active = true;
    const operationId = randomUUID();
    const liveDir = configService.getSaveDir();
    const primaryName = backups.SAVE_FILES[0];
    const livePrimary = path.join(liveDir, primaryName);
    const rollbackStatus = { attempted: false, succeeded: false };
    let tempDir;
    let installed = false;
    try {
      await requireGameClosed();
      const compatibility = await checkCompatibility(key);
      if (!compatibility.compatible) throw Object.assign(new Error(`Writes disabled: ${compatibility.reasons.join(', ')}`), { status: 503, compatibility });
      if (!sessionBackup) sessionBackup = await backups.createBackup('session');
      tempDir = await fs.mkdtemp(path.join(tempRoot, 'fw-editor-'));
      for (const name of backups.SAVE_FILES) await fs.copyFile(path.join(liveDir, name), path.join(tempDir, name));
      const rollbackFile = path.join(tempDir, `${primaryName}.rollback`);
      await fs.copyFile(livePrimary, rollbackFile);
      const beforeHash = await backups.hashFile(livePrimary);
      const beforeValidation = await validateDatabase(livePrimary, key);

      const serviceResult = await configService.withSaveDir(tempDir, action);
      const stagedPrimary = path.join(tempDir, primaryName);
      await validateDatabase(stagedPrimary, key);
      const stagedHash = await backups.hashFile(stagedPrimary);
      if (stagedHash === beforeHash) throw Object.assign(new Error('Mutation produced no database change'), { status: 422 });

      await requireGameClosed();
      if (await backups.hashFile(livePrimary) !== beforeHash) throw httpError('Live save changed during the staged operation');
      await fs.copyFile(stagedPrimary, livePrimary);
      installed = true;
      if (await backups.hashFile(livePrimary) !== stagedHash) throw new Error('Installed save hash does not match staged save');
      const installedValidation = await validateDatabase(livePrimary, key);
      return {
        ...serviceResult,
        operationId,
        operation: label,
        backupId: sessionBackup.id,
        beforeHashes: { ...(serviceResult.beforeHashes || {}), primary: beforeHash },
        afterHashes: { ...(serviceResult.afterHashes || {}), primary: stagedHash },
        beforeIntegrity: beforeValidation.integrity,
        beforeFk: beforeValidation.foreignKeys,
        afterIntegrity: installedValidation.integrity,
        afterFk: installedValidation.foreignKeys,
        targetVerification: serviceResult.targetVerification || null,
        warnings: serviceResult.warnings || [],
        rollbackStatus
      };
    } catch (error) {
      if (installed && tempDir) {
        rollbackStatus.attempted = true;
        try {
          const rollbackFile = path.join(tempDir, `${primaryName}.rollback`);
          await fs.copyFile(rollbackFile, livePrimary);
          rollbackStatus.succeeded = await backups.hashFile(livePrimary) === await backups.hashFile(rollbackFile);
        } catch (rollbackError) { rollbackStatus.error = rollbackError.message; }
      }
      error.operationId = operationId;
      error.backupId = sessionBackup?.id || null;
      error.rollbackStatus = rollbackStatus;
      throw error;
    } finally {
      active = false;
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  function getState() { return { active, sessionBackupId: sessionBackup?.id || null }; }
  function resetForTests() { active = false; sessionBackup = null; }
  return { mutate, getState, resetForTests };
}

const singleton = createMutationService();
module.exports = {
  mutate: singleton.mutate,
  getState: singleton.getState,
  resetForTests: singleton.resetForTests,
  validateDatabase: defaultValidateDatabase,
  createMutationService
};
