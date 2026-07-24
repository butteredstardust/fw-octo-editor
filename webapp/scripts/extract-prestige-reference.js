'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../services/configService');
const { loadKey } = require('../utils/keyLoader');
const { runShell } = require('../utils/validation');
const saveService = require('../services/saveService');

const source = process.argv[2] || path.resolve(__dirname, '..', '..', 'reference', 'YOUR_HASHCODE_HERE.dat');
const output = path.resolve(__dirname, '..', 'data', 'prestige-skills.canonical.json');
const expectedName = '0002524f464349c086ad775367f0b95a.dat';

// setPrestige() (saveService.js) used to require this reference save at
// mutation time purely to enumerate the fixed set of 28 PlayerSkill.Prestige.*
// tag names and confirm they're all granted (State=1) in a 100% save. That
// tag set doesn't vary per save -- only which ones are granted does -- so it
// only needs to be extracted once, here, and shipped as canonical JSON. This
// also fixes the reference save never being bundled into release builds
// (releases/build.ps1 only stages webapp/, not the gitignored reference/ dir).
async function main() {
  if (!fs.existsSync(source)) throw new Error(`Reference save not found: ${source}`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-reference-prestige-'));
  try {
    fs.copyFileSync(source, path.join(tempDir, expectedName));
    const key = await loadKey();

    const rowsByCharacter = await config.withSaveDir(tempDir, async () => {
      const characters = await saveService.listCharacters(key);
      const dbPath = saveService.getPrimarySavePath();
      const byCharacter = {};
      for (const c of characters) {
        const cid = Number.parseInt(c.characterId, 10);
        const rows = await runShell(dbPath, key, [
          `SELECT SkillName, State FROM CharacterSkills WHERE CharacterTypeID = ${cid} AND SkillName LIKE 'PlayerSkill.Prestige.%' ORDER BY SkillName`
        ]);
        byCharacter[c.characterId] = rows.filter(Boolean).map(row => {
          const [name, state] = row.split('|');
          return { name, state: Number.parseInt(state, 10) };
        });
      }
      return byCharacter;
    });

    const characterIds = Object.keys(rowsByCharacter);
    if (!characterIds.length) throw new Error('No characters found in reference save');

    // Every character must expose the identical set of prestige tags, all
    // granted, before we can collapse per-character rows into one
    // character-agnostic canonical list. If a future game update makes these
    // per-character, this throws instead of silently shipping a wrong list.
    const first = rowsByCharacter[characterIds[0]];
    const firstNames = first.map(r => r.name).slice().sort();
    for (const id of characterIds) {
      const rows = rowsByCharacter[id];
      const names = rows.map(r => r.name).slice().sort();
      if (names.length !== firstNames.length || names.some((n, i) => n !== firstNames[i])) {
        throw new Error(`Character ${id} has a different prestige tag set than character ${characterIds[0]}; tags are not character-agnostic`);
      }
      if (rows.some(r => r.state !== 1)) {
        throw new Error(`Character ${id} has a prestige row with State != 1 in the 100% reference save`);
      }
    }
    if (first.length !== 28) throw new Error(`Reference has ${first.length} prestige rows; expected 28`);

    const skills = first.map(row => {
      const health = /^PlayerSkill\.Prestige\.Health\.(\d{2})$/.exec(row.name);
      const speed = /^PlayerSkill\.Prestige\.SpeedBuff\.(\d{2})$/.exec(row.name);
      if (!health && !speed) throw new Error(`Unknown prestige reference row: ${row.name}`);
      return { name: row.name, kind: health ? 'health' : 'speed', threshold: health ? Number(health[1]) : Number(speed[1]) * 6 };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const canonical = {
      schemaVersion: 1,
      extractedAt: new Date().toISOString(),
      sourceFile: path.basename(source),
      verifiedAcrossCharacters: characterIds.length,
      count: skills.length,
      skills
    };
    fs.writeFileSync(output, `${JSON.stringify(canonical, null, 2)}\n`);
    console.log(`Extracted ${skills.length} canonical prestige skill tags (verified identical and granted across ${characterIds.length} characters).`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
