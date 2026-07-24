'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createE2EContext } = require('./helpers/e2e-harness');
const saveService = require('../../services/saveService');
const gvasService = require('../../services/gvasService');
const weaponBuildService = require('../../services/weaponBuildService');
const backupService = require('../../services/backupService');
const binaryParser = require('../../services/binaryParser');

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
  // Picks a genuinely-missing part dynamically rather than always AK's parts[0]:
  // a save that already owns that specific part (e.g. from earlier play, or a
  // prior structured write) would otherwise make this fail closed on "All
  // recommended parts are already owned" for reasons unrelated to what this
  // test actually checks.
  const builds = await weaponBuildService.listBuilds(ctx.key);
  let target = null;
  for (const weapon of builds.weapons) {
    const missing = weapon.build.parts.find(part => part.missing);
    if (missing) { target = { weaponId: weapon.id, part: missing }; break; }
  }
  if (!target) { t.skip('no weapon in this save has a missing BIS part to test with'); return; }
  assert.ok(['Weapons', 'Items'].includes(target.part.inventoryMap), 'BIS part must map to a writable inventory map');

  const receipt = await weaponBuildService.addBuildPart(ctx.key, target.weaponId, target.part.itemId);
  assert.equal(receipt.afterIntegrity.passed, true);
  assert.equal(receipt.afterFk.errors, 0);
  assert.ok(receipt.added.includes(target.part.itemId), `expected BIS part ${target.part.itemId} in the added set`);
});

test('C3: addBuildPart fails closed on an unknown part id', async t => {
  const ctx = await createE2EContext(t);
  const data = require('../../data/weapon-builds.canonical.json');
  const weapon = data.weapons.find(w => w.name === 'AK');
  await assert.rejects(() => weaponBuildService.addBuildPart(ctx.key, weapon.id, '../Escape'), /Invalid partId|not in the trusted BIS build/);
});

// C4: adding a BIS part must also register it in KnownItems (the game's
// "discovered attachments" list) -- see the ensureInventoryItems() comment
// in gvasService.js. Picks a genuinely-missing part dynamically (rather than
// always index [0]) so this doesn't depend on which parts a given save
// already owns.
test('C4: ensureInventoryItems registers an added weapon part in KnownItems', async t => {
  const ctx = await createE2EContext(t);
  const builds = await weaponBuildService.listBuilds(ctx.key);
  let target = null;
  for (const weapon of builds.weapons) {
    const missing = weapon.build.parts.find(part => part.missing);
    if (missing) { target = { weaponId: weapon.id, part: missing }; break; }
  }
  if (!target) { t.skip('no weapon in this save has a missing BIS part to test with'); return; }

  const beforeKnown = await gvasService.readNamedBlobJson(ctx.key, 'KnownItems');
  assert.ok(!beforeKnown.root.properties.KnownItems_0.some(e => e.RowName_0 === target.part.itemId), 'part must not already be known, or this test proves nothing');

  const receipt = await weaponBuildService.addBuildPart(ctx.key, target.weaponId, target.part.itemId);
  assert.equal(receipt.afterIntegrity.passed, true);
  assert.ok(receipt.knownItemsAdded.includes(target.part.itemId), 'expected the added part in knownItemsAdded');

  const afterKnown = await gvasService.readNamedBlobJson(ctx.key, 'KnownItems');
  assert.ok(afterKnown.root.properties.KnownItems_0.some(e => e.RowName_0 === target.part.itemId), 'part must appear in KnownItems after the write');
});

// C5: the base weapon itself must NOT be registered in KnownItems -- only
// parts (ItemDetailsData/sourceMap 'Items') were ever observed there in a
// real save; base weapons (Base Weapons/Damaged Weapons sourceMap) never are.
test('C5: addMissingWithWeapon does not register the base weapon in KnownItems', async t => {
  const ctx = await createE2EContext(t);
  const builds = await weaponBuildService.listBuilds(ctx.key);
  const target = builds.weapons.find(weapon => !weapon.weaponOwned && weapon.build.parts.some(part => part.missing));
  if (!target) { t.skip('no unowned weapon with a missing part to test with'); return; }

  const receipt = await weaponBuildService.addMissingWithWeapon(ctx.key, target.id);
  assert.ok(receipt.added.includes(target.id), 'expected the base weapon itself in added');
  assert.ok(!receipt.knownItemsAdded.includes(target.id), 'base weapon must not be registered in KnownItems');

  const afterKnown = await gvasService.readNamedBlobJson(ctx.key, 'KnownItems');
  assert.ok(!afterKnown.root.properties.KnownItems_0.some(e => e.RowName_0 === target.id), 'base weapon must not appear in KnownItems after the write');
});

// C6: the structural fallback parser (binaryParser.js, used only when uesave
// is unavailable) must produce results identical to the real uesave-based
// path on real save data -- not just on synthetic fixtures. Cross-validates
// every entry across all three inventory maps against uesave's own JSON
// output, the same way the parser's byte format was originally verified.
test('C6: binaryParser fallback matches the real uesave-based inventory read exactly', async t => {
  const ctx = await createE2EContext(t);
  const blob = await gvasService.readTempInventoryBlob(ctx.key);
  const { items, errors } = binaryParser.parseInventoryBlob(blob);
  assert.equal(errors.length, 0, `expected zero structural parse errors, got: ${JSON.stringify(errors.slice(0, 5))}`);
  assert.ok(items.length > 0);

  const fallbackMerged = gvasService.normalizeItems(items);
  const primary = await gvasService.listInventoryItems(ctx.key);

  const primaryByName = new Map(primary.map(i => [i.name, i]));
  const fallbackByName = new Map(fallbackMerged.map(i => [i.name, i]));
  assert.equal(fallbackByName.size, primaryByName.size, 'fallback and primary must report the same number of unique items');
  for (const [name, expected] of primaryByName) {
    const actual = fallbackByName.get(name);
    assert.ok(actual, `fallback is missing item ${name}`);
    assert.equal(actual.quantity, expected.quantity, `quantity mismatch for ${name}`);
    assert.equal(actual.sourceMap, expected.sourceMap, `sourceMap mismatch for ${name}`);
  }
});
