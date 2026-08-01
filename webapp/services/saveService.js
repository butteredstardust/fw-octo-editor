// saveService.js
// Facade over the domain modules in services/save/*. Kept as a single entry
// point so existing require('./services/saveService') call sites across
// routes/, other services/, scripts/, and test/ do not need to change.
const { toNumber, toInteger, sqlStr, requireChangedRows } = require('./save/validators');
const { getPrimarySavePath, getSchema, getFileHashes } = require('./save/paths');
const {
  listCharacters,
  updateCharacterLevel,
  setPrestige,
  listCharacterDetails,
  setCharacterXp,
  setCharacterSkills
} = require('./save/characters');
const { listHubUpgrades, setHubUpgrades } = require('./save/hub');
const {
  listWeaponXp,
  setWeaponXp,
  batchSetWeaponXp,
  getReferenceWeaponXp
} = require('./save/weapons');
const {
  listFactionScores,
  setFactionScore,
  listTraderUnlocks,
  setTraderUnlock,
  getVendorEconomy
} = require('./save/vendors');
const { getCurrencies, setCurrency } = require('./save/currencies');
const { getDashboardData, searchInventory, setQuestReady } = require('./save/dashboard');
const { getRepairStatus, collectRepair } = require('./save/repair');
const { getPlayerStats } = require('./save/stats');

module.exports = {
  toNumber,
  toInteger,
  sqlStr,
  requireChangedRows,
  getPlayerStats,
  getSchema,
  getPrimarySavePath,
  listCharacters,
  updateCharacterLevel,
  setPrestige,
  listCharacterDetails,
  setCharacterXp,
  setCharacterSkills,
  listHubUpgrades,
  setHubUpgrades,
  listWeaponXp,
  setWeaponXp,
  batchSetWeaponXp,
  getReferenceWeaponXp,
  listFactionScores,
  setFactionScore,
  listTraderUnlocks,
  setTraderUnlock,
  getVendorEconomy,
  searchInventory,
  getFileHashes,
  getDashboardData,
  getCurrencies,
  setCurrency,
  getRepairStatus,
  collectRepair,
  setQuestReady
};
