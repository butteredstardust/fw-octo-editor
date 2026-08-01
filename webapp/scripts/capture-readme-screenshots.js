/* Capture README visuals from local static assets and deliberately fictional API data. */
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const output = path.join(root, '..', 'docs', 'screenshots');
const status = { gameRunning: [], compatibility: { compatible: true }, writeReady: true, mutation: {}, activeSaveDir: 'demo-fixture', blockingReasons: [] };
const dashboard = { character: { tag: 'Pawn.Player.Gunhead', shortName: 'Gunhead', level: 8, xp: 48000 }, loadout: { rig: 'Medium Rig', weapon: { weapon: 'RFL01', nickname: 'Ash Runner', attachments: [] } }, quests: [{ name: 'Demo patrol', progress: 3, target: 5 }], inventory: [{ name: 'Ammo_762', quantity: 180 }], currencies: { WaterBarrels: 42, TestCurrency: 12500 } };
const characters = [
  { name: 'Pawn.Player.Gunhead', characterId: 'demo-gunhead', level: 8, xp: 48000 },
  { name: 'Pawn.Player.OldMan', characterId: 'demo-oldman', level: 3, xp: 12000 },
  { name: 'Pawn.Player.Shrapnel', characterId: 'demo-shrapnel', level: 5, xp: 27000 }
];
const stats = { player: { kills: 842, deaths: 38, extractions: 116, downed: 57, attacks: 1540, xp: 284000 }, damage: { Europa: { damage: 173000, kills: 302 }, Euruska: { damage: 129000, kills: 231 } }, factions: { Europa: { attacks: 510, kills: 302 }, Euruska: { attacks: 420, kills: 231 } }, characters: { Gunhead: { kills: 448, extractions: 62, deaths: 16 }, OldMan: { kills: 241, extractions: 37, deaths: 12 } }, maps: [{ map: 'L_AshenMesa_WP', entry: 93, extract: 71, death: 18 }, { map: 'L_MechTrenches_WP', entry: 67, extract: 45, death: 20 }], territory: [{ location: 'AshenMesa', factions: { Europa: .6, Euruska: .4 } }] };
const weaponBuilds = { categories: ['Rifles'], weapons: [{ id: 'RFL01', name: 'AK', category: 'Rifles', weaponOwned: true, stats: { damage: 42, magazine: 30 }, build: { score: '92/100', suppressionMessage: 'Suppressed ready', owned: 2, missing: 2, suppressed: true, parts: [{ slot: 'Muzzle', name: 'Suppressor', itemId: 'Demo.Suppressor', stats: { recoilArm: 4 }, dependencies: [], missing: false, owned: 1 }, { slot: 'Optic', name: 'Red Dot', itemId: 'Demo.RedDot', stats: { accuracy: 6 }, dependencies: [], missing: true, owned: 0 }, { slot: 'Magazine', name: 'Extended Magazine', itemId: 'Demo.Mag', stats: { magazine: 10 }, dependencies: [], missing: true, owned: 0 }] } }] };
const inventory = [{ name: 'Ammo_762', quantity: 180, sourceMap: 'Items' }, { name: 'Medkit', quantity: 12, sourceMap: 'Items' }, { name: 'Drone_FastTravel', quantity: 1, sourceMap: 'Items' }, { name: 'RFL01', quantity: 1, sourceMap: 'Items' }];

function response(pathname) {
  if (pathname === '/api/session') return { csrfToken: 'demo-token' };
  if (pathname === '/api/status') return status;
  if (pathname === '/api/dashboard') return dashboard;
  if (pathname === '/api/characters') return characters;
  if (pathname === '/api/stats') return stats;
  if (pathname === '/api/weapon-builds') return weaponBuilds;
  if (pathname === '/api/inventory') return inventory;
  if (pathname === '/api/weapon-xp' || pathname === '/api/hub-upgrades' || pathname === '/api/vendors') return [];
  if (pathname === '/api/weapon-xp/reference') return {};
  if (pathname === '/api/rigs') return { rigs: [] };
  if (pathname === '/api/repair') return { repairs: [], iff: [], destroyed: [] };
  if (pathname === '/api/presets') return { weapons: [], rigs: [], summary: {} };
  if (pathname === '/api/backups') return [];
  if (pathname === '/api/settings') return { activeSaveDir: 'demo-fixture', defaultSaveDir: 'demo-fixture', keySource: 'resource' };
  if (pathname === '/api/diagnostics') return { compatibility: { compatible: true }, inventoryRoundTrip: { byteIdentical: true }, writeReady: true };
  return { success: true, afterIntegrity: { passed: true }, afterFk: { passed: true } };
}

const PAGES = [
  ['overview', '#dashboard', '#dashCharacter'], ['characters', '#characters', '#charactersList'],
  ['weapon-builds', '#weapon-builds', '#weaponBuildContent'], ['inventory', '#inventory', '#inventoryList'],
  ['stats', '#stats', '#statsContent'], ['acknowledgements', '#dashboard', '#dashCharacter', true]
];

// `--live[=url]` captures a running server (npm start) with its real save data
// instead of serving public/ with the fictional fixtures above. Read-only: the
// script never clicks anything that mutates.
function liveUrl() {
  const arg = process.argv.slice(2).find(value => value === '--live' || value.startsWith('--live='));
  if (!arg) return null;
  return arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : 'http://127.0.0.1:3000';
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const live = liveUrl();
  let server = null;
  if (!live) {
    const app = express();
    app.use(express.static(path.join(root, 'public')));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  }
  const baseURL = live || `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const [name, hash, ready, modal] of PAGES) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      if (!live) await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(response(new URL(route.request().url()).pathname)) }));
      await page.goto(`${baseURL}/${hash}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.locator(ready).waitFor({ state: 'visible' });
      // A live save may raise the pre-flight banner; it pushes the page content
      // down and says nothing about the feature being illustrated.
      const preflightDismiss = page.locator('#preflightDismissButton');
      if (await preflightDismiss.isVisible().catch(() => false)) await preflightDismiss.click();
      if (modal) await page.locator('#infoButton').click();
      // Nav clicks move focus to the page heading; the focus ring reads as an
      // artifact in a still image.
      else await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(live ? 1000 : 250);
      await page.screenshot({ path: path.join(output, `${name}.png`) });
      console.log(`Captured ${name}.png`);
      await page.close();
    }
  } finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
