const { test, expect } = require('@playwright/test');
const express = require('express');
const path = require('node:path');

let server;
let baseURL;

test.beforeAll(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, '..', '..', 'public')));
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

async function mockApi(page) {
  await page.route('**/api/**', route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body = { success: true, afterIntegrity: { passed: true }, afterFk: { passed: true }, operationId: 'fixture', backupId: 'fixture' };
    if (pathname === '/api/dashboard') body = { character: { tag: 'Pawn.Player.Gunhead', shortName: 'Gunhead', level: 1, xp: 0 }, loadout: {}, quests: [], inventory: [], currencies: { WaterBarrels: 10, TestCurrency: 20 } };
    else if (pathname === '/api/characters') body = [];
    else if (pathname === '/api/inventory') body = [];
    else if (pathname === '/api/rigs') body = { rigs: [] };
    else if (pathname === '/api/vendors') body = { factions: [], traders: [] };
    else if (pathname === '/api/hub-upgrades') body = [];
    else if (pathname === '/api/weapon-xp') body = [];
    else if (pathname === '/api/repair') body = { repairs: [], iff: [], destroyed: [] };
    else if (pathname === '/api/presets') body = { weapons: [], rigs: [], summary: { weaponPresets: 0, rigPresets: 0, activeWeaponPreset: null } };
    else if (pathname === '/api/weapon-builds') body = { categories: [], weapons: [] };
    else if (pathname === '/api/weapon-xp/reference') body = {};
    else if (pathname === '/api/stats') body = { player: { kills: 12, deaths: 3, extractions: 9, downed: 1, attacks: 20, xp: 500 }, damage: { Europa: { damage: 1000, kills: 5 }, UnknownFaction: { damage: 250, kills: 2 } }, factions: { Europa: { attacks: 10, kills: 5 }, UnknownFaction: { attacks: 4, kills: 2 } }, characters: { Gunhead: { kills: 8, extractions: 6, deaths: 2 }, UnknownCharacter: { kills: 1, extractions: 1, deaths: 0 } }, maps: [{ map: 'L_AshenMesa_WP', entry: 10, extract: 7, death: 4 }], territory: [{ location: 'AshenMesa', factions: { Europa: .6, UnknownFaction: .4 } }] };
    else if (pathname === '/api/backups') body = [];
    else if (pathname === '/api/settings') body = { activeSaveDir: 'fixture', defaultSaveDir: 'fixture', keySource: 'resource' };
    else if (pathname === '/api/diagnostics') body = { compatibility: { compatible: true }, inventoryRoundTrip: { byteIdentical: true }, writeReady: true };
    else if (pathname === '/api/status') body = { gameRunning: false, compatibility: { compatible: true }, writeReady: true, mutation: {}, activeSaveDir: 'fixture' };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

// D1: every SPA route boots without uncaught errors or failed asset requests.
const PAGES = ['dashboard', 'characters', 'weapon-builds', 'presets', 'weapon-xp', 'vendors', 'stats', 'hub-upgrades', 'crafting', 'repair', 'inventory', 'add-items', 'rigs', 'backups', 'diagnostics', 'settings'];

for (const pageName of PAGES) {
  test(`page "${pageName}" navigates and boots cleanly`, async ({ page }) => {
    const pageErrors = [];
    const failedAssets = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => failedAssets.push(request.url()));
    await mockApi(page);
    await page.goto(baseURL);
    await page.locator(`[data-page="${pageName}"]`).click();
    await expect(page.locator(`#page-${pageName}`)).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(failedAssets).toEqual([]);
  });
}

// D2: Acknowledgements dialog opens, shows the gif, and returns focus on close.
test('acknowledgements dialog opens with the gif and returns focus to the info button', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await mockApi(page);
  await page.goto(baseURL);

  await page.locator('#infoButton').click();
  const dialog = page.locator('#acknowledgementsDialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#ackCloseButton')).toBeFocused();
  await expect(dialog.locator('img.ack-banner')).toHaveAttribute('src', 'mc_loop_res1.gif');
  await expect(dialog.locator('#ackDialogTitle')).toContainText('Acknowledgements');

  await dialog.locator('#ackDialogBody').click();
  await expect(dialog).toBeVisible();
  await dialog.evaluate(node => node.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true })));
  await expect(dialog).toBeHidden();
  await expect(page.locator('#infoButton')).toBeFocused();
  expect(pageErrors).toEqual([]);
});

// D2: the application title actually renders in the Black Ops One typeface.
// Checking computed font-family alone only proves the CSS *declares* the
// font -- it stays 'Black Ops One' in the stack even if the browser silently
// fails to fetch it (which is exactly what happened when CSP's style-src
// blocked the old fonts.googleapis.com stylesheet, and this same assertion
// kept passing throughout). Assert the font actually finished loading via
// the FontFaceSet API instead.
test('application title uses the Black Ops One font family', async ({ page }) => {
  await mockApi(page);
  await page.goto(baseURL);
  const fontFamily = await page.locator('.header h1').evaluate(el => getComputedStyle(el).fontFamily);
  expect(fontFamily.toLowerCase()).toContain('black ops one');
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => document.fonts.check("16px 'Black Ops One'"));
  expect(loaded).toBe(true);
});
