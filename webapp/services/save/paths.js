const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runShell } = require('../../utils/validation');
const config = require('../configService');

const SAVE_PREFIX = '0002524f464349c086ad775367f0b95a';

const SAVE_FILES = [
  `${SAVE_PREFIX}.dat`,
  `${SAVE_PREFIX}.knowngood.dat`,
  `${SAVE_PREFIX}.knowngood.old.dat`
];

// Resolve save paths from the (optional) user override directory, falling back
// to the built-in default live save directory.
function getSavePaths() {
  const dir = config.getSaveDir();
  return SAVE_FILES.map(f => path.join(dir, f));
}

// Path to the live primary save file, for callers (e.g. a settings-page key
// verification check) that need to test a candidate key without duplicating
// the save-file naming convention.
function getPrimarySavePath() {
  return getSavePaths()[0];
}

async function getSchema(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ]);
  return results.map(r => ({ table: r }));
}

async function getFileHashes() {
  const paths = getSavePaths();
  const results = {};
  for (const p of paths) {
    try {
      const buf = fs.readFileSync(p);
      results[path.basename(p)] = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    } catch {
      results[path.basename(p)] = null;
    }
  }
  return results;
}

module.exports = {
  SAVE_FILES,
  getSavePaths,
  getPrimarySavePath,
  getSchema,
  getFileHashes
};
