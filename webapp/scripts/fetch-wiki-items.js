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

// Most items have no Buffs/Debuffs (those Cargo fields only exist for
// consumables with a mechanical effect) but nearly every item page has a
// free-text "==Description==" section, e.g. Nuts: "A handful of nuts.
// Useful for fastening things together." That section isn't in Cargo at
// all -- it's page wikitext -- so it has to be fetched and parsed separately.
function extractDescription(wikitext) {
  if (!wikitext) return null;
  const match = wikitext.match(/==\s*Description\s*==\s*\n([\s\S]*?)(?=\n==|$)/i);
  if (!match) return null;
  const text = match[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[(?:https?:)?\/\/\S+\s+([^\]]*)\]/g, '$1')
    .replace(/\[(?:https?:)?\/\/\S+\]/g, '')
    .replace(/<nowiki>([\s\S]*?)<\/nowiki>/g, '$1')
    .replace(/'''''(.+?)'''''/g, '$1')
    .replace(/'''(.+?)'''/g, '$1')
    .replace(/''(.+?)''/g, '$1')
    .replace(/<[^>]+>/g, '')
    .split('\n').map(line => line.trim().replace(/^[*#]+\s*/, '')).filter(Boolean).join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return text && !/^none\.?$/i.test(text) ? text : null;
}

async function fetchDescriptions(pageNames) {
  const descByPage = new Map();
  const unique = [...new Set(pageNames.filter(Boolean))];
  const batchSize = 50;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'revisions',
      rvslots: 'main', rvprop: 'content', titles: batch.join('|')
    });
    const payload = await getJson(`${endpoint}?${params}`);
    for (const page of payload.query?.pages || []) {
      const content = page.revisions?.[0]?.slots?.main?.content;
      descByPage.set(page.title, extractDescription(content));
    }
  }
  return descByPage;
}

async function main() {
  const items = [];
  for (let offset = 0; ; offset += 500) {
    const params = new URLSearchParams({ action: 'cargoquery', format: 'json', tables: 'Items', fields: 'Name,_pageName,Image,InternalTag,Category__full,Buffs,Debuffs', limit: '500', offset: String(offset) });
    const payload = await getJson(`${endpoint}?${params}`);
    const batch = (payload.cargoquery || []).map(row => {
      const value = row.title || {};
      // Buffs/Debuffs are Cargo "Wikitext" fields. In practice (sampled the
      // full live table) they're plain sentences or simple "*line\n*line"
      // bullet lists -- no [[links]], {{templates}}, or '''bold''' seen
      // anywhere. "None"/"None."/"" are the wiki's own way of saying a field
      // doesn't apply; normalized to null. Bulleted multi-line values are
      // joined with " * " so they stay a single readable line on an item card.
      const clean = text => {
        const raw = String(text || '').trim();
        if (!raw) return null;
        const lines = raw.split('\n').map(line => line.replace(/^\*\s*/, '').trim()).filter(Boolean);
        const joined = lines.join(' * ');
        return joined && !/^none\.?$/i.test(joined) ? joined : null;
      };
      return { name: value.Name || null, page: value._pageName || null, imageFile: value.Image || null, internalTag: value.InternalTag || null, categories: (value['Category  full'] || '').split(',').map(part => part.trim()).filter(Boolean), buffs: clean(value.Buffs), debuffs: clean(value.Debuffs) };
    });
    items.push(...batch);
    if (batch.length < 500) break;
  }
  const descByPage = await fetchDescriptions(items.map(item => item.page));
  for (const item of items) item.description = item.page ? (descByPage.get(item.page) ?? null) : null;
  const snapshot = { schemaVersion: 1, fetchedAt: new Date().toISOString(), sourceUrl: endpoint, cargoTable: 'Items', items };
  fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  const withDescription = items.filter(item => item.description).length;
  console.log(`Fetched ${items.length} structured wiki item records (${withDescription} with a Description section).`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
