const path = require('path');
const config = require('../configService');

const SAVE_PREFIX = '0002524f464349c086ad775367f0b95a';

// Resolve save paths from the (optional) user override directory, falling back
// to the built-in default live save directory.
function getSavePaths() {
  const dir = config.getSaveDir();
  return [
    `${SAVE_PREFIX}.dat`,
    `${SAVE_PREFIX}.knowngood.dat`,
    `${SAVE_PREFIX}.knowngood.old.dat`
  ].map(f => path.join(dir, f));
}

module.exports = { getSavePaths };
