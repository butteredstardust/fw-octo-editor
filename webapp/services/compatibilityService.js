const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./configService');
const { SAVE_FILES } = require('./backupService');
const { runShell } = require('../utils/validation');
const { getGameVersion, VERIFIED_GAME_VERSION } = require('./gameVersionService');

const SQLITE_SHELL = process.env.FW_SQLITE_BIN || 'C:\\tmp\\fw-tools\\sqlite3mc\\bin\\sqlite3mc_shell_x64.exe';
const UESAVE_BIN = process.env.GVAS_UESAVE_BIN || path.resolve(__dirname, '..', '..', 'tools', 'uesave-src', 'target', 'release', 'uesave.exe');
const REQUIRED_TABLES = ['BinaryData','Characters','CharacterSkills','Currencies','Names','PlayerUpgrades','ScopedCounterValues'];
const VERIFIED_STEAM_BUILD = '24479102';

function evaluateGameVersion(gameVersion) {
  const detected = !!gameVersion?.detected;
  const value = String(gameVersion?.version || '');
  const verified = detected && (gameVersion.source === 'steam-buildid'
    ? value === VERIFIED_STEAM_BUILD
    : value === VERIFIED_GAME_VERSION);
  return {
    verified,
    expected: { semanticVersion: VERIFIED_GAME_VERSION, steamBuildId: VERIFIED_STEAM_BUILD },
    detected: gameVersion || { detected: false, version: null, source: null }
  };
}

function gameVersionWarning(gameBuild) {
  if (gameBuild.verified) return null;
  return gameBuild.detected.detected ? 'unverified-game-version' : 'unknown-game-version';
}

async function checkCompatibility(key) {
  const saveDir = config.getSaveDir();
  const files = SAVE_FILES.map(name => ({ name, path: path.join(saveDir,name), exists: fs.existsSync(path.join(saveDir,name)) }));
  const reasons = [];
  const warnings = [];
  const gameBuild = evaluateGameVersion(await getGameVersion());
  // Version detection is advisory. Save/key/schema/tool checks below remain
  // the compatibility gate used by every mutation.
  const gameVersionAdvisory = gameVersionWarning(gameBuild);
  if (gameVersionAdvisory) warnings.push(gameVersionAdvisory);
  if (files.some(file => !file.exists)) reasons.push('missing-save-variants');
  if (!fs.existsSync(SQLITE_SHELL)) reasons.push('missing-sqlite3mc');
  let tables = [];
  let schemaFingerprint = null;
  if (!reasons.includes('missing-save-variants') && !reasons.includes('missing-sqlite3mc')) {
    try {
      const tableRows = await runShell(files[0].path,key,["SELECT group_concat(name, ',') FROM (SELECT name FROM sqlite_master WHERE type='table' ORDER BY name)"]);
      tables = String(tableRows[0] || '').split(',').map(value => value.trim()).filter(Boolean);
      const missing = REQUIRED_TABLES.filter(table => !tables.includes(table));
      if (missing.length) reasons.push(`missing-required-tables:${missing.join(',')}`);
      schemaFingerprint = crypto.createHash('sha256').update(tables.join('\n')).digest('hex').toUpperCase();
      const requiredRows = await runShell(files[0].path,key,["SELECT (SELECT count(*) FROM BinaryData WHERE Name='TempInventory') + ((SELECT count(*) FROM Currencies WHERE RowName IN ('WaterBarrels','TestCurrency')) * 10)"]);
      if (Number.parseInt(requiredRows[0],10) !== 21) reasons.push('missing-required-rows');
    } catch { reasons.push('key-or-database-incompatible'); }
  }
  return { compatible: reasons.length === 0, reasons, warnings, schemaFingerprint, requiredTables:REQUIRED_TABLES, files, tools:{ sqlite3mc:fs.existsSync(SQLITE_SHELL), uesave:fs.existsSync(UESAVE_BIN) }, gameBuild };
}
module.exports = { checkCompatibility, evaluateGameVersion, gameVersionWarning, REQUIRED_TABLES, VERIFIED_STEAM_BUILD, SQLITE_SHELL, UESAVE_BIN };
