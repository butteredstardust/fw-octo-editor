const { runShell } = require('../../utils/validation');
const gvasService = require('../gvasService');
const { getSavePaths } = require('./paths');
const { requireChangedRows } = require('./validators');
const { withWriteReceipt } = require('./receipt');
const { ticksToDate, dateToTicks } = require('./constants');

// Faction IFF chips (LVL1-3 for each of the 3 factions) used to repair destroyed
// weapons of that faction. Required to repair: the matching destroyed weapon's IFF.
const IFF_TAGS = [
  'IFF_Eurasia_01', 'IFF_Eurasia_02', 'IFF_Eurasia_03',
  'IFF_Europa_01', 'IFF_Europa_02', 'IFF_Europa_03',
  'IFF_Euruskan_01', 'IFF_Euruskan_02', 'IFF_Euruskan_03'
];

async function getRepairStatus(key) {
  const dbPath = getSavePaths()[0];

  // Active repair job timer.
  const teRows = await runShell(dbPath, key, [
    `SELECT Name, NextOccurrence, Period, RepeatCount FROM TimedEvents WHERE Name = 'Recipe.RepairWeapon' LIMIT 1`
  ]);
  let repair = null;
  if (teRows.length) {
    const [name, next, period, repeat] = teRows[0].split('|');
    const ticks = parseInt(next, 10) || 0;
    const completion = ticksToDate(ticks);
    const now = Date.now();
    // A past completion time means the repair is already done and the item is
    // ready for the player to collect from the bench. A future time means the
    // job is still running on its timer.
    const ready = ticks > 0 && completion.getTime() <= now;
    repair = {
      name,
      rawTicks: ticks,
      completionIso: completion.toISOString(),
      period: parseInt(period, 10) || 0,
      repeatCount: parseInt(repeat, 10) || 0,
      active: !ready,
      ready,
      remainingMs: completion.getTime() - now
    };
  }

  // Repair Bench upgrade (terminal gate).
  const benchRows = await runShell(dbPath, key, [
    `SELECT UpgradeTag, Permanent FROM PlayerUpgrades WHERE UpgradeTag = 'Hub.Upgrade.Category.Crafting.WeaponRepairs' LIMIT 1`
  ]);
  const benchUnlocked = benchRows.length > 0;

  // Faction IFF chips on hand (from TempInventory blob). A repair only needs
  // the IFF of the destroyed weapon's origin faction; this shows what you have.
  const items = await gvasService.listInventoryItems(key);
  const inv = {};
  for (const it of items) inv[it.name] = it.quantity;

  const iffs = IFF_TAGS.map(tag => ({ tag, quantity: inv[tag] != null ? inv[tag] : 0 }));

  // On-hand counts of every destroyed-weapon counterpart the bench can repair.
  // Driven by the same recipe list the frontend uses to render cards.
  const DESTROYED_TAGS = [
    'GRL01_Broken', 'GRL02_Broken', 'HMG01_Broken', 'HRF01_Broken', 'HRF02_REAL_Broken',
    'HRF03_Broken', 'HRF04_Broken', 'LMG01_Broken', 'LMG02_Broken', 'LMG03_Broken',
    'LMG04_Broken', 'PST01_Broken', 'PST02_Broken', 'PST03_Broken', 'PST04_Broken',
    'PST05_Broken', 'PST06_Broken', 'PST07_Broken', 'PST10_Broken', 'RFL01_Broken',
    'RFL01B_Broken', 'RFL12_Broken', 'RFL15_Broken', 'RFL16_Broken', 'RFL19_Broken',
    'RFL20_Broken', 'RFL23_Broken', 'RFL29_Broken', 'RFL30_Broken', 'SHG01_Broken',
    'SHG03_Broken', 'SHG04_Broken', 'SHG05_Broken', 'SMG01_Broken', 'SMG02_Broken',
    'SMG03_Broken', 'SMG04_Broken', 'SMG05_Broken', 'SMG06_Broken', 'SMG07_Broken',
    'SMG08_Broken'
  ];
  const destroyed = {};
  for (const tag of DESTROYED_TAGS) destroyed[tag] = inv[tag] != null ? inv[tag] : 0;

  return { repair, benchUnlocked, iffs, destroyed };
}

// Mark the active repair as finished now: set its TimedEvents.NextOccurrence
// to the current time so it reads as "ready to collect" instead of still
// counting down. Does NOT delete the row (the game expects the record to exist
// once a repair has been started).
async function collectRepair(key) {
  const dbPath = getSavePaths()[0];

  return withWriteReceipt(dbPath, key, async () => {
    const nowTicks = dateToTicks(new Date());
    const mutation = await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      `UPDATE TimedEvents SET NextOccurrence = ${nowTicks} WHERE Name = 'Recipe.RepairWeapon'`,
      `SELECT changes()`,
      `COMMIT`
    ]);
    const changedRows = requireChangedRows(mutation[0], 1, 'Repair collection update');
    const verified = await runShell(dbPath, key, [`SELECT NextOccurrence FROM TimedEvents WHERE Name = 'Recipe.RepairWeapon'`]);
    if (verified.length !== 1 || verified[0].trim() !== String(nowTicks)) throw Object.assign(new Error('Repair collection verification failed'), { status: 422 });

    return {
      changedRows,
      targetVerification: { name: 'Recipe.RepairWeapon', nextOccurrence: nowTicks, passed: true }
    };
  });
}

module.exports = {
  getRepairStatus,
  collectRepair
};
