'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createE2EContext } = require('./helpers/e2e-harness');
const saveService = require('../../services/saveService');
const gvasService = require('../../services/gvasService');
const weaponBuildService = require('../../services/weaponBuildService');
const backupService = require('../../services/backupService');

// B1/B2 + C1/C2/C3: drives the REAL services (saveService, gvasService,
// weaponBuildService) against an isolated copy of the live save. The real
// mutation pipeline runs end-to-end on the actual sqlite3mc/uesave toolchain.
// Nothing here touches the live save directory.

test('C2: listInventoryItems reads real inventory and findMapsForItem locates a known drone', async t => {
  const ctx = await createE2EContext(t);
  const items = await gvasService.listInventoryItems(ctx.key);
  assert.ok(Array.isArray(items) && items.length > 0);
  const construction = items.find(i => i.id === 'Drone_Construction' || (i.name && i.name.includes('Construction')));
  assert.ok(construction, 'expected a Construction drone in the live-derived inventory');

  // findMapsForItem is exercised indirectly via listInventoryItems (the recent
  // INVENTORY_MAPS fix resolves the real blob property keys). Assert each item
  // carries the structured projection fields.
  for (const item of items) {
    assert.ok(typeof item.sourceMap === 'string');
    assert.ok(typeof item.quantity === 'number');
  }
});

test('C1/B1: setCurrency writes through the real mutation pipeline and passes integrity', async t => {
  const ctx = await createE2EContext(t);
  const before = await saveService.getCurrencies(ctx.key);
  assert.ok(typeof before.WaterBarrels === 'number', 'WaterBarrels currency row must exist');
  const newValue = before.WaterBarrels === 12345 ? 12346 : 12345;

  const receipt = await saveService.setCurrency(ctx.key, 'WaterBarrels', newValue);
  assert.equal(receipt.afterIntegrity.passed, true, 'installed save must pass integrity');
  assert.ok(receipt.success === true);

  const after = await saveService.getCurrencies(ctx.key);
  assert.equal(after.WaterBarrels, newValue);
});

test('B1: backup + restore round-trips the primary byte-for-byte on the real toolchain', async t => {
  const ctx = await createE2EContext(t);
  const primary = require('node:path').join(ctx.saveDir, '0002524f464349c086ad775367f0b95a.dat');
  const beforeHash = crypto.createHash('sha256').update(await require('node:fs/promises').readFile(primary)).digest('hex');

  const backup = await backupService.createBackup('e2e-restore-test', { liveSaveDir: ctx.saveDir, backupRoot: ctx.backupRoot, isGameRunning: async () => false });
  // Mutate the live primary, then restore from the backup and confirm it matches.
  await saveService.setCurrency(ctx.key, 'WaterBarrels', 999);

  const result = await backupService.restoreBackup(backup.id, `RESTORE ${backup.id}`, {
    liveSaveDir: ctx.saveDir,
    backupRoot: ctx.backupRoot,
    isGameRunning: async () => false,
    validatePrimary: async dbPath => {
      const validation = require('../../utils/validation');
      const [integrity, foreignKeys] = await Promise.all([
        validation.runIntegrityCheck(dbPath, ctx.key),
        validation.validateForeignKeys(dbPath, ctx.key)
      ]);
      if (!integrity.passed) throw Object.assign(new Error('Restored database failed integrity'), { status: 422, integrity });
      if (foreignKeys.errors !== 0) throw Object.assign(new Error('Restored database failed FK check'), { status: 422, foreignKeys });
    }
  });
  assert.deepEqual(result.restoredFiles, ['0002524f464349c086ad775367f0b95a.dat']);

  const afterHash = crypto.createHash('sha256').update(await require('node:fs/promises').readFile(primary)).digest('hex');
  assert.equal(afterHash, beforeHash, 'restore must reproduce the pre-backup primary exactly');
});

test('C3: weaponBuildService.addBuildPart writes a trusted BIS part to inventory', async t => {
  const ctx = await createE2EContext(t);
  const data = require('../../data/weapon-builds.canonical.json');
  const weapon = data.weapons.find(w => w.name === 'AK');
  assert.ok(weapon, 'AK build must exist in canonical data');
  const part = weaponBuildService.selectBuild(weapon).parts[0];
  assert.ok(['Weapons', 'Items'].includes(part.inventoryMap), 'BIS part must map to a writable inventory map');

  const receipt = await weaponBuildService.addBuildPart(ctx.key, weapon.id, part.itemId);
  assert.equal(receipt.afterIntegrity.passed, true);
  assert.equal(receipt.afterFk.errors, 0);
  assert.ok(receipt.added.includes(part.itemId), `expected BIS part ${part.itemId} in the added set`);
});

test('C3: addBuildPart fails closed on an unknown part id', async t => {
  const ctx = await createE2EContext(t);
  const data = require('../../data/weapon-builds.canonical.json');
  const weapon = data.weapons.find(w => w.name === 'AK');
  await assert.rejects(() => weaponBuildService.addBuildPart(ctx.key, weapon.id, '../Escape'), /Invalid partId|not in the trusted BIS build/);
});
