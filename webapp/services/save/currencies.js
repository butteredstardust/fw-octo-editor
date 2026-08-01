const { runShell } = require('../../utils/validation');
const { getSavePaths } = require('./paths');
const { sqlStr, toInteger, requireChangedRows } = require('./validators');
const { withWriteReceipt } = require('./receipt');

// ---- Currencies (Currencies table) ----------------------------------------
// The save tracks a handful of currency-style counters in the Currencies table
// (RowName + Amount). We expose the two the player cares about: WaterBarrels
// (water) and TestCurrency (credits). Amount is an integer (INTEGER column).
const CURRENCY_ROWNAMES = ['WaterBarrels', 'TestCurrency'];

async function getCurrencies(key) {
  const dbPath = getSavePaths()[0];
  const list = CURRENCY_ROWNAMES.map(r => `'${sqlStr(r, 'rowName')}'`).join(',');
  const results = await runShell(dbPath, key, [
    `SELECT RowName, Amount FROM Currencies WHERE RowName IN (${list})`
  ]);
  const byName = {};
  for (const r of results) {
    const [rowName, amount] = r.split('|');
    byName[rowName] = parseInt(amount, 10) || 0;
  }
  // Always return both keys (default 0 if the row is missing).
  return {
    WaterBarrels: byName['WaterBarrels'] != null ? byName['WaterBarrels'] : 0,
    TestCurrency: byName['TestCurrency'] != null ? byName['TestCurrency'] : 0
  };
}

async function setCurrency(key, rowName, amount) {
  const dbPath = getSavePaths()[0];
  const r = sqlStr(String(rowName), 'rowName');
  if (!CURRENCY_ROWNAMES.includes(String(rowName))) throw Object.assign(new Error(`Unsupported currency: ${rowName}`),{status:400});
  const value = toInteger(amount, 'amount', { min: 0, max: 2147483647 });
  // Guard: the currency row must already exist (we only edit known rows).
  const existing = await runShell(dbPath, key, [
    `SELECT Amount FROM Currencies WHERE RowName = '${r}'`
  ]);
  if (!existing.length) {
    throw new Error(`Currency not found: ${rowName}`);
  }

  return withWriteReceipt(dbPath, key, async () => {
    const mutation=await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      `UPDATE Currencies SET Amount = ${value} WHERE RowName = '${r}'`,
      `SELECT changes()`,
      `COMMIT`
    ]);
    const changedRows=requireChangedRows(mutation[0],1,'Currency update');
    const verified=await runShell(dbPath,key,[`SELECT Amount FROM Currencies WHERE RowName='${r}'`]);
    if(Number.parseInt(verified[0],10)!==value)throw Object.assign(new Error('Currency verification failed'),{status:422});

    return { rowName, amount: value, changedRows, targetVerification:{rowName,amount:value,passed:true} };
  }, { withFk: false });
}

module.exports = {
  getCurrencies,
  setCurrency
};
