const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { isGameRunning } = require('../utils/processCheck');
const config = require('./configService');

const BACKUP_ROOT = process.env.FW_BACKUP_ROOT || require('path').join(process.env.LOCALAPPDATA || '', 'ForeverWinter', 'Saved', 'SaveBackups');
const SAVE_FILES = [
  '0002524f464349c086ad775367f0b95a.dat',
  '0002524f464349c086ad775367f0b95a.knowngood.dat',
  '0002524f464349c086ad775367f0b95a.knowngood.old.dat'
];
const SESSION_ID = crypto.randomUUID();
const BACKUP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

// Back up the files in the active (possibly overridden) save directory.
function getLiveSaveDir() {
  return config.getSaveDir();
}

async function getFileHash(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex').toUpperCase();
}

async function createBackup(label = 'manual', options = {}) {
  const backupRoot = options.backupRoot || BACKUP_ROOT;
  const liveSaveDir = options.liveSaveDir || getLiveSaveDir();
  const processCheck = options.isGameRunning || isGameRunning;
  const gameRunning = await processCheck();
  if (gameRunning) {
    throw Object.assign(new Error('Game is running. Please close The Forever Winter before creating a backup.'), { status: 409 });
  }

  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .replace(/\..+/, '')
    .replace(/[^0-9]/g, '')
    .substring(0, 14);

  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,47}$/.test(label)) throw Object.assign(new Error('Invalid backup label'), { status: 400 });
  const backupDir = path.join(backupRoot, `before-${label.trim().replace(/ +/g, '-').toLowerCase()}-${timestamp}`);

  await fs.mkdir(backupDir, { recursive: true });

  const hashes = {};
  for (const file of SAVE_FILES) {
    const src = path.join(liveSaveDir, file);
    const dst = path.join(backupDir, file);
    await fs.copyFile(src, dst);
    const sourceHash = await getFileHash(src);
    hashes[file] = await getFileHash(dst);
    if (sourceHash !== hashes[file]) throw new Error(`Backup hash mismatch: ${file}`);
  }
  const manifest = { manifestVersion: 1, appVersion: require('../package.json').version, sessionId: SESSION_ID, createdAt: now.toISOString(), label: label.trim(), hashes };
  await fs.writeFile(path.join(backupDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });

  return {
    success: true,
    backupDir,
    id: path.basename(backupDir),
    timestamp,
    hashes
  };
}

async function listBackups(options = {}) {
  const backupRoot = options.backupRoot || BACKUP_ROOT;
  try {
    const entries = await fs.readdir(backupRoot, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => ({
        name: e.name,
        path: path.join(backupRoot, e.name),
        created: null,
        manifestValid: false
      }))
    for (const item of dirs) {
      try {
        const manifest = JSON.parse(await fs.readFile(path.join(item.path, 'MANIFEST.json'), 'utf8'));
        item.created = new Date(manifest.createdAt).toISOString();
        item.label = manifest.label || null;
        item.appVersion = manifest.appVersion || null;
        item.manifestValid = !!manifest.hashes && SAVE_FILES.every(file => typeof manifest.hashes[file] === 'string');
      } catch { item.created = (await fs.stat(item.path)).birthtime.toISOString(); }
    }
    return dirs.sort((a, b) => b.created.localeCompare(a.created));
  } catch {
    return [];
  }
}

async function restoreBackup(id, confirmation, options = {}) {
  if (typeof id !== 'string' || !BACKUP_ID_PATTERN.test(id) || path.basename(id) !== id) throw Object.assign(new Error('Invalid backup id'), { status: 400 });
  if (confirmation !== `RESTORE ${id}`) throw Object.assign(new Error(`Confirmation must exactly match RESTORE ${id}`), { status: 400 });
  const backupRoot = options.backupRoot || BACKUP_ROOT;
  const liveSaveDir = options.liveSaveDir || getLiveSaveDir();
  const processCheck = options.isGameRunning || isGameRunning;
  const backupDir = path.join(backupRoot, id);
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(backupDir, 'MANIFEST.json'), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw Object.assign(new Error('Backup not found or manifest missing'), { status: 404 });
    throw Object.assign(new Error('Backup manifest is invalid'), { status: 422 });
  }
  if (!manifest.hashes || !SAVE_FILES.every(file => typeof manifest.hashes[file] === 'string')) throw Object.assign(new Error('Backup manifest is incomplete'), { status: 422 });
  for (const file of SAVE_FILES) {
    const actual = await getFileHash(path.join(backupDir, file));
    if (actual !== manifest.hashes[file]) throw Object.assign(new Error(`Backup hash mismatch: ${file}`), { status: 422 });
  }
  if (await processCheck()) throw Object.assign(new Error('The Forever Winter is running'), { status: 409 });
  const safetyBackup = await createBackup('before-restore', { backupRoot, liveSaveDir, isGameRunning: processCheck });
  const primary = SAVE_FILES[0];
  const livePrimary = path.join(liveSaveDir, primary);
  const sourcePrimary = path.join(backupDir, primary);
  const beforeHash = await getFileHash(livePrimary);
  const sourceHash = manifest.hashes[primary];
  const stagePath = path.join(liveSaveDir, `.${primary}.${crypto.randomUUID()}.restore-stage`);
  let installed = false;
  try {
    await fs.copyFile(sourcePrimary, stagePath);
    if (await getFileHash(stagePath) !== sourceHash) throw new Error('Restore staging hash mismatch');
    if (options.validatePrimary) await options.validatePrimary(stagePath);
    if (await processCheck()) throw Object.assign(new Error('The Forever Winter started during restore'), { status: 409 });
    if (await getFileHash(livePrimary) !== beforeHash) throw Object.assign(new Error('Live primary changed during restore'), { status: 409 });
    await fs.copyFile(stagePath, livePrimary);
    installed = true;
    if (await getFileHash(livePrimary) !== sourceHash) throw new Error('Installed restore hash mismatch');
    if (options.validatePrimary) await options.validatePrimary(livePrimary);
    return { success: true, backupId: id, safetyBackupId: safetyBackup.id, restoredFiles: [primary], beforeHash, afterHash: sourceHash, rollbackStatus: { attempted: false, succeeded: false } };
  } catch (error) {
    if (installed) {
      const rollbackSource = path.join(safetyBackup.backupDir, primary);
      try { await fs.copyFile(rollbackSource, livePrimary); error.rollbackStatus = { attempted: true, succeeded: await getFileHash(livePrimary) === beforeHash }; }
      catch (rollbackError) { error.rollbackStatus = { attempted: true, succeeded: false, error: rollbackError.message }; }
    }
    throw error;
  } finally { await fs.rm(stagePath, { force: true }); }
}

async function deleteBackup(id, confirmation, options = {}) {
  if (typeof id !== 'string' || !BACKUP_ID_PATTERN.test(id) || path.basename(id) !== id) throw Object.assign(new Error('Invalid backup id'), { status: 400 });
  if (confirmation !== `DELETE ${id}`) throw Object.assign(new Error(`Confirmation must exactly match DELETE ${id}`), { status: 400 });
  const backupRoot = options.backupRoot || BACKUP_ROOT;
  const backupDir = path.join(backupRoot, id);
  let stat;
  try { stat = await fs.stat(backupDir); }
  catch (error) {
    if (error.code === 'ENOENT') throw Object.assign(new Error('Backup not found'), { status: 404 });
    throw error;
  }
  if (!stat.isDirectory()) throw Object.assign(new Error('Backup id does not identify a directory'), { status: 422 });
  await fs.rm(backupDir, { recursive: true, force: false });
  try { await fs.stat(backupDir); throw Object.assign(new Error('Backup deletion verification failed'), { status: 500 }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { success: true, backupId: id, deleted: true };
}

async function getLatestBackupHashes() {
  const backups = await listBackups();
  if (backups.length === 0) return null;
  const latest = backups[0];
  const result = {};
  for (const file of SAVE_FILES) {
    try {
      result[file] = await getFileHash(path.join(latest.path, file));
    } catch {
      result[file] = null;
    }
  }
  return {
    directory: latest.name,
    hashes: result
  };
}

module.exports = {
  SAVE_FILES,
  hashFile: getFileHash,
  getFileHash,
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  getLatestBackupHashes
};
