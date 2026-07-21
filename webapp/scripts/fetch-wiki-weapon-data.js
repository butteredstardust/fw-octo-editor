'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const endpoint = 'https://theforeverwinter.wiki.gg/api.php';
const output = path.join(__dirname, '..', 'data', 'wiki-weapons.snapshot.json');
const tables = {
  Weapons: 'Name,InternalClass,Category__full,Damage,MaxRoF,Splash,Knockdown,Pellets,Threat,FireModes__full,Magazine,Recoil,Accuracy,Stability,Ammo__full,_pageName',
  WeaponParts: 'Name,MagCapacity,Suppressed,Fov,Rof,Stability,Accuracy,RecoilWrist,RecoilArm,StabilizationSpeed,StabilizationLength,ReloadSpeed,AdsSpeed,Damage,Other,Slot,Level,RequiredXp,_pageName',
  WeaponPartCompatibility: 'Name,CompatibleWeapon,CompatibleParts__full,_pageName'
};

function getJson(url) {
  return new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'ForeverWinterSaveEditor/0.9 weapon-build-audit' } }, response => {
    let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
    response.on('end', () => { if (response.statusCode !== 200) return reject(new Error(`Wiki API returned HTTP ${response.statusCode}`)); try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
  }).on('error', reject));
}

async function fetchTable(table, fields) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const params = new URLSearchParams({ action: 'cargoquery', format: 'json', tables: table, fields, limit: '500', offset: String(offset) });
    const payload = await getJson(`${endpoint}?${params}`);
    const batch = (payload.cargoquery || []).map(row => row.title || {}); rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

async function main() {
  const revisions = await getJson(`${endpoint}?${new URLSearchParams({ action:'query', format:'json', prop:'revisions', titles:'Weapons|Weapon parts', rvprop:'ids|timestamp', rvlimit:'1' })}`);
  const data = {};
  for (const [table, fields] of Object.entries(tables)) data[table] = await fetchTable(table, fields);
  const snapshot = { schemaVersion: 1, fetchedAt: new Date().toISOString(), sourceUrl: endpoint, attribution: 'The Forever Winter Wiki contributors (CC BY-SA)', revisions: revisions.query?.pages || {}, tables: data };
  fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length])));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
