const express = require('express');
const router = express.Router();
const config = require('../../services/configService');
const { getSchema, getDashboardData, getPlayerStats } = require('../../services/saveService');
const { getLatestBackupHashes } = require('../../services/backupService');
const { getGameProcessState } = require('../../utils/processCheck');
const mutationService = require('../../services/mutationService');
const { checkCompatibility } = require('../../services/compatibilityService');
const { checkInventoryRoundTrip } = require('../../services/gvasService');
const { getGameVersion, VERIFIED_GAME_VERSION } = require('../../services/gameVersionService');
const { version: APP_VERSION } = require('../../package.json');
const { resolveKey } = require('../lib/context');
const { handle } = require('../lib/handler');

router.get('/status', handle(async (req, res) => {
  const gameProcess = await getGameProcessState();
  const gameRunning = gameProcess.known && gameProcess.running ? gameProcess.processes : false;
  const schema = await getSchema(resolveKey(req));
  const hashes = await getLatestBackupHashes();
  const mutation = mutationService.getState();
  const compatibility = await checkCompatibility(resolveKey(req));
  res.json({
    gameRunning,
    gameProcess,
    schema,
    backupHashes: hashes,
    activeSaveDir: config.getSaveDir(),
    mutation,
    compatibility,
    writeReady: gameProcess.known && !gameProcess.running && !mutation.active && compatibility.compatible,
    blockingReasons: [!gameProcess.known ? 'game-process-unknown' : null, gameProcess.running ? 'game-running' : null, mutation.active ? 'mutation-active' : null, ...compatibility.reasons].filter(Boolean),
    appVersion: APP_VERSION,
    verifiedGameVersion: VERIFIED_GAME_VERSION
  });
}));

// NOTE: /health has a wholly different response shape from the rest of the
// API (status 200/503 based on compatibility, not err.status; a different
// body on success vs. failure) and is intentionally left hand-written rather
// than routed through the shared `handle()` helper.
router.get('/health', async (req, res) => {
  try {
    const compatibility = await checkCompatibility(resolveKey(req));
    res.status(compatibility.compatible ? 200 : 503).json({ appId: 'forever-winter-save-editor', appVersion: APP_VERSION, ok: compatibility.compatible, compatibility, mutation: mutationService.getState() });
  } catch (err) { res.status(503).json({ appId: 'forever-winter-save-editor', appVersion: APP_VERSION, ok:false, error:err.message }); }
});

// NOTE: error shape here is `{ error }` only with a 503 default (not the
// app-wide envelope / 500 default), so it's routed through `handle()` with
// explicit options rather than the default envelope.
router.get('/diagnostics', handle(async (req, res) => {
  const [compatibility, gameProcess, inventoryRoundTrip, gameVersion] = await Promise.all([
    checkCompatibility(resolveKey(req)),
    getGameProcessState(),
    checkInventoryRoundTrip(resolveKey(req)).catch(error => ({ compatible: false, byteIdentical: false, error: error.message })),
    getGameVersion()
  ]);
  const mutation = mutationService.getState();
  const gameRunning = gameProcess.known && gameProcess.running ? gameProcess.processes : false;
  res.json({
    checkedAt: new Date().toISOString(),
    gameRunning,
    gameProcess,
    compatibility,
    gameVersion,
    inventoryRoundTrip,
    mutation,
    activeSaveDir: config.getSaveDir(),
    writeReady: gameProcess.known && !gameProcess.running && !mutation.active && compatibility.compatible,
    steamCloudWarning: 'Steam Cloud may overwrite edited saves; disable it for The Forever Winter before editing.'
  });
}, { onlyError: true, defaultStatus: 503 }));

router.get('/schema', handle(async (req, res) => {
  const schema = await getSchema(resolveKey(req));
  res.json(schema);
}));

router.get('/dashboard', handle(async (req, res) => {
  const data = await getDashboardData(resolveKey(req));
  res.json(data);
}));

// Read-only lifetime/combat/progression stats (see getPlayerStats() in
// saveService.js for the full field breakdown).
router.get('/stats', handle(async (req, res) => {
  const data = await getPlayerStats(resolveKey(req));
  res.json(data);
}));

module.exports = router;
