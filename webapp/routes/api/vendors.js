const express = require('express');
const router = express.Router();
const { listFactionScores, setFactionScore, listTraderUnlocks, setTraderUnlock, getVendorEconomy, getCurrencies, setCurrency } = require('../../services/saveService');
const { getRepairStatus, collectRepair } = require('../../services/saveService');
const { resolveKey, runMutation } = require('../lib/context');
const { handle, handleMutation } = require('../lib/handler');

router.get('/vendors', handle(async (req, res) => {
  const factions = await listFactionScores(resolveKey(req));
  const traders = await listTraderUnlocks(resolveKey(req));
  const economy = await getVendorEconomy(resolveKey(req));
  res.json({ factions, traders, economy });
}));

router.put('/vendors/faction/:scope', handleMutation('faction-score', req => setFactionScore(resolveKey(req), req.params.scope, req.body.score)));

router.put('/vendors/trader/:key', handleMutation('trader-unlock', req => setTraderUnlock(resolveKey(req), req.params.key, req.body.unlocked)));

router.get('/currencies', handle(async (req, res) => {
  const currencies = await getCurrencies(resolveKey(req));
  res.json(currencies);
}));

router.put('/currencies/:rowName', handle(async (req, res) => {
  const { amount } = req.body || {};
  if (amount == null) {
    return res.status(400).json({ error: 'amount is required' });
  }
  const result = await runMutation(req, 'currency', () => setCurrency(resolveKey(req), req.params.rowName, amount));
  res.json(result);
}));

router.get('/repair', handle(async (req, res) => {
  const data = await getRepairStatus(resolveKey(req));
  res.json(data);
}));

router.post('/repair/collect', handleMutation('repair-collect', req => collectRepair(resolveKey(req))));

module.exports = router;
