const { runShell } = require('../../utils/validation');
const { getSavePaths } = require('./paths');
const { toNumber, toInteger, sqlStr, requireChangedRows } = require('./validators');
const { withWriteReceipt } = require('./receipt');
const PRESTIGE_SKILLS_DATA = require('../../data/prestige-skills.canonical.json');

// Extracted once from the 100% reference save via
// scripts/extract-prestige-reference.js -- see that script's header comment.
// Validated at load time so a corrupted/hand-edited canonical file fails
// fast at boot rather than silently writing wrong grants into a real save.
if (!Array.isArray(PRESTIGE_SKILLS_DATA.skills) || PRESTIGE_SKILLS_DATA.skills.length !== 28) {
  throw new Error(`prestige-skills.canonical.json is malformed: expected 28 skills, got ${PRESTIGE_SKILLS_DATA.skills && PRESTIGE_SKILLS_DATA.skills.length}`);
}
const PRESTIGE_SKILLS = PRESTIGE_SKILLS_DATA.skills.map(skill => {
  if (!/^PlayerSkill\.Prestige\.(Health|SpeedBuff)\.\d{2}$/.test(skill.name) || !Number.isInteger(skill.threshold)) {
    throw new Error(`prestige-skills.canonical.json has a malformed entry: ${JSON.stringify(skill)}`);
  }
  return skill;
});

async function listCharacters(key) {
  const dbPath = getSavePaths()[0];
  const results = await runShell(dbPath, key, [
    `SELECT c.CharacterTypeID, c.CharacterGameplayTag, c.Level,
       (SELECT MAX(s.Value) FROM ScopedCounterValues s
          JOIN Names sc ON sc.NameID = s.ScopeID
          JOIN Names cc ON cc.NameID = s.CounterID
        WHERE sc.Name = 'Scope.Character.' || REPLACE(c.CharacterGameplayTag, 'Pawn.Player.', '')
          AND cc.Name = 'Counter.XP')
     FROM Characters c ORDER BY c.CharacterTypeID`
  ]);
  return results.map(r => {
    const parts = r.split('|');
    return {
      characterId: parts[0],
      name: parts[1],
      level: parseInt(parts[2], 10),
      xp: parts[3] != null && parts[3] !== '' ? parseFloat(parts[3]) : 0
    };
  });
}

async function updateCharacterLevel(key, characterId, level) {
  const dbPath = getSavePaths()[0];
  const lvl = toInteger(level, 'level', { min: 0, max: 1000 });
  const cid = toInteger(characterId, 'characterId', { min: 1 });

  return withWriteReceipt(dbPath, key, async () => {
    const mutation = await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      `UPDATE Characters SET Level = ${lvl} WHERE CharacterTypeID = ${cid}`,
      `SELECT changes()`,
      `COMMIT`
    ]);
    const changedRows = requireChangedRows(mutation[0], 1, 'Character level update');
    const verification = await runShell(dbPath,key,[`SELECT Level FROM Characters WHERE CharacterTypeID = ${cid}`]);
    if (Number.parseInt(verification[0],10) !== lvl) throw Object.assign(new Error('Character level verification failed'),{status:422});

    return {
      changedRows,
      targetVerification: { characterId: cid, level: lvl, passed: true }
    };
  });
}

async function setPrestige(key, characterId, targetLevel) {
  const dbPath = getSavePaths()[0];
  const lvl = toInteger(targetLevel, 'targetLevel', { min: 0, max: 50 });
  const cid = toInteger(characterId, 'characterId', { min: 1 });
  const grants = PRESTIGE_SKILLS.map(skill => ({
    rawName: skill.name,
    name: sqlStr(skill.name, 'skillName'),
    state: lvl >= skill.threshold ? 1 : 0
  }));

  return withWriteReceipt(dbPath, key, async () => {
    const mutation = await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      `UPDATE Characters SET Level = ${lvl} WHERE CharacterTypeID = ${cid}`,
      `SELECT changes()`,
      ...grants.flatMap(grant => [
        `INSERT INTO CharacterSkills(CharacterTypeID, SkillName, State) VALUES(${cid}, '${grant.name}', ${grant.state}) ON CONFLICT(CharacterTypeID, SkillName) DO UPDATE SET State = excluded.State`,
        `SELECT changes()`
      ]),
      `COMMIT`
    ]);
    requireChangedRows(mutation[0], 1, 'Prestige character update');
    mutation.slice(1).forEach((raw, index) => requireChangedRows(raw, 1, `Prestige grant ${grants[index].rawName}`));
    const verification = await runShell(dbPath, key, [
      `SELECT Level FROM Characters WHERE CharacterTypeID = ${cid}`,
      `SELECT SkillName, State FROM CharacterSkills WHERE CharacterTypeID = ${cid} AND SkillName LIKE 'PlayerSkill.Prestige.%' ORDER BY SkillName`
    ]);
    if (Number.parseInt(verification[0], 10) !== lvl || verification.length !== 29) throw Object.assign(new Error('Prestige verification failed'), { status: 422 });
    const actual = new Map(verification.slice(1).map(row => { const [name, state] = row.split('|'); return [name, Number.parseInt(state, 10)]; }));
    if (grants.some(grant => actual.get(grant.rawName) !== grant.state)) throw Object.assign(new Error('Prestige grant verification failed'), { status: 422 });

    return {
      changedRows: 1 + grants.length,
      skillsUpdated: grants.length,
      targetVerification: { characterId: cid, level: lvl, prestigeRows: grants.length, activeGrants: grants.filter(g => g.state === 1).length, passed: true }
    };
  });
}

async function listCharacterDetails(key, characterId) {
  const dbPath = getSavePaths()[0];
  const cid = toNumber(characterId, 'characterId');

  // Resolve the gameplay tag for this character (e.g. Pawn.Player.Gunhead).
  const tagRows = await runShell(dbPath, key, [
    `SELECT CharacterGameplayTag FROM Characters WHERE CharacterTypeID = ${cid}`
  ]);
  const gameplayTag = tagRows[0] ? tagRows[0].trim() : null;
  if (!gameplayTag) throw new Error(`Character ${characterId} not found`);

  // XP: Scope.Character.<Name> + Counter.XP, present in multiple WindowIDs.
  // Report the maximum value (the "current" window may lag the saved one).
  const xpScopeId = await runShell(dbPath, key, [
    `SELECT NameID FROM Names WHERE Name = 'Scope.Character.${gameplayTag.replace(/^Pawn\.Player\./, '')}'`
  ]);
  const xpRows = await runShell(dbPath, key, [
    `SELECT Value FROM ScopedCounterValues WHERE ScopeID = ${xpScopeId[0].trim()} AND CounterID = (SELECT NameID FROM Names WHERE Name = 'Counter.XP')`
  ]);
  const xp = xpRows.length
    ? Math.max(...xpRows.map(r => parseFloat(r.split('|')[0])))
    : 0;

  // Skills: every CharacterSkills row for this character.
  const skillRows = await runShell(dbPath, key, [
    `SELECT SkillName, State FROM CharacterSkills WHERE CharacterTypeID = ${cid} ORDER BY SkillName`
  ]);
  const skills = skillRows.map(r => {
    const [name, state] = r.split('|');
    return { name, state: parseInt(state, 10) };
  });

  return { characterId, gameplayTag, xp, skills };
}

async function setCharacterXp(key, characterId, xp) {
  const dbPath = getSavePaths()[0];
  const cid = toInteger(characterId, 'characterId', { min: 1 });
  const tagRows = await runShell(dbPath, key, [
    `SELECT CharacterGameplayTag FROM Characters WHERE CharacterTypeID = ${cid}`
  ]);
  const gameplayTag = tagRows[0] ? tagRows[0].trim() : null;
  if (!gameplayTag) throw new Error(`Character ${characterId} not found`);

  const scopeId = await runShell(dbPath, key, [
    `SELECT NameID FROM Names WHERE Name = 'Scope.Character.${gameplayTag.replace(/^Pawn\.Player\./, '')}'`
  ]);
  const scopeNameId = scopeId[0] ? scopeId[0].trim() : null;
  if (!scopeNameId) throw new Error(`Character XP scope not found for ${gameplayTag}`);

  const value = toInteger(xp, 'xp', { min: 0 });

  return withWriteReceipt(dbPath, key, async () => {
    const mutation = await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      `UPDATE ScopedCounterValues SET Value = ${value} WHERE ScopeID = ${scopeNameId} AND WindowID = (SELECT NameID FROM Names WHERE Name = 'DataWindow.Limit') AND CounterID = (SELECT NameID FROM Names WHERE Name = 'Counter.XP')`,
      `SELECT changes()`,
      `COMMIT`
    ]);
    const changedRows=requireChangedRows(mutation[0],1,'Character XP update');
    const verified=await runShell(dbPath,key,[`SELECT Value FROM ScopedCounterValues WHERE ScopeID=${scopeNameId} AND WindowID=(SELECT NameID FROM Names WHERE Name='DataWindow.Limit') AND CounterID=(SELECT NameID FROM Names WHERE Name='Counter.XP')`]);
    if(Number.parseInt(verified[0],10)!==value)throw Object.assign(new Error('Character XP verification failed'),{status:422});

    return {
      characterId,
      xp,
      changedRows,
      targetVerification:{characterId:cid,window:'DataWindow.Limit',counter:'Counter.XP',value,passed:true}
    };
  });
}

async function setCharacterSkills(key, characterId, skills) {
  const dbPath = getSavePaths()[0];
  const cid = toInteger(characterId, 'characterId', { min: 1 });
  if (!Array.isArray(skills) || skills.length < 1 || skills.length > 250) throw Object.assign(new Error('skills must contain 1 to 250 entries'), { status: 400 });
  const normalized = skills.map(skill => {
    if (!skill || typeof skill.name !== 'string' || typeof skill.state !== 'boolean') throw Object.assign(new Error('Each skill requires a name and boolean state'), { status: 400 });
    return { rawName: skill.name, name: sqlStr(skill.name, 'skillName'), state: skill.state ? 1 : 0 };
  });
  if (new Set(normalized.map(s => s.rawName)).size !== normalized.length) throw Object.assign(new Error('Duplicate skill names are not allowed'), { status: 400 });
  const existing = await runShell(dbPath, key, [`SELECT SkillName FROM CharacterSkills WHERE CharacterTypeID = ${cid}`]);
  const existingNames = new Set(existing.map(row => row.trim()));
  const missing = normalized.filter(skill => !existingNames.has(skill.rawName));
  if (missing.length) throw Object.assign(new Error(`Unknown character skills: ${missing.map(s => s.rawName).join(', ')}`), { status: 422 });

  return withWriteReceipt(dbPath, key, async () => {
    const mutation = await runShell(dbPath, key, [
      `BEGIN IMMEDIATE`,
      ...normalized.flatMap(skill => [`UPDATE CharacterSkills SET State = ${skill.state} WHERE CharacterTypeID = ${cid} AND SkillName = '${skill.name}'`, `SELECT changes()`]),
      `COMMIT`
    ]);
    mutation.forEach((raw, index) => requireChangedRows(raw, 1, `Character skill ${normalized[index].rawName}`));
    const verified = await runShell(dbPath, key, normalized.map(skill => `SELECT State FROM CharacterSkills WHERE CharacterTypeID = ${cid} AND SkillName = '${skill.name}'`));
    if (verified.length !== normalized.length || normalized.some((skill, index) => Number.parseInt(verified[index], 10) !== skill.state)) throw Object.assign(new Error('Character skill verification failed'), { status: 422 });

    return {
      changedRows: normalized.length,
      skillsUpdated: normalized.length,
      targetVerification: { characterId: cid, skills: normalized.map(s => ({ name: s.rawName, state: s.state })), passed: true }
    };
  });
}

module.exports = {
  listCharacters,
  updateCharacterLevel,
  setPrestige,
  listCharacterDetails,
  setCharacterXp,
  setCharacterSkills
};
