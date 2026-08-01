const express = require('express');
const router = express.Router();
const { listWeaponXp, setWeaponXp, batchSetWeaponXp, getReferenceWeaponXp } = require('../../services/saveService');
const weaponBuildService = require('../../services/weaponBuildService');
const presetService = require('../../services/presetService');
const { resolveKey, runMutation } = require('../lib/context');
const { handle, handleMutation } = require('../lib/handler');

// NOTE: GET /presets and GET /weapon-builds use the compact `{ error }`-only
// shape (no operationId/backupId/rollbackStatus), unlike the weapon-builds
// mutation routes below -- preserved as-is via `onlyError`.
router.get('/presets', handle(async (req, res) => {
  res.json(await presetService.listPresets(resolveKey(req)));
}, { onlyError: true }));

router.get('/weapon-builds', handle(async (req, res) => {
  res.json(await weaponBuildService.listBuilds(resolveKey(req)));
}, { onlyError: true }));

router.post('/weapon-builds/add-missing-owned', handleMutation('weapon-build-add-missing-owned', req => weaponBuildService.addMissingForOwnedWeapons(resolveKey(req))));

router.post('/weapon-builds/:weaponId/parts/:partId/add', handleMutation('weapon-build-add-part', req => weaponBuildService.addBuildPart(resolveKey(req), req.params.weaponId, req.params.partId)));

router.post('/weapon-builds/:weaponId/add-missing', handleMutation('weapon-build-add-missing', req => weaponBuildService.addMissing(resolveKey(req), req.params.weaponId)));

router.post('/weapon-builds/:weaponId/add-missing-with-weapon', handleMutation('weapon-build-add-missing-with-weapon', req => weaponBuildService.addMissingWithWeapon(resolveKey(req), req.params.weaponId)));

router.get('/weapon-xp', handle(async (req, res) => {
  const xp = await listWeaponXp(resolveKey(req));
  res.json(xp);
}));

router.get('/weapon-xp/reference', handle(async (req, res) => {
  const ref = await getReferenceWeaponXp(resolveKey(req));
  res.json(ref);
}));

router.put('/weapon-xp/:weapon', handleMutation('weapon-xp', req => setWeaponXp(resolveKey(req), req.params.weapon, req.body.xp)));

// Bulk-set weapon XP for many scopes in one transaction-friendly batch. Body:
// { items: [{ scope, xp }] }. Each is validated server-side (numeric xp, escaped
// scope). Returns per-item success and an overall integrity/FK/hashes summary.
router.post('/weapon-xp/batch', handle(async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items array required' });
  }
  const result = await runMutation(req, 'weapon-xp-batch', () => batchSetWeaponXp(resolveKey(req), items));
  res.json(result);
}));

module.exports = router;
