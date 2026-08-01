const express = require('express');
const router = express.Router();
const { listCharacters, updateCharacterLevel, setPrestige, listCharacterDetails, setCharacterXp, setCharacterSkills } = require('../../services/saveService');
const { resolveKey } = require('../lib/context');
const { handle, handleMutation } = require('../lib/handler');

router.get('/characters', handle(async (req, res) => {
  const characters = await listCharacters(resolveKey(req));
  res.json(characters);
}));

router.put('/characters/:id/level', handleMutation('character-level', req => updateCharacterLevel(resolveKey(req), req.params.id, req.body.level)));

router.post('/characters/prestige', handleMutation('character-prestige', req => setPrestige(resolveKey(req), req.body.characterId, req.body.targetLevel)));

router.get('/characters/:id/details', handle(async (req, res) => {
  const details = await listCharacterDetails(resolveKey(req), req.params.id);
  res.json(details);
}));

router.put('/characters/:id/xp', handleMutation('character-xp', req => setCharacterXp(resolveKey(req), req.params.id, req.body.xp)));

router.post('/characters/:id/skills', handleMutation('character-skills', req => setCharacterSkills(resolveKey(req), req.params.id, req.body.skills)));

module.exports = router;
