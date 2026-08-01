const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../../services/configService');
const { runIntegrityCheck } = require('../../utils/validation');
const operationGate = require('../../services/operationGate');
const { SAVE_FILES } = require('../../services/backupService');
const { resolveKey } = require('../lib/context');
const { handle } = require('../lib/handler');

// Current settings: the active save directory, the default path, and whether a
// DB-key override is in effect (we never return the key value itself).
router.get('/settings', handle(async (req, res) => {
  const overrides = config.getOverrides();
  res.json({
    saveDir: overrides.saveDir,
    defaultSaveDir: config.getDefaultSaveDir(),
    defaultKeyFile: config.getDefaultKeyFile(),
    hasCustomKey: overrides.hasCustomKey,
    keySource: overrides.hasCustomKey ? 'user-override' : 'bundled-resource',
    activeSaveDir: config.getSaveDir()
  });
}));

// Update settings. `saveDir` is validated as before. `dbKey` is optional:
// omit it to leave any existing key override untouched, send null/'' to
// clear it back to the bundled default, or a 32-character string to set a
// custom key. A non-empty candidate key is verified against the live save
// (if one exists) before being persisted, so a typo can't silently lock the
// user out. The key value itself is never echoed back.
//
// NOTE: this handler's error shape (status default 400, `{ error }` only) is
// deliberately different from the app-wide envelope, so it uses `handle()`
// with onlyError + defaultStatus rather than the full-envelope default.
router.post('/settings', handle(async (req, res) => {
  const resultPayload = await operationGate.runExclusive('settings', async () => {
    const body = req.body || {};
    const hasSaveDir = Object.hasOwn(body, 'saveDir');
    const { saveDir } = body;
    const cleanDir = !hasSaveDir ? undefined : ((typeof saveDir === 'string' && saveDir.trim()) ? saveDir.trim() : null);

    let dbKey;
    if (Object.hasOwn(body, 'dbKey')) {
      dbKey = (body.dbKey === null || body.dbKey === '') ? null : body.dbKey;
      if (dbKey !== null) {
        if (typeof dbKey !== 'string' || dbKey.length !== 32) {
          throw Object.assign(new Error('Database key must be exactly 32 characters'), { status: 400 });
        }
        if (/\p{Cc}/u.test(dbKey)) throw Object.assign(new Error('Database key contains unsupported control characters'), { status: 400 });
      }
    }

    const candidateKey = dbKey === undefined ? resolveKey(req) : (dbKey || req.app.locals.dbKey);
    const candidateDir = cleanDir === undefined ? config.getSaveDir() : (cleanDir || config.getDefaultSaveDir());
    const candidatePath = path.join(candidateDir, SAVE_FILES[0]);
    if (!fs.existsSync(candidatePath)) {
      throw Object.assign(new Error(`The proposed directory does not contain the expected primary save: ${SAVE_FILES[0]}`), { status: 422 });
    }
    const integrity = await runIntegrityCheck(candidatePath, candidateKey);
    if (!integrity.passed) throw Object.assign(new Error('The proposed save directory and database key are not compatible'), { status: 422 });
    const result = config.setOverrides({ saveDir: cleanDir, dbKey });
    return {
      saveDir: result.saveDir,
      defaultSaveDir: config.getDefaultSaveDir(),
      hasCustomKey: result.hasCustomKey,
      keySource: result.hasCustomKey ? 'user-override' : 'bundled-resource',
      activeSaveDir: config.getSaveDir()
    };
  });
  res.json(resultPayload);
}, { onlyError: true, defaultStatus: 400 }));

module.exports = router;
