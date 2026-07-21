const fs = require('fs').promises;
const fsSync = require('fs');
const config = require('../services/configService');
const keyProtect = require('./keyProtect');
const { buildResource } = require('../scripts/build-key-resource');

// Loads the bundled default DB key from the encrypted resource file (never
// plaintext on disk in a shipped build). In dev, if the resource is missing
// but the plaintext source (fwinter-db-key.txt) is present, build the
// resource once and persist it so subsequent boots don't need the plaintext
// source at all.
async function loadKey(resourcePath = config.getDefaultKeyResourceFile(), sourcePath = config.getDefaultKeyFile()) {
  if (!fsSync.existsSync(resourcePath) && fsSync.existsSync(sourcePath)) {
    buildResource(sourcePath, resourcePath);
  }

  const raw = await fs.readFile(resourcePath, 'utf8');
  let resource;
  try {
    resource = JSON.parse(raw);
  } catch {
    throw new Error('Database key resource is not valid JSON');
  }
  if (!keyProtect.isEncryptedResourceShape(resource)) throw new Error('Database key resource is malformed');

  const plainKey = keyProtect.decryptWithSecret(resource, keyProtect.APP_RESOURCE_SECRET);
  if (plainKey.length !== 32) throw new Error('Valid database key not found in key resource');
  if (resource.verifier && !keyProtect.verifyAgainstVerifier(plainKey, resource.verifier)) {
    throw new Error('Database key resource failed integrity verification');
  }
  return plainKey;
}

module.exports = { loadKey };
