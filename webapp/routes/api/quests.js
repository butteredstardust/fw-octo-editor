const express = require('express');
const router = express.Router();
const { setQuestReady } = require('../../services/saveService');
const { resolveKey } = require('../lib/context');
const { handleMutation } = require('../lib/handler');

// EXPERIMENTAL: mark a quest ready to turn in (sets Quests.Status = 2).
router.post('/quests/:id/ready', handleMutation('quest-ready', req => setQuestReady(resolveKey(req), req.params.id)));

module.exports = router;
