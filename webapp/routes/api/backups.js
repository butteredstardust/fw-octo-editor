const express = require('express');
const router = express.Router();
const { createBackup, listBackups, restoreBackup, deleteBackup } = require('../../services/backupService');
const { runIntegrityCheck, validateForeignKeys } = require('../../utils/validation');
const mutationService = require('../../services/mutationService');
const operationGate = require('../../services/operationGate');
const { resolveKey } = require('../lib/context');
const { handle } = require('../lib/handler');

router.post('/backup', handle(async (req, res) => {
  const result = await operationGate.runExclusive('backup:create', () => createBackup());
  res.json(result);
}));

// NOTE: unlike POST /backup above, this route's error shape is `{ error }`
// only (no operationId/backupId/rollbackStatus) -- preserved via onlyError.
router.post('/backups', handle(async (req, res) => {
  const label = req.body && req.body.label != null ? req.body.label : 'manual';
  const result = await operationGate.runExclusive('backup:create', () => createBackup(label));
  res.status(201).json(result);
}, { onlyError: true }));

router.get('/backups', handle(async (req, res) => {
  const backups = await listBackups();
  res.json(backups);
}));

// NOTE: this route's error envelope is bespoke -- `backupId` comes from
// `req.params.id` (not `err.backupId`) and there's no `operationId` field --
// so it's left hand-written rather than routed through `handle()`.
router.post('/backups/:id/restore', async (req, res) => {
  try {
    const key = resolveKey(req);
    const result = await operationGate.runExclusive('backup:restore', () => restoreBackup(req.params.id, req.body && req.body.confirmation, {
      validatePrimary: async dbPath => {
        const [integrity, foreignKeys] = await Promise.all([runIntegrityCheck(dbPath, key), validateForeignKeys(dbPath, key)]);
        if (!integrity.passed || foreignKeys.errors !== 0) throw Object.assign(new Error('Restored database failed integrity or foreign-key validation'), { status: 422, integrity, foreignKeys });
      }
    }));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, backupId: req.params.id, rollbackStatus: err.rollbackStatus || null });
  }
});

// NOTE: same as restore above -- bespoke `{ error, backupId }` shape with
// `backupId` from `req.params.id`, plus a pre-check that short-circuits with
// a 409 before any mutation runs. Left hand-written.
router.delete('/backups/:id', async (req, res) => {
  try {
    if (mutationService.getState().sessionBackupId === req.params.id) return res.status(409).json({ error: 'The active session backup cannot be deleted' });
    const result = await operationGate.runExclusive('backup:delete', () => deleteBackup(req.params.id, req.body && req.body.confirmation));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, backupId: req.params.id });
  }
});

module.exports = router;
