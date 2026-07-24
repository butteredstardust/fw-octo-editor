const express = require('express');
const router = express.Router();
const config = require('../services/configService');
const { getSchema, getPrimarySavePath } = require('../services/saveService');
const fs = require('fs');
const { listCharacters, updateCharacterLevel, setPrestige, listCharacterDetails, setCharacterXp, setCharacterSkills } = require('../services/saveService');
const { listHubUpgrades, setHubUpgrades } = require('../services/saveService');
const { listWeaponXp, setWeaponXp, batchSetWeaponXp, getReferenceWeaponXp, listFactionScores, setFactionScore, listTraderUnlocks, setTraderUnlock, getDashboardData, getCurrencies, setCurrency, getVendorEconomy } = require('../services/saveService');
const { listInventoryItems: listInventoryItemsGvas, updateInventoryItem: updateInventoryItemGvas, addInventoryItem: addInventoryItemGvas } = require('../services/gvasService');
const { checkInventoryRoundTrip, listRigs, addRigOwnership, addHighQualityContainerSet, getVaultInventory } = require('../services/gvasService');
const { createBackup, listBackups, restoreBackup, deleteBackup, getLatestBackupHashes } = require('../services/backupService');
const { isGameRunning } = require('../utils/processCheck');
const { runIntegrityCheck, validateForeignKeys } = require('../utils/validation');
const { getRepairStatus, collectRepair, setQuestReady, getPlayerStats } = require('../services/saveService');
const mutationService = require('../services/mutationService');
const { checkCompatibility } = require('../services/compatibilityService');
const { getGameVersion, VERIFIED_GAME_VERSION } = require('../services/gameVersionService');
const { version: APP_VERSION } = require('../package.json');
const weaponBuildService = require('../services/weaponBuildService');
const presetService = require('../services/presetService');

async function runMutation(req, label, callback) {
  return mutationService.mutate(resolveKey(req), label, callback);
}

// Resolve the active DB key for a request: a user-supplied override (persisted
// in configService, decrypted on demand) takes precedence over the boot-time
// bundled key. Checked per-request so a key change takes effect without a
// restart. The key is never logged.
function resolveKey(req) {
  return config.getActiveKeyOverride() || req.app.locals.dbKey;
}

// Current settings: the active save directory, the default path, and whether a
// DB-key override is in effect (we never return the key value itself).
router.get('/settings', async (req, res) => {
  try {
    const overrides = config.getOverrides();
    res.json({
      saveDir: overrides.saveDir,
      defaultSaveDir: config.getDefaultSaveDir(),
      defaultKeyFile: config.getDefaultKeyFile(),
      hasCustomKey: overrides.hasCustomKey,
      keySource: overrides.hasCustomKey ? 'user-override' : 'bundled-resource',
      activeSaveDir: config.getSaveDir()
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

// Update settings. `saveDir` is validated as before. `dbKey` is optional:
// omit it to leave any existing key override untouched, send null/'' to
// clear it back to the bundled default, or a 32-character string to set a
// custom key. A non-empty candidate key is verified against the live save
// (if one exists) before being persisted, so a typo can't silently lock the
// user out. The key value itself is never echoed back.
router.post('/settings', async (req, res) => {
  try {
    const body = req.body || {};
    const { saveDir } = body;
    const cleanDir = (typeof saveDir === 'string' && saveDir.trim()) ? saveDir.trim() : null;

    let dbKey;
    if (Object.hasOwn(body, 'dbKey')) {
      dbKey = (body.dbKey === null || body.dbKey === '') ? null : body.dbKey;
      if (dbKey !== null) {
        if (typeof dbKey !== 'string' || dbKey.length !== 32) {
          return res.status(400).json({ error: 'Database key must be exactly 32 characters' });
        }
        const dbPath = getPrimarySavePath();
        if (fs.existsSync(dbPath)) {
          const integrity = await runIntegrityCheck(dbPath, dbKey);
          if (!integrity.passed) return res.status(400).json({ error: 'Key does not open the save file' });
        }
      }
    }

    const result = config.setOverrides({ saveDir: cleanDir, dbKey });
    res.json({
      saveDir: result.saveDir,
      defaultSaveDir: config.getDefaultSaveDir(),
      hasCustomKey: result.hasCustomKey,
      keySource: result.hasCustomKey ? 'user-override' : 'bundled-resource',
      activeSaveDir: config.getSaveDir()
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const gameRunning = await isGameRunning();
    const schema = await getSchema(resolveKey(req));
    const hashes = await getLatestBackupHashes();
    const mutation = mutationService.getState();
    const compatibility = await checkCompatibility(resolveKey(req));
    res.json({
      gameRunning,
      schema,
      backupHashes: hashes,
      activeSaveDir: config.getSaveDir(),
      mutation,
      compatibility,
      writeReady: !gameRunning && !mutation.active && compatibility.compatible,
      blockingReasons: [gameRunning ? 'game-running' : null, mutation.active ? 'mutation-active' : null, ...compatibility.reasons].filter(Boolean),
      appVersion: APP_VERSION,
      verifiedGameVersion: VERIFIED_GAME_VERSION
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/health', async (req, res) => {
  try {
    const compatibility = await checkCompatibility(resolveKey(req));
    res.status(compatibility.compatible ? 200 : 503).json({ ok: compatibility.compatible, compatibility, mutation: mutationService.getState() });
  } catch (err) { res.status(503).json({ ok:false, error:err.message }); }
});

router.get('/diagnostics', async (req, res) => {
  try {
    const [compatibility, gameRunning, inventoryRoundTrip, gameVersion] = await Promise.all([
      checkCompatibility(resolveKey(req)),
      isGameRunning(),
      checkInventoryRoundTrip(resolveKey(req)).catch(error => ({ compatible: false, byteIdentical: false, error: error.message })),
      getGameVersion()
    ]);
    const mutation = mutationService.getState();
    const running = Array.isArray(gameRunning) ? gameRunning.length > 0 : !!gameRunning;
    res.json({
      checkedAt: new Date().toISOString(),
      gameRunning,
      compatibility,
      gameVersion,
      inventoryRoundTrip,
      mutation,
      activeSaveDir: config.getSaveDir(),
      writeReady: !running && !mutation.active && compatibility.compatible,
      steamCloudWarning: 'Steam Cloud may overwrite edited saves; disable it for The Forever Winter before editing.'
    });
  } catch (err) {
    res.status(err.status || 503).json({ error: err.message });
  }
});

router.get('/schema', async (req, res) => {
  try {
    const schema = await getSchema(resolveKey(req));
    res.json(schema);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/characters', async (req, res) => {
  try {
    const characters = await listCharacters(resolveKey(req));
    res.json(characters);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.put('/characters/:id/level', async (req, res) => {
  try {
    const { level } = req.body;
    const result = await runMutation(req, 'character-level', () => updateCharacterLevel(resolveKey(req), req.params.id, level));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.post('/characters/prestige', async (req, res) => {
  try {
    const { characterId, targetLevel } = req.body;
    const result = await runMutation(req, 'character-prestige', () => setPrestige(resolveKey(req), characterId, targetLevel));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/characters/:id/details', async (req, res) => {
  try {
    const details = await listCharacterDetails(resolveKey(req), req.params.id);
    res.json(details);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.put('/characters/:id/xp', async (req, res) => {
  try {
    const { xp } = req.body;
    const result = await runMutation(req, 'character-xp', () => setCharacterXp(resolveKey(req), req.params.id, xp));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.post('/characters/:id/skills', async (req, res) => {
  try {
    const { skills } = req.body;
    const result = await runMutation(req, 'character-skills', () => setCharacterSkills(resolveKey(req), req.params.id, skills));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/hub-upgrades', async (req, res) => {
  try {
    const upgrades = await listHubUpgrades(resolveKey(req));
    res.json(upgrades);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.post('/hub-upgrades', async (req, res) => {
  try {
    const { tags } = req.body;
    const result = await runMutation(req, 'hub-upgrades', () => setHubUpgrades(resolveKey(req), tags));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/presets',async(req,res)=>{try{res.json(await presetService.listPresets(resolveKey(req)));}catch(err){res.status(err.status||500).json({error:err.message});}});
router.get('/weapon-builds', async (req,res)=>{try{res.json(await weaponBuildService.listBuilds(resolveKey(req)));}catch(err){res.status(err.status||500).json({error:err.message});}});
router.post('/weapon-builds/add-missing-owned',async(req,res)=>{try{const result=await runMutation(req,'weapon-build-add-missing-owned',()=>weaponBuildService.addMissingForOwnedWeapons(resolveKey(req)));res.json(result);}catch(err){res.status(err.status||500).json({error:err.message,operationId:err.operationId||null,backupId:err.backupId||null,rollbackStatus:err.rollbackStatus||null});}});
router.post('/weapon-builds/:weaponId/parts/:partId/add',async(req,res)=>{try{const result=await runMutation(req,'weapon-build-add-part',()=>weaponBuildService.addBuildPart(resolveKey(req),req.params.weaponId,req.params.partId));res.json(result);}catch(err){res.status(err.status||500).json({error:err.message,operationId:err.operationId||null,backupId:err.backupId||null,rollbackStatus:err.rollbackStatus||null});}});
router.post('/weapon-builds/:weaponId/add-missing',async(req,res)=>{try{const result=await runMutation(req,'weapon-build-add-missing',()=>weaponBuildService.addMissing(resolveKey(req),req.params.weaponId));res.json(result);}catch(err){res.status(err.status||500).json({error:err.message,operationId:err.operationId||null,backupId:err.backupId||null,rollbackStatus:err.rollbackStatus||null});}});
router.post('/weapon-builds/:weaponId/add-missing-with-weapon',async(req,res)=>{try{const result=await runMutation(req,'weapon-build-add-missing-with-weapon',()=>weaponBuildService.addMissingWithWeapon(resolveKey(req),req.params.weaponId));res.json(result);}catch(err){res.status(err.status||500).json({error:err.message,operationId:err.operationId||null,backupId:err.backupId||null,rollbackStatus:err.rollbackStatus||null});}});

router.get('/weapon-xp', async (req, res) => {
  try {
    const xp = await listWeaponXp(resolveKey(req));
    res.json(xp);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/weapon-xp/reference', async (req, res) => {
  try {
    const ref = await getReferenceWeaponXp(resolveKey(req));
    res.json(ref);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/vendors', async (req, res) => {
  try {
    const factions = await listFactionScores(resolveKey(req));
    const traders = await listTraderUnlocks(resolveKey(req));
    const economy = await getVendorEconomy(resolveKey(req));
    res.json({ factions, traders, economy });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.put('/vendors/faction/:scope', async (req, res) => {
  try {
    const { score } = req.body;
    const result = await runMutation(req, 'faction-score', () => setFactionScore(resolveKey(req), req.params.scope, score));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.put('/vendors/trader/:key', async (req, res) => {
  try {
    const unlocked = req.body.unlocked;
    const result = await runMutation(req, 'trader-unlock', () => setTraderUnlock(resolveKey(req), req.params.key, unlocked));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.put('/weapon-xp/:weapon', async (req, res) => {
  try {
    const { xp } = req.body;
    const result = await runMutation(req, 'weapon-xp', () => setWeaponXp(resolveKey(req), req.params.weapon, xp));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});


// Bulk-set weapon XP for many scopes in one transaction-friendly batch. Body:
// { items: [{ scope, xp }] }. Each is validated server-side (numeric xp, escaped
// scope). Returns per-item success and an overall integrity/FK/hashes summary.
router.post('/weapon-xp/batch', async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'items array required' });
    }
    const result = await runMutation(req, 'weapon-xp-batch', () => batchSetWeaponXp(resolveKey(req), items));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.post('/backup', async (req, res) => {
  try {
    const result = await createBackup();
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.post('/backups', async (req, res) => {
  try {
    const label = req.body && req.body.label != null ? req.body.label : 'manual';
    const result = await createBackup(label);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/backups', async (req, res) => {
  try {
    const backups = await listBackups();
    res.json(backups);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.post('/backups/:id/restore', async (req, res) => {
  try {
    const key = resolveKey(req);
    const result = await restoreBackup(req.params.id, req.body && req.body.confirmation, {
      validatePrimary: async dbPath => {
        const [integrity, foreignKeys] = await Promise.all([runIntegrityCheck(dbPath, key), validateForeignKeys(dbPath, key)]);
        if (!integrity.passed || foreignKeys.errors !== 0) throw Object.assign(new Error('Restored database failed integrity or foreign-key validation'), { status: 422, integrity, foreignKeys });
      }
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, backupId: req.params.id, rollbackStatus: err.rollbackStatus || null });
  }
});

router.delete('/backups/:id', async (req, res) => {
  try {
    if (mutationService.getState().sessionBackupId === req.params.id) return res.status(409).json({ error: 'The active session backup cannot be deleted' });
    const result = await deleteBackup(req.params.id, req.body && req.body.confirmation);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, backupId: req.params.id });
  }
});

router.get('/inventory', async (req, res) => {
  try {
    const items = await listInventoryItemsGvas(resolveKey(req));
    res.json(items);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

// The Vault (home stash) is a separate GVAS blob from TempInventory -- read
// only, no write support yet (see getVaultInventory() in gvasService.js).
router.get('/vault', async (req, res) => {
  try {
    const vault = await getVaultInventory(resolveKey(req));
    res.json(vault);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/rigs', async (req, res) => {
  try {
    res.json(await listRigs(resolveKey(req)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.post('/rigs/:rigId/add', async (req, res) => {
  try {
    const result = await runMutation(req, 'rig-ownership', () => addRigOwnership(resolveKey(req), req.params.rigId));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.post('/rigs/:rigId/high-quality-set', async (req, res) => {
  try {
    const result = await runMutation(req, 'rig-high-quality-containers', () => addHighQualityContainerSet(resolveKey(req), req.params.rigId));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/inventory/search', async (req, res) => {
  try {
    const { q } = req.query;
    const items = await listInventoryItemsGvas(resolveKey(req));
    const filtered = q
      ? items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()))
      : items;
    res.json(filtered);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.post('/inventory/update', async (req, res) => {
  try {
    const { itemId, quantity, sourceMap } = req.body;
    const result = await runMutation(req, 'inventory-update', () => updateInventoryItemGvas(resolveKey(req), itemId, quantity, sourceMap));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

// Add a brand-new item row to the inventory (experimental; see AGENTS.md).
router.post('/inventory/add', async (req, res) => {
  try {
    const { itemId, quantity, sourceMap } = req.body;
    if (!itemId || quantity == null) {
      return res.status(400).json({ error: 'itemId and quantity are required' });
    }
    const result = await runMutation(req, 'inventory-add', async () => {
      const addResult = await addInventoryItemGvas(resolveKey(req), itemId, quantity, sourceMap);
      // addInventoryItem returns added:false (a no-op) when the item is already
      // present. The frontend "add missing materials" flow relies on that to fall
      // back to a quantity update, but a no-op would make the staged save
      // identical to the live one and the mutation gate would reject it with a
      // 422 ("no database change"). Perform the increment here, inside the same
      // staged mutation, so the write is real and the caller's fallback is
      // satisfied (the item's stack is increased by `quantity`).
      if (addResult.added === false) {
        const items = await listInventoryItemsGvas(resolveKey(req));
        const current = items.find(item => item.name === itemId);
        const currentQty = current ? current.quantity : 0;
        return updateInventoryItemGvas(resolveKey(req), itemId, currentQty + quantity, sourceMap);
      }
      return addResult;
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

// Catalog of addable items (based on the 100% reference save), enriched with
// the player's current holdings so the UI can show "already have N".
router.get('/inventory/catalog', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const catalogPath = path.join(__dirname, '..', 'public', 'catalog.json');
    let catalog = {};
    try { catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')); } catch {}
    let have = {};
    try {
      const items = await listInventoryItemsGvas(resolveKey(req));
      have = Object.fromEntries(items.map(i => [i.name, i.quantity]));
    } catch {}
    const entries = Object.entries(catalog).map(([id, meta]) => ({
      id,
      wiki: meta.wiki || id,
      category: meta.category || '',
      top: meta.top || 'Loot',
      taxonomyGroup: meta.taxonomyGroup || meta.top || 'Loot',
      taxonomyType: meta.taxonomyType || null,
      taxonomySubtype: meta.taxonomySubtype || null,
      taxonomyTags: Array.isArray(meta.taxonomyTags) ? meta.taxonomyTags : [],
      inventoryMap: meta.inventoryMap || null,
      internalTag: meta.internalTag || null,
      imageFile: meta.imageFile || null,
      imageUrl: meta.imageUrl || null,
      wikiPage: meta.wikiPage || null,
      wikiUrl: meta.wikiUrl || null,
      matchConfidence: Number.isFinite(meta.matchConfidence) ? meta.matchConfidence : 0,
      reviewed: meta.reviewed === true,
      description: meta.description || null,
      buffs: meta.buffs || null,
      debuffs: meta.debuffs || null,
      have: have[id] != null ? have[id] : 0
    }));
    res.json(entries);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/currencies', async (req, res) => {
  try {
    const currencies = await getCurrencies(resolveKey(req));
    res.json(currencies);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.put('/currencies/:rowName', async (req, res) => {
  try {
    const { amount } = req.body || {};
    if (amount == null) {
      return res.status(400).json({ error: 'amount is required' });
    }
    const result = await runMutation(req, 'currency', () => setCurrency(resolveKey(req), req.params.rowName, amount));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const data = await getDashboardData(resolveKey(req));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

// Read-only lifetime/combat/progression stats (see getPlayerStats() in
// saveService.js for the full field breakdown).
router.get('/stats', async (req, res) => {
  try {
    const data = await getPlayerStats(resolveKey(req));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.get('/repair', async (req, res) => {
  try {
    const data = await getRepairStatus(resolveKey(req));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

router.post('/repair/collect', async (req, res) => {
  try {
    const result = await runMutation(req, 'repair-collect', () => collectRepair(resolveKey(req)));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

// EXPERIMENTAL: mark a quest ready to turn in (sets Quests.Status = 2).
router.post('/quests/:id/ready', async (req, res) => {
  try {
    const result = await runMutation(req, 'quest-ready', () => setQuestReady(resolveKey(req), req.params.id));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});

module.exports = router;

