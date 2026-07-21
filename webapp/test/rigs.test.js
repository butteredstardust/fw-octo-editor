const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTopLevelProperty,
  getRigCatalog,
  applyRigOwnershipToProps,
  applyHighQualitySetToProps
} = require('../services/gvasService');

function propsFixture() {
  return {
    Rigs_0: [{ DataTable_0: 'rig-table', RowName_0: 'RIGBUILDS_01_Default_Small' }],
    Containers_0: [{
      key: 'BP_TopLarge_3_C',
      value: {
        DefaultContainerRow_0: { DataTable_0: 'container-table', RowName_0: 'BP_TopLarge_3_C' },
        Quantity_0: 4
      }
    }],
    Frames_0: []
  };
}

test('rig catalog has all unique reference rigs and complete HQ presets', () => {
  const rigs = getRigCatalog();
  assert.equal(rigs.length, 11);
  assert.equal(new Set(rigs.map(rig => rig.id)).size, 11);
  for (const rig of rigs) {
    assert.equal(rig.highQualityContainers.length, rig.slots.large + rig.slots.medium + rig.slots.small);
    assert.equal(new Set(rig.highQualityContainers).size, rig.highQualityContainers.length);
    for (const id of rig.highQualityContainers) assert.match(id, /^BP_.+(Large|Medium|Small)_3_C$/);
  }
});

test('top-level map normalization preserves row-handle arrays and scalars', () => {
  const rigs = [{ DataTable_0: 'table', RowName_0: 'rig' }];
  const map = [{ key: 'a', value: { Quantity_0: 1 } }];
  assert.deepEqual(normalizeTopLevelProperty(rigs), rigs);
  assert.deepEqual(normalizeTopLevelProperty(map), map);
  assert.equal(normalizeTopLevelProperty('/Engine/Transient.GameInstance'), '/Engine/Transient.GameInstance');
});

test('adding rig ownership appends the exact row handle and rejects duplicates', () => {
  const props = propsFixture();
  const id = 'RIGBUILDS_02_Medim_MoreContainers';
  applyRigOwnershipToProps(props, id);
  assert.equal(props.Rigs_0.at(-1).RowName_0, id);
  assert.equal(props.Rigs_0.at(-1).DataTable_0, '/Game/Blueprints/Data/BackpackRigDataV2.BackpackRigDataV2');
  assert.throws(() => applyRigOwnershipToProps(props, id), error => error.status === 409);
  assert.throws(() => applyRigOwnershipToProps(props, 'unknown-rig'), error => error.status === 400);
});

test('HQ set increments existing containers and inserts missing exact entries', () => {
  const props = propsFixture();
  const result = applyHighQualitySetToProps(props, 'RIGBUILDS_02_Medim_MoreContainers');
  assert.equal(result.changes.length, 4);
  for (const change of result.changes) {
    assert.equal(change.before, 0);
    assert.equal(change.after, 1);
    const entry = props.Containers_0.find(candidate => candidate.key === change.containerId);
    assert.equal(entry.value.Quantity_0, 1);
    assert.equal(entry.value.DefaultContainerRow_0.RowName_0, change.containerId);
  }

  const standard = applyHighQualitySetToProps(props, 'RIGBUILDS_01_Default_Small');
  assert.deepEqual(standard.changes, [{ containerId: 'BP_TopLarge_3_C', before: 4, after: 5 }]);
  assert.equal(props.Containers_0.find(entry => entry.key === 'BP_TopLarge_3_C').value.Quantity_0, 5);
  assert.deepEqual(props.Frames_0, []);
});

test('rig mutations fail closed on malformed maps and quantity overflow', () => {
  assert.throws(() => applyHighQualitySetToProps({ Rigs_0: [], Containers_0: {} }, 'RIGBUILDS_01_Default_Small'), error => error.status === 422);
  const props = propsFixture();
  props.Containers_0[0].value.Quantity_0 = 2147483647;
  assert.throws(() => applyHighQualitySetToProps(props, 'RIGBUILDS_01_Default_Small'), error => error.status === 400);
});
