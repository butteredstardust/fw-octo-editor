// build-key-resource.js
//
// Dev/build-time tool: reads the plaintext DB key source (fwinter-db-key.txt,
// never committed, never shipped) and writes an AES-256-GCM-encrypted
// resource file that the running app loads instead. See utils/keyProtect.js
// for why this is obfuscation rather than a real secrecy boundary.
//
// Usage: node scripts/build-key-resource.js [sourcePath] [destPath]

'use strict';

const fs = require('fs');
const path = require('path');
const keyProtect = require('../utils/keyProtect');
const config = require('../services/configService');

// Accepts either the dev source shape (`$key='<32 chars>';`) or a bare
// 32-character key on its own line, which is what CI writes from its secret.
function parseKeyFromSource(raw) {
  const text = String(raw).replace(/^\uFEFF/, '');
  const quoted = text.match(/'([^']*)'/);
  if (quoted && quoted[1].length === 32) return quoted[1];
  const bare = text.split(/\r?\n/).map(line => line.trim()).find(line => line.length > 0);
  if (!bare || bare.length !== 32) throw new Error('Valid database key not found in key source');
  return bare;
}

function buildResource(sourcePath, destPath) {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  const plainKey = parseKeyFromSource(raw);
  const resource = keyProtect.encryptWithSecret(plainKey, keyProtect.APP_RESOURCE_SECRET);
  resource.verifier = keyProtect.deriveVerifier(plainKey);
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(destPath, JSON.stringify(resource, null, 2), 'utf8');
  return destPath;
}

function main() {
  const sourcePath = process.argv[2] || config.getDefaultKeyFile();
  const destPath = process.argv[3] || config.getDefaultKeyResourceFile();
  const written = buildResource(sourcePath, destPath);
  console.log(`Wrote encrypted key resource: ${written}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('Failed to build key resource:', err.message);
    process.exit(1);
  }
}

module.exports = { buildResource, parseKeyFromSource };
