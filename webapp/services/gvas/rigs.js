// rigs.js
// Rig ownership + high-quality container set writes against the same
// TempInventory blob inventory.js edits (Rigs_0 / Containers_0 maps).

const { runIntegrityCheck, validateForeignKeys } = require('../../utils/validation');
const rigCatalogData = require('../../data/rigs.json');
const { getSavePaths } = require('./paths');
const { MAX_INVENTORY_QUANTITY } = require('./constants');
const {
  readTempInventoryBlob,
  writeTempInventoryBlob,
  blobToJson,
  jsonToBlob,
  requireByteIdenticalRoundTrip
} = require('./codec');

const RIG_DATA_TABLE = '/Game/Blueprints/Data/BackpackRigDataV2.BackpackRigDataV2';
const CONTAINER_DATA_TABLE = '/Game/Blueprints/Data/InventoryContainerData.InventoryContainerData';

function getRigCatalog() {
  return rigCatalogData.rigs.map(rig => ({
    ...rig,
    slots: { ...rig.slots },
    compatibleCharacters: [...rig.compatibleCharacters],
    highQualityContainers: [...rig.highQualityContainers]
  }));
}

function getRigDefinition(rigId) {
  if (typeof rigId !== 'string' || !rigId || /[\0\r\n]/.test(rigId)) {
    throw Object.assign(new Error('rigId must be non-empty text without control characters'), { status: 400 });
  }
  const rig = rigCatalogData.rigs.find(candidate => candidate.id === rigId);
  if (!rig) throw Object.assign(new Error('Unknown rigId'), { status: 400 });
  return rig;
}

function requireRigMaps(props) {
  if (!props || !Array.isArray(props.Rigs_0)) {
    throw Object.assign(new Error('TempInventory Rigs_0 has an unsupported shape'), { status: 422 });
  }
  if (!Array.isArray(props.Containers_0)) {
    throw Object.assign(new Error('TempInventory Containers_0 has an unsupported shape'), { status: 422 });
  }
  if (!props.Containers_0.every(entry => entry && typeof entry === 'object' && Object.hasOwn(entry, 'key') && entry.value && typeof entry.value === 'object')) {
    throw Object.assign(new Error('TempInventory Containers_0 entries have an unsupported shape'), { status: 422 });
  }
  return props;
}

function ownedRigIds(props) {
  requireRigMaps(props);
  return new Set(props.Rigs_0.map(handle => handle && (handle.RowName_0 || handle.RowName)).filter(Boolean));
}

function containerQuantities(props) {
  requireRigMaps(props);
  const quantities = new Map();
  for (const entry of props.Containers_0) {
    const id = (entry.value.DefaultContainerRow_0 || entry.value.DefaultContainerRow || {}).RowName_0 || entry.key;
    const quantity = entry.value.Quantity_0 != null ? entry.value.Quantity_0 : entry.value.Quantity;
    if (typeof id === 'string' && Number.isSafeInteger(quantity)) quantities.set(id, (quantities.get(id) || 0) + quantity);
  }
  return quantities;
}

function applyRigOwnershipToProps(props, rigId) {
  const rig = getRigDefinition(rigId);
  requireRigMaps(props);
  if (ownedRigIds(props).has(rigId)) throw Object.assign(new Error(`${rig.name} is already owned`), { status: 409 });
  props.Rigs_0.push({ DataTable_0: RIG_DATA_TABLE, RowName_0: rigId });
  return rig;
}

function applyHighQualitySetToProps(props, rigId) {
  const rig = getRigDefinition(rigId);
  requireRigMaps(props);
  const before = containerQuantities(props);
  const changes = [];
  for (const containerId of rig.highQualityContainers) {
    let entry = props.Containers_0.find(candidate => candidate.key === containerId ||
      ((candidate.value.DefaultContainerRow_0 || candidate.value.DefaultContainerRow || {}).RowName_0 === containerId));
    const previous = before.get(containerId) || 0;
    if (previous >= MAX_INVENTORY_QUANTITY) {
      throw Object.assign(new Error(`${containerId} is already at the maximum quantity`), { status: 400 });
    }
    if (!entry) {
      entry = {
        key: containerId,
        value: {
          DefaultContainerRow_0: { DataTable_0: CONTAINER_DATA_TABLE, RowName_0: containerId },
          Quantity_0: 1
        }
      };
      props.Containers_0.push(entry);
    } else if (entry.value.Quantity_0 != null) {
      entry.value.Quantity_0 += 1;
    } else if (entry.value.Quantity != null) {
      entry.value.Quantity += 1;
    } else {
      entry.value.Quantity_0 = 1;
    }
    changes.push({ containerId, before: previous, after: previous + 1 });
  }
  return { rig, changes };
}

async function listRigs(key) {
  const blob = await readTempInventoryBlob(key);
  const json = await blobToJson(blob);
  const props = json && json.root && json.root.properties;
  requireRigMaps(props);
  const owned = ownedRigIds(props);
  const quantities = containerQuantities(props);
  const rigs = getRigCatalog().map(rig => ({
    ...rig,
    owned: owned.has(rig.id),
    highQualityContainerSet: rig.highQualityContainers.map(containerId => ({
      containerId,
      quantity: quantities.get(containerId) || 0
    }))
  }));
  return {
    schemaVersion: rigCatalogData.schemaVersion,
    sources: rigCatalogData.sources,
    ownedCount: rigs.filter(rig => rig.owned).length,
    totalCount: rigs.length,
    rigs
  };
}

async function writeRigMutation(key, mutateProps, verifyProps) {
  const getHashes = () => require('../saveService').getFileHashes();
  const dbPath = getSavePaths()[0];
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = await validateForeignKeys(dbPath, key);
  const beforeHashes = await getHashes();
  const blob = await readTempInventoryBlob(key);
  const json = await requireByteIdenticalRoundTrip(blob);
  const props = json && json.root && json.root.properties;
  requireRigMaps(props);
  const result = mutateProps(props);
  const newBlob = await jsonToBlob(json);
  await writeTempInventoryBlob(key, newBlob);
  const installedBlob = await readTempInventoryBlob(key);
  if (!installedBlob.equals(newBlob)) throw Object.assign(new Error('TempInventory blob installation verification failed'), { status: 422 });
  const installedJson = await blobToJson(installedBlob);
  const installedProps = installedJson && installedJson.root && installedJson.root.properties;
  requireRigMaps(installedProps);
  const targetVerification = verifyProps(installedProps, result);
  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = await validateForeignKeys(dbPath, key);
  const afterHashes = await getHashes();
  return { result, targetVerification, beforeIntegrity, afterIntegrity, beforeFk, afterFk, beforeHashes, afterHashes };
}

async function addRigOwnership(key, rigId) {
  const rig = getRigDefinition(rigId);
  const mutation = await writeRigMutation(key,
    props => applyRigOwnershipToProps(props, rigId),
    props => {
      const matches = props.Rigs_0.filter(handle => (handle.RowName_0 || handle.RowName) === rigId).length;
      if (matches !== 1) throw Object.assign(new Error(`Rig ownership verification found ${matches}; expected 1`), { status: 422 });
      return { passed: true, byteRoundTrip: true, rigId, owned: true, entries: matches };
    });
  return {
    success: mutation.afterIntegrity.passed,
    added: true,
    rigId,
    rigName: rig.name,
    changedRows: 1,
    targetVerification: mutation.targetVerification,
    beforeIntegrity: mutation.beforeIntegrity,
    afterIntegrity: mutation.afterIntegrity,
    beforeFk: mutation.beforeFk,
    afterFk: mutation.afterFk,
    beforeHashes: mutation.beforeHashes,
    afterHashes: mutation.afterHashes,
    warnings: ['Structured rig ownership writes are experimental until confirmed in-game.']
  };
}

async function addHighQualityContainerSet(key, rigId) {
  const rig = getRigDefinition(rigId);
  const mutation = await writeRigMutation(key,
    props => applyHighQualitySetToProps(props, rigId),
    (props, result) => {
      const installed = containerQuantities(props);
      for (const change of result.changes) {
        if (installed.get(change.containerId) !== change.after) {
          throw Object.assign(new Error(`Container verification failed for ${change.containerId}`), { status: 422 });
        }
      }
      return { passed: true, byteRoundTrip: true, rigId, containers: result.changes };
    });
  return {
    success: mutation.afterIntegrity.passed,
    rigId,
    rigName: rig.name,
    setSize: rig.highQualityContainers.length,
    containers: mutation.result.changes,
    changedRows: 1,
    targetVerification: mutation.targetVerification,
    beforeIntegrity: mutation.beforeIntegrity,
    afterIntegrity: mutation.afterIntegrity,
    beforeFk: mutation.beforeFk,
    afterFk: mutation.afterFk,
    beforeHashes: mutation.beforeHashes,
    afterHashes: mutation.afterHashes,
    warnings: ['Structured rig container writes are experimental until confirmed in-game.']
  };
}

module.exports = {
  getRigCatalog,
  applyRigOwnershipToProps,
  applyHighQualitySetToProps,
  listRigs,
  addRigOwnership,
  addHighQualityContainerSet
};
