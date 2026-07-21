'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const endpoint = 'https://theforeverwinter.wiki.gg/api.php';
const output = path.join(__dirname, '..', 'data', 'wiki-items.snapshot.json');

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ForeverWinterSaveEditor/0.9 item-map-audit' } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`Wiki API returned HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const items = [];
  for (let offset = 0; ; offset += 500) {
    const params = new URLSearchParams({ action: 'cargoquery', format: 'json', tables: 'Items', fields: 'Name,_pageName,Image,InternalTag,Category__full', limit: '500', offset: String(offset) });
    const payload = await getJson(`${endpoint}?${params}`);
    const batch = (payload.cargoquery || []).map(row => {
      const value = row.title || {};
      return { name: value.Name || null, page: value._pageName || null, imageFile: value.Image || null, internalTag: value.InternalTag || null, categories: (value['Category  full'] || '').split(',').map(part => part.trim()).filter(Boolean) };
    });
    items.push(...batch);
    if (batch.length < 500) break;
  }
  const snapshot = { schemaVersion: 1, fetchedAt: new Date().toISOString(), sourceUrl: endpoint, cargoTable: 'Items', items };
  fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Fetched ${items.length} structured wiki item records.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
