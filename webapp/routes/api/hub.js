const express = require('express');
const router = express.Router();
const { listHubUpgrades, setHubUpgrades } = require('../../services/saveService');
const { resolveKey } = require('../lib/context');
const { handle, handleMutation } = require('../lib/handler');

router.get('/hub-upgrades', handle(async (req, res) => {
  const upgrades = await listHubUpgrades(resolveKey(req));
  res.json(upgrades);
}));

router.post('/hub-upgrades', handleMutation('hub-upgrades', req => setHubUpgrades(resolveKey(req), req.body.tags)));

module.exports = router;
