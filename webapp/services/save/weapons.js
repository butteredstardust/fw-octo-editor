const { runShell } = require('../../utils/validation');
const { getSavePaths } = require('./paths');
const { sqlStr, toInteger, requireChangedRows } = require('./validators');
const { withWriteReceipt } = require('./receipt');
const WEAPON_XP_REFERENCE = require('../../data/weapon-xp-reference.canonical.json').weaponXp;

async function listWeaponXp(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT ns.Name, sc.Value FROM ScopedCounterValues sc JOIN Names ns ON ns.NameID = sc.ScopeID WHERE ns.Name LIKE 'Scope.Weapon.%' ORDER BY ns.Name`
  ]);
  return results.map(r => {
    const [name, value] = r.split('|');
    return { weapon: name, xp: parseFloat(value) };
  });
}

// Reference 100% save weapon XP values, used as a per-weapon target baseline.
// Extracted once from the 100% reference save via
// scripts/extract-weapon-xp-reference.js (see that script's header comment;
// same fix as prestige-skills.canonical.json -- avoids a runtime dependency
// on reference/*.dat, which is gitignored and never bundled into release
// builds). key is accepted only for call-site/signature compatibility.
async function getReferenceWeaponXp(_key) {
  return { ...WEAPON_XP_REFERENCE };
}

async function setWeaponXp(key, weaponScope, xp) {
  const dbPath = getSavePaths()[0];
  const scope = sqlStr(String(weaponScope), 'weaponScope');
  const value = toInteger(xp, 'xp', { min: 0 });
  const nameResult = await runShell(dbPath, key, [
    `SELECT NameID FROM Names WHERE Name = '${scope}'`
  ]);
  const scopeNameId = nameResult[0] ? nameResult[0].trim() : null;

  if (!scopeNameId) {
    throw new Error(`Weapon scope not found: ${weaponScope}`);
  }

  return withWriteReceipt(dbPath, key, async () => {
    const mutation = await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      `UPDATE ScopedCounterValues SET Value = ${value}
       WHERE ScopeID = ${scopeNameId}
         AND WindowID = (SELECT NameID FROM Names WHERE Name = 'DataWindow.Persistent')
         AND CounterID = (SELECT NameID FROM Names WHERE Name = 'Counter.XP')`,
      `SELECT changes()`,
      `COMMIT`
    ]);
    const changedRows = requireChangedRows(mutation[0],1,'Weapon XP update');
    const verified = await runShell(dbPath,key,[`SELECT Value FROM ScopedCounterValues WHERE ScopeID=${scopeNameId} AND WindowID=(SELECT NameID FROM Names WHERE Name='DataWindow.Persistent') AND CounterID=(SELECT NameID FROM Names WHERE Name='Counter.XP')`]);
    if(Number.parseInt(verified[0],10)!==value)throw Object.assign(new Error('Weapon XP verification failed'),{status:422});

    return {
      weapon: weaponScope,
      xp,
      changedRows,
      targetVerification: { scope: weaponScope, window: 'DataWindow.Persistent', counter: 'Counter.XP', value, passed: true }
    };
  });
}

// Bulk-set weapon XP for many scopes in a single write pass. Each item is
// validated (numeric xp, escaped scope) before interpolation. Returns a per-item
// status array plus an overall integrity/FK/hashes summary.
async function batchSetWeaponXp(key, items) {
  const dbPath = getSavePaths()[0];
  if(!Array.isArray(items)||items.length<1||items.length>250)throw Object.assign(new Error('items must contain 1 to 250 entries'),{status:400});
  // Label each field with its position/scope so a single bad entry in a
  // batch of up to 250 says exactly which one failed, instead of a bare
  // "Invalid xp" that leaves the caller to guess which item was the problem.
  const normalized=items.map((it,index)=>{
    const context=`item ${index+1} of ${items.length}, scope ${JSON.stringify(it.scope)}`;
    return {scope:sqlStr(String(it.scope),`scope (${context})`),originalScope:String(it.scope),value:toInteger(it.xp,`xp (${context})`,{min:0})};
  });
  if(new Set(normalized.map(it=>it.scope)).size!==normalized.length)throw Object.assign(new Error('Duplicate weapon scopes are not allowed'),{status:400});
  const scopeRows=await runShell(dbPath,key,[`SELECT Name,NameID FROM Names WHERE Name IN (${normalized.map(it=>`'${it.scope}'`).join(',')})`]);
  const ids=new Map(scopeRows.map(row=>{const [name,id]=row.split('|');return [name,id];}));
  const missing=normalized.filter(it=>!ids.has(it.originalScope)).map(it=>it.originalScope);
  if(missing.length)throw Object.assign(new Error(`Weapon scopes not found: ${missing.join(', ')}`),{status:422});

  return withWriteReceipt(dbPath, key, async () => {
    const commands=['BEGIN IMMEDIATE'];
    for(const it of normalized){commands.push(`UPDATE ScopedCounterValues SET Value=${it.value} WHERE ScopeID=${ids.get(it.originalScope)} AND WindowID=(SELECT NameID FROM Names WHERE Name='DataWindow.Persistent') AND CounterID=(SELECT NameID FROM Names WHERE Name='Counter.XP')`);commands.push(`SELECT changes()`);}
    commands.push('COMMIT');
    const changes=await runShell(dbPath,key,commands);
    changes.forEach((raw,index)=>requireChangedRows(raw,1,`Weapon XP batch entry ${normalized[index]?.originalScope||index}`));
    const verifyRows=await runShell(dbPath,key,[`SELECT n.Name,s.Value FROM ScopedCounterValues s JOIN Names n ON n.NameID=s.ScopeID WHERE s.ScopeID IN (${normalized.map(it=>ids.get(it.originalScope)).join(',')}) AND s.WindowID=(SELECT NameID FROM Names WHERE Name='DataWindow.Persistent') AND s.CounterID=(SELECT NameID FROM Names WHERE Name='Counter.XP')`]);
    const verified=new Map(verifyRows.map(row=>{const [scope,value]=row.split('|');return[scope,Number.parseInt(value,10)];}));
    for(const it of normalized)if(verified.get(it.originalScope)!==it.value)throw Object.assign(new Error(`Weapon XP verification failed: ${it.originalScope}`),{status:422});
    const results=normalized.map(it=>({scope:it.originalScope,ok:true,value:it.value}));

    return {
      updated: results.filter(r => r.ok).length,
      failed: 0,
      changedRows: normalized.length,
      targetVerification: { passed:true, targets:results },
      results
    };
  });
}

module.exports = {
  listWeaponXp,
  getReferenceWeaponXp,
  setWeaponXp,
  batchSetWeaponXp
};
