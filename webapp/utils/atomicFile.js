'use strict';

const nodeFs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Windows reports a transient lock (Steam Cloud sync, Defender's real-time scan of the
// freshly written sibling, an Explorer preview handle) as one of these on copy/rename.
const LOCK_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRY_DELAYS_MS = [10, 25, 50, 100, 200, 350, 500, 750, 1000, 1000];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function withLockRetry(operation, describe, options = {}) {
  const delays = options.retryDelaysMs || RETRY_DELAYS_MS;
  const wait = options.sleep || sleep;
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      if (!LOCK_CODES.has(error.code) || attempt >= delays.length) {
        if (LOCK_CODES.has(error.code)) {
          error.lockRetriesExhausted = attempt + 1;
          error.message = `${error.message} — ${describe} is locked by another program after `
            + `${attempt + 1} attempts. Close Steam (its cloud sync touches the save folder), `
            + 'any backup/antivirus scan or Explorer preview of the save folder, then retry.';
        }
        throw error;
      }
      await wait(delays[attempt]);
    }
  }
}

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
    await withLockRetry(() => fs.copyFile(source, sibling), path.basename(destination), options);
    await withLockRetry(() => flushFile(fs, sibling), path.basename(sibling), options);
    const stagedHash = await hashFile(fs, sibling);
    if (expectedHash && stagedHash !== expectedHash) throw new Error('Atomic install staging hash mismatch');
    await withLockRetry(() => fs.rename(sibling, destination), path.basename(destination), options);
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

module.exports = { atomicInstall, flushFile, withLockRetry };
