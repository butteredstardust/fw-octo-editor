const { runIntegrityCheck, validateForeignKeys } = require('../../utils/validation');
const { getFileHashes } = require('./paths');

// Nearly every write function in save/* repeats the same before/after
// integrity+FK+hash snapshot around its mutation. This factors that pattern
// into one helper: it captures the "before" snapshot, awaits `run()` (which
// performs the mutation and its own SQL-level verification), captures the
// "after" snapshot, and merges whatever `run()` returned over the shared
// envelope (`success`, before/after integrity, before/after FK, before/after
// hashes). `run()`'s own fields win on any overlap.
//
// setCurrency() is the one write that never checked foreign keys (Currencies
// has no FK-bearing columns worth the extra shell round trip), so FK capture
// is optional via `withFk: false`.
async function withWriteReceipt(dbPath, key, run, { withFk = true } = {}) {
  const beforeIntegrity = await runIntegrityCheck(dbPath, key);
  const beforeFk = withFk ? await validateForeignKeys(dbPath, key) : null;
  const beforeHashes = await getFileHashes();

  const result = await run();

  const afterIntegrity = await runIntegrityCheck(dbPath, key);
  const afterFk = withFk ? await validateForeignKeys(dbPath, key) : null;
  const afterHashes = await getFileHashes();

  const envelope = {
    success: afterIntegrity.passed,
    beforeIntegrity,
    afterIntegrity,
    beforeHashes,
    afterHashes
  };
  if (withFk) {
    envelope.beforeFk = beforeFk;
    envelope.afterFk = afterFk;
  }

  return { ...envelope, ...result };
}

module.exports = { withWriteReceipt };
