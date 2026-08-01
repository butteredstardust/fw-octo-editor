// gvasService.js
// Facade over the domain modules in services/gvas/*. Kept as a single entry
// point so existing require('./services/gvasService') call sites across
// routes/, other services/, scripts/, and test/ do not need to change.
//
// NOTE: saveService requires gvasService (circular dep), so several gvas/*
// modules require saveService lazily inside functions rather than at module
// load time -- see services/gvas/inventory-write.js and services/gvas/rigs.js.
const { UESAVE_BIN, readTempInventoryBlob, writeTempInventoryBlob, readNamedBlobJson, requireByteIdenticalRoundTrip } = require('./gvas/codec');
const {
  listInventoryItems,
  readAllMaps,
  checkInventoryRoundTrip,
  normalizeTopLevelProperty,
  extractItems,
  normalizeItems
} = require('./gvas/inventory-read');
const {
  updateInventoryItem,
  addInventoryItem,
  ensureInventoryItems,
  validateInventoryInput,
  findMapsForItem,
  resolveUpdateTargets
} = require('./gvas/inventory-write');
const { getVaultInventory } = require('./gvas/vault');
const {
  listRigs,
  addRigOwnership,
  addHighQualityContainerSet,
  getRigCatalog,
  applyRigOwnershipToProps,
  applyHighQualitySetToProps
} = require('./gvas/rigs');

module.exports = {
  UESAVE_BIN,
  listInventoryItems,
  getVaultInventory,
  readAllMaps,
  listRigs,
  addRigOwnership,
  addHighQualityContainerSet,
  updateInventoryItem,
  addInventoryItem,
  ensureInventoryItems,
  readTempInventoryBlob,
  writeTempInventoryBlob,
  readNamedBlobJson,
  requireByteIdenticalRoundTrip,
  checkInventoryRoundTrip,
  validateInventoryInput,
  normalizeTopLevelProperty,
  getRigCatalog,
  applyRigOwnershipToProps,
  applyHighQualitySetToProps,
  extractItems,
  normalizeItems,
  findMapsForItem,
  resolveUpdateTargets
};
