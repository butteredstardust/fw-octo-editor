const { runShell } = require('../../utils/validation');
const { getSavePaths } = require('./paths');
const { sqlStr } = require('./validators');
const { withWriteReceipt } = require('./receipt');
const HUB_UPGRADE_DATA = require('../../data/hub-upgrades.json');

const MANAGED_HUB_TAGS = HUB_UPGRADE_DATA.upgrades.map(entry => entry.tag);
const HUB_PREREQUISITES = new Map(require('../../data/recipes.canonical.json').recipes.upgrades
  .filter(entry => entry.upgradeTag && entry.prerequisiteTag)
  .map(entry => [entry.upgradeTag, entry.prerequisiteTag]));

async function listHubUpgrades(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT UpgradeTag, Permanent FROM PlayerUpgrades ORDER BY UpgradeTag`
  ]);
  return results.map(r => {
    const [tag, perm] = r.split('|');
    return { upgradeTag: tag, permanent: parseInt(perm, 10) };
  });
}

async function setHubUpgrades(key, tags) {
  const dbPath = getSavePaths()[0];
  if (!Array.isArray(tags)) throw new Error('tags must be an array');
  const requested=[...new Set(tags.map(tag=>String(tag)))];
  const unknown=requested.filter(tag=>!MANAGED_HUB_TAGS.includes(tag));
  if(unknown.length)throw Object.assign(new Error(`Unknown managed upgrade tags: ${unknown.join(', ')}`),{status:400});
  const requestedSet = new Set(requested);
  const incomplete = requested.flatMap(tag => {
    const missing = [];
    let prerequisite = HUB_PREREQUISITES.get(tag);
    const seen = new Set();
    while (prerequisite && !seen.has(prerequisite)) {
      seen.add(prerequisite);
      if (!requestedSet.has(prerequisite)) missing.push(prerequisite);
      prerequisite = HUB_PREREQUISITES.get(prerequisite);
    }
    return missing.map(required => ({ tag, required }));
  });
  if (incomplete.length) {
    const detail = incomplete.map(item => `${item.tag} requires ${item.required}`).join('; ');
    throw Object.assign(new Error(`Incomplete hub prerequisite chain: ${detail}`), { status: 422, incompletePrerequisites: incomplete });
  }
  const safeTags = requested.map(t => sqlStr(t, 'upgradeTag'));

  return withWriteReceipt(dbPath, key, async () => {
    const managedSql=MANAGED_HUB_TAGS.map(tag=>`'${sqlStr(tag,'managedUpgradeTag')}'`).join(',');
    const deleteCmd = safeTags.length > 0
      ? `DELETE FROM PlayerUpgrades WHERE UpgradeTag IN (${managedSql}) AND UpgradeTag NOT IN (${safeTags.map(t => `'${t}'`).join(',')})`
      : `DELETE FROM PlayerUpgrades WHERE UpgradeTag IN (${managedSql})`;

    const insertValues = safeTags.map(t => `('${t}', 0)`).join(',');
    const insertCmd = safeTags.length > 0
      ? `INSERT OR REPLACE INTO PlayerUpgrades (UpgradeTag, Permanent) VALUES ${insertValues}`
      : '';

    await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      deleteCmd,
      ...(requested.length > 0 ? [insertCmd] : []),
      `COMMIT`
    ]);
    const managedAfter=await runShell(dbPath,key,[`SELECT UpgradeTag FROM PlayerUpgrades WHERE UpgradeTag IN (${managedSql}) ORDER BY UpgradeTag`]);
    const actual=managedAfter.map(row=>row.trim()).filter(Boolean).sort();
    const expected=[...requested].sort();
    if(JSON.stringify(actual)!==JSON.stringify(expected))throw Object.assign(new Error('Hub upgrade verification failed'),{status:422});

    return {
      tagsSet: requested.length,
      targetVerification: { requested:expected, actual, preservedUnknownTags: true, passed:true }
    };
  });
}

module.exports = {
  listHubUpgrades,
  setHubUpgrades
};
