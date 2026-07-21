'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const endpoint = 'https://theforeverwinter.wiki.gg/api.php';
const output = path.join(__dirname, '..', 'data', 'wiki-recipes.snapshot.json');
const userAgent = 'ForeverWinterSaveEditor/0.9 recipe-audit';

function getJson(params) {
  const url = `${endpoint}?${new URLSearchParams(params)}`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': userAgent } }, response => {
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

async function cargoRows(table, fields) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const payload = await getJson({ action: 'cargoquery', format: 'json', tables: table, fields, limit: '500', offset: String(offset) });
    const batch = (payload.cargoquery || []).map(row => row.title || {});
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

async function main() {
  const [recipes, components, revisions] = await Promise.all([
    cargoRows('CraftingRecipes', 'RecipeId,RecipeType,Product,ProductAmount,Prerequisite,MinimumWater,TimeUnit,TimeAmount,_pageName'),
    cargoRows('CraftingComponents', 'RecipeId,Item,Amount,_pageName'),
    getJson({ action: 'query', format: 'json', prop: 'revisions', rvprop: 'ids|timestamp', titles: 'Workshop|Munitions Printer|Innards' })
  ]);
  const pages = Object.values((revisions.query || {}).pages || {}).map(page => ({
    title: page.title,
    pageId: page.pageid,
    revisionId: page.revisions && page.revisions[0] ? page.revisions[0].revid : null,
    revisionTimestamp: page.revisions && page.revisions[0] ? page.revisions[0].timestamp : null
  })).sort((a, b) => a.title.localeCompare(b.title));
  const snapshot = {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    sourceUrl: endpoint,
    attribution: 'The Forever Winter Wiki contributors, CC BY-SA',
    pages,
    recipes,
    components
  };
  fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Fetched ${recipes.length} recipes and ${components.length} component rows.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
