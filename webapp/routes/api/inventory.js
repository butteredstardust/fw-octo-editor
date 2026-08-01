const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { listInventoryItems: listInventoryItemsGvas, updateInventoryItem: updateInventoryItemGvas, addInventoryItem: addInventoryItemGvas } = require('../../services/gvasService');
const { listRigs, addRigOwnership, addHighQualityContainerSet, getVaultInventory } = require('../../services/gvasService');
const { resolveKey, runMutation } = require('../lib/context');
const { handle, handleMutation } = require('../lib/handler');

router.get('/inventory', handle(async (req, res) => {
  const items = await listInventoryItemsGvas(resolveKey(req));
  res.json(items);
}));

// The Vault (home stash) is a separate GVAS blob from TempInventory -- read
// only, no write support yet (see getVaultInventory() in gvasService.js).
router.get('/vault', handle(async (req, res) => {
  const vault = await getVaultInventory(resolveKey(req));
  res.json(vault);
}));

router.get('/rigs', handle(async (req, res) => {
  res.json(await listRigs(resolveKey(req)));
}));

router.post('/rigs/:rigId/add', handleMutation('rig-ownership', req => addRigOwnership(resolveKey(req), req.params.rigId)));

router.post('/rigs/:rigId/high-quality-set', handleMutation('rig-high-quality-containers', req => addHighQualityContainerSet(resolveKey(req), req.params.rigId)));

router.get('/inventory/search', handle(async (req, res) => {
  const { q } = req.query;
  const items = await listInventoryItemsGvas(resolveKey(req));
  const filtered = q
    ? items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()))
    : items;
  res.json(filtered);
}));

router.post('/inventory/update', handleMutation('inventory-update', req => {
  const { itemId, quantity, sourceMap } = req.body;
  return updateInventoryItemGvas(resolveKey(req), itemId, quantity, sourceMap);
}));

// Add a brand-new item row to the inventory (experimental; see AGENTS.md).
router.post('/inventory/add', handle(async (req, res) => {
  const { itemId, quantity, sourceMap } = req.body;
  if (!itemId || quantity == null) {
    return res.status(400).json({ error: 'itemId and quantity are required' });
  }
  const result = await runMutation(req, 'inventory-add', () => addInventoryItemGvas(resolveKey(req), itemId, quantity, sourceMap));
  res.json(result);
}));

// Catalog of addable items (based on the 100% reference save), enriched with
// the player's current holdings so the UI can show "already have N".
router.get('/inventory/catalog', handle(async (req, res) => {
  const catalogPath = path.join(__dirname, '..', '..', 'public', 'catalog.json');
  let catalog;
  try { catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')); }
  catch (error) { throw Object.assign(new Error(`Inventory catalog could not be read: ${error.message}`), { status: 503 }); }
  const items = await listInventoryItemsGvas(resolveKey(req));
  const have = Object.fromEntries(items.map(i => [i.name, i.quantity]));
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
}));

module.exports = router;
