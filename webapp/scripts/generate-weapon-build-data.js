'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const snapshot = require('../data/wiki-weapons.snapshot.json');
const canonical = require('../data/items.canonical.json').items;
const byName = new Map();
for (const item of Object.values(canonical)) {
  const key = item.displayName.toLowerCase();
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(item);
}
const num = value => value === '' || value == null ? 0 : Number(value);
const split = value => String(value || '').split(',').map(v => v.trim()).filter(Boolean);
const unresolved = [], duplicates = [];
function exact(name, kind) {
  const matches = byName.get(String(name).toLowerCase()) || [];
  if (matches.length !== 1) { (matches.length ? duplicates : unresolved).push({ kind, name, matches: matches.map(item => item.id) }); return null; }
  return matches[0];
}
const partByName = new Map();
for (const row of snapshot.tables.WeaponParts) {
  const mapped = exact(row.Name, 'part');
  const part = { name:row.Name, itemId:mapped?.id || null, inventoryMap:mapped?.inventoryMap || null, imageUrl:mapped?.wiki?.imageUrl || null, slot:row.Slot || 'Other', level:num(row.Level), requiredXp:num(row.RequiredXp), suppressed:String(row.Suppressed)==='1', stats:{ magazine:num(row.MagCapacity), fov:num(row.Fov), rof:num(row.Rof), stability:num(row.Stability), accuracy:num(row.Accuracy), recoilWrist:num(row.RecoilWrist), recoilArm:num(row.RecoilArm), stabilizationSpeed:num(row.StabilizationSpeed), stabilizationLength:num(row.StabilizationLength), reloadSpeed:num(row.ReloadSpeed), adsSpeed:num(row.AdsSpeed), damage:num(row.Damage) }, other:row.Other || '' };
  partByName.set(part.name, part);
}
const compatibility = new Map();
for (const row of snapshot.tables.WeaponPartCompatibility) {
  if (!compatibility.has(row.CompatibleWeapon)) compatibility.set(row.CompatibleWeapon, []);
  compatibility.get(row.CompatibleWeapon).push({ partName:row.Name, dependencies:split(row['CompatibleParts  full']) });
}
const incompatible = [];
const weapons = [];
for (const row of snapshot.tables.Weapons.filter(row => split(row['Category  full']).includes('Weapons'))) {
  const mapped = exact(row.Name, 'weapon');
  if (!mapped) continue;
  const links = compatibility.get(row.Name) || [];
  const parts = [];
  for (const link of links) {
    const part = partByName.get(link.partName);
    const deps = link.dependencies.map(name => partByName.get(name)).filter(Boolean);
    if (!part || !part.itemId || deps.length !== link.dependencies.length || deps.some(dep => !dep.itemId)) { incompatible.push({ weapon:row.Name, part:link.partName, dependencies:link.dependencies, reason:'unresolved canonical record' }); continue; }
    parts.push({ ...part, dependencies:deps.map(dep => ({ name:dep.name, itemId:dep.itemId, inventoryMap:dep.inventoryMap, slot:dep.slot })) });
  }
  weapons.push({ id:mapped.id, name:row.Name, inventoryMap:mapped.inventoryMap, imageUrl:mapped.wiki.imageUrl, category:split(row['Category  full']).find(value => value !== 'Weapons') || 'Weapons', internalClass:row.InternalClass, stats:{ damage:num(row.Damage), rof:num(row.MaxRoF), magazine:num(row.Magazine), recoil:num(row.Recoil), accuracy:num(row.Accuracy), stability:num(row.Stability), pellets:num(row.Pellets) }, parts });
}
const generatedAt = new Date().toISOString();
fs.writeFileSync(path.join(root,'data','weapon-builds.canonical.json'), `${JSON.stringify({ schemaVersion:1, generatedAt, source:{ fetchedAt:snapshot.fetchedAt, sourceUrl:snapshot.sourceUrl, attribution:snapshot.attribution, revisions:snapshot.revisions }, weapons },null,2)}\n`);
fs.writeFileSync(path.join(root,'data','weapon-build-audit.json'), `${JSON.stringify({ schemaVersion:1, generatedAt, counts:{ weapons:weapons.length, mappedParts:[...partByName.values()].filter(p=>p.itemId).length, unresolved:unresolved.length, duplicates:duplicates.length, excludedCompatibility:incompatible.length }, unresolved, duplicates, excludedCompatibility:incompatible },null,2)}\n`);
console.log({ weapons:weapons.length, mappedParts:[...partByName.values()].filter(p=>p.itemId).length, unresolved:unresolved.length, excludedCompatibility:incompatible.length });
