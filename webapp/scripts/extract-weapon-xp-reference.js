'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadKey } = require('../utils/keyLoader');
const { runShell } = require('../utils/validation');

const source = process.argv[2] || path.resolve(__dirname, '..', '..', 'reference', 'YOUR_HASHCODE_HERE.dat');
const output = path.resolve(__dirname, '..', 'data', 'weapon-xp-reference.canonical.json');

// getReferenceWeaponXp() (saveService.js) used to read this reference save at
// request time for per-weapon XP target baselines. These are static 100%-save
// values, not something that varies per live save, so extract once here and
// ship canonical JSON -- avoids a runtime dependency on reference/*.dat, which
// is gitignored and never bundled into release builds (see
// extract-prestige-reference.js for the same fix applied to prestige).
async function main() {
  if (!fs.existsSync(source)) throw new Error(`Reference save not found: ${source}`);
  const key = await loadKey();
  const results = await runShell(source, key, [
    `SELECT ns.Name, sc.Value FROM ScopedCounterValues sc JOIN Names ns ON ns.NameID = sc.ScopeID WHERE ns.Name LIKE 'Scope.Weapon.%' ORDER BY ns.Name`
  ]);
  const weaponXp = {};
  for (const row of results) {
    const [name, value] = row.split('|');
    if (name && name.startsWith('Scope.Weapon.')) weaponXp[name] = parseFloat(value);
  }
  const count = Object.keys(weaponXp).length;
  if (!count) throw new Error('No Scope.Weapon.* rows found in reference save');
  const canonical = { schemaVersion: 1, extractedAt: new Date().toISOString(), sourceFile: path.basename(source), count, weaponXp };
  fs.writeFileSync(output, `${JSON.stringify(canonical, null, 2)}\n`);
  console.log(`Extracted ${count} canonical weapon XP reference values.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
