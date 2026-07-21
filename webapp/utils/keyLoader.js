const fs = require('fs').promises;
const config = require('../services/configService');

async function loadKey(keyPath = config.getDefaultKeyFile()) {
  const raw = await fs.readFile(keyPath, 'utf8');
  const match = raw.match(/'([^']*)'/);
  if (!match || match[1].length !== 32) throw new Error('Valid database key not found in key resource');
  return match[1];
}

module.exports = { loadKey };
