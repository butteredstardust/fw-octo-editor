'use strict';

const nodeFs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

async function hashFile(fs, filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex').toUpperCase();
}

async function flushFile(fs, filePath) {
  const handle = await fs.open(filePath, 'r+');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function atomicInstall(source, destination, expectedHash, options = {}) {
  const fs = options.fs || nodeFs;
  const id = (options.randomUUID || crypto.randomUUID)();
  const sibling = path.join(path.dirname(destination), `.${path.basename(destination)}.${id}.installing`);
  let renamed = false;
  try {
    await fs.copyFile(source, sibling);
    await flushFile(fs, sibling);
    const stagedHash = await hashFile(fs, sibling);
    if (expectedHash && stagedHash !== expectedHash) throw new Error('Atomic install staging hash mismatch');
    await fs.rename(sibling, destination);
    renamed = true;
    const installedHash = await hashFile(fs, destination);
    if (expectedHash && installedHash !== expectedHash) throw new Error('Atomic install verification hash mismatch');
    return installedHash;
  } catch (error) {
    error.atomicInstalled = renamed;
    throw error;
  } finally {
    try { await fs.rm(sibling, { force: true }); } catch { /* best effort */ }
  }
}

module.exports = { atomicInstall, flushFile };
