const { runShell } = require('../../utils/validation');
const { getSavePaths } = require('./paths');
const { sqlStr, toInteger, requireChangedRows } = require('./validators');
const { withWriteReceipt } = require('./receipt');
const { ticksToDate } = require('./constants');

// Vendor trust is stored as a continuous FactionScore per faction (the wiki's
// Untrusted/Neutral/Trusted tiers are derived from this at runtime). We read the
// canonical DataWindow.Persistent row and ignore the duplicate TugOfWar row.
async function listFactionScores(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT ns.Name, sc.Value FROM ScopedCounterValues sc
     JOIN Names ns ON ns.NameID = sc.ScopeID
     JOIN Names nw ON nw.NameID = sc.WindowID
     JOIN Names nc ON nc.NameID = sc.CounterID
     WHERE nc.Name = 'Counter.FactionScore'
       AND nw.Name = 'DataWindow.Persistent'
     ORDER BY ns.Name`
  ]);
  return results.map(r => {
    const [scope, value] = r.split('|');
    const faction = scope.replace(/^Scope\.Faction\./, '');
    return { faction, scope, score: parseFloat(value) };
  });
}

async function setFactionScore(key, scope, score) {
  const dbPath = getSavePaths()[0];
  const s = sqlStr(String(scope), 'scope');
  const value = toInteger(score, 'score', { min: -2147483648, max: 2147483647 });
  const nameResult = await runShell(dbPath, key, [
    `SELECT NameID FROM Names WHERE Name = '${s}'`
  ]);
  const scopeNameId = nameResult[0] ? nameResult[0].trim() : null;
  if (!scopeNameId) throw new Error(`Faction scope not found: ${scope}`);

  return withWriteReceipt(dbPath, key, async () => {
    const mutation = await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      `UPDATE ScopedCounterValues SET Value = ${value}
       WHERE ScopeID = ${scopeNameId}
          AND WindowID = (SELECT NameID FROM Names WHERE Name = 'DataWindow.Persistent')
          AND CounterID = (SELECT NameID FROM Names WHERE Name = 'Counter.FactionScore')`,
      `SELECT changes()`,
      `COMMIT`
    ]);
    const changedRows = requireChangedRows(mutation[0], 1, 'Faction score update');
    const verified = await runShell(dbPath, key, [`SELECT Value FROM ScopedCounterValues WHERE ScopeID = ${scopeNameId} AND WindowID = (SELECT NameID FROM Names WHERE Name = 'DataWindow.Persistent') AND CounterID = (SELECT NameID FROM Names WHERE Name = 'Counter.FactionScore')`]);
    if (verified.length !== 1 || Number(verified[0]) !== value) throw Object.assign(new Error('Faction score verification failed'), { status: 422 });

    return { scope, score: value, changedRows, targetVerification: { scope, score: value, passed: true } };
  });
}

// Trader availability flags live in UserSettings (e.g. Trader.Luca.Unlocked).
async function listTraderUnlocks(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT Key, Value FROM UserSettings WHERE Key LIKE 'Trader.%' OR Key LIKE 'Questgiver.%' ORDER BY Key`
  ]);
  return results.map(r => {
    const [k, v] = r.split('|');
    return { key: k, unlocked: parseInt(v, 10) === 1 };
  });
}

async function setTraderUnlock(key, settingKey, unlocked) {
  const dbPath = getSavePaths()[0];
  const k = sqlStr(String(settingKey), 'settingKey');
  if (typeof unlocked !== 'boolean') throw Object.assign(new Error('unlocked must be a boolean'), { status: 400 });
  const v = unlocked ? 1 : 0;

  return withWriteReceipt(dbPath, key, async () => {
    const mutation = await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      `UPDATE UserSettings SET Value = ${v} WHERE Key = '${k}'`,
      `SELECT changes()`,
      `COMMIT`
    ]);
    const changedRows = requireChangedRows(mutation[0], 1, 'Trader unlock update');
    const verified = await runShell(dbPath, key, [`SELECT Value FROM UserSettings WHERE Key = '${k}'`]);
    if (verified.length !== 1 || Number.parseInt(verified[0], 10) !== v) throw Object.assign(new Error('Trader unlock verification failed'), { status: 422 });

    return { key: settingKey, unlocked, changedRows, targetVerification: { key: settingKey, unlocked, passed: true } };
  });
}

// Read-only: the six shop-type vendors (NPCVendorTypes -- distinct from the
// wiki-named VENDOR_ROSTER used for Trader.*/Questgiver.* unlock flags on the
// frontend; some of these 6 rows likely correspond to named roster NPCs, but
// which internal row is "Kane" vs "Luca" etc. isn't derivable from the save
// data alone, so this deliberately surfaces the raw vendor names rather than
// guessing a mapping). ResetTimestamp is each vendor's own "last restocked
// at" tick value (0 = never restocked). TimedEvents.VendorReset is a single
// shared NextOccurrence used across vendors, same mechanism as
// Recipe.RepairWeapon (see getRepairStatus() below) -- returned as-is since
// there's no verified interval/period to compute a countdown from.
async function getVendorEconomy(key) {
  const dbPath = getSavePaths()[0];
  const vendorRows = await runShell(dbPath, key, [
    `SELECT VendorID, RowName, ResetTimestamp FROM NPCVendorTypes ORDER BY RowName`
  ]);
  const consumedRows = await runShell(dbPath, key, [
    `SELECT v.RowName, it.RowName, c.Quantity FROM NPCVendorConsumedItems c
     JOIN NPCVendorTypes v ON v.VendorID = c.VendorID
     JOIN ItemTypes it ON it.ItemTypeID = c.ItemTypeID
     ORDER BY v.RowName, it.RowName`
  ]);
  const nextEventRows = await runShell(dbPath, key, [`SELECT NextOccurrence FROM TimedEvents WHERE Name = 'VendorReset'`]);

  const consumedByVendor = {};
  for (const row of consumedRows) {
    const [vendor, itemId, qty] = row.split('|');
    (consumedByVendor[vendor] = consumedByVendor[vendor] || []).push({ itemId, quantity: Number.parseInt(qty, 10) });
  }

  const vendors = vendorRows.map(row => {
    const [vendorId, name, rawTicks] = row.split('|');
    const ticks = Number(rawTicks);
    return {
      vendorId,
      name,
      lastReset: ticks > 0 ? ticksToDate(ticks).toISOString() : null,
      consumedItems: consumedByVendor[name] || []
    };
  });

  const nextResetTicks = nextEventRows.length ? Number(nextEventRows[0]) : null;
  return {
    vendors,
    nextResetEvent: nextResetTicks ? ticksToDate(nextResetTicks).toISOString() : null
  };
}

module.exports = {
  listFactionScores,
  setFactionScore,
  listTraderUnlocks,
  setTraderUnlock,
  getVendorEconomy
};
