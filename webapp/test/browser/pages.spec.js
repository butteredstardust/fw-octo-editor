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
    else if (pathname === '/api/presets') body = [];
    else if (pathname === '/api/diagnostics') body = { compatibility: { compatible: true }, inventoryRoundTrip: { byteIdentical: true }, writeReady: true };
    else if (pathname === '/api/status') body = { gameRunning: false, compatibility: { compatible: true }, writeReady: true, mutation: {}, activeSaveDir: 'fixture' };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

// D1: every SPA route boots without uncaught errors or failed asset requests.
const PAGES = ['dashboard', 'characters', 'weapon-builds', 'presets', 'weapon-xp', 'vendors', 'hub-upgrades', 'crafting', 'repair', 'inventory', 'add-items', 'rigs', 'backups', 'diagnostics', 'settings'];

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
  await expect(dialog.locator('img.ack-banner')).toHaveAttribute('src', 'mc_loop_res1.gif');
  await expect(dialog.locator('#ackDialogTitle')).toContainText('Acknowledgements');

  await page.locator('#ackCloseButton').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#infoButton')).toBeFocused();
  expect(pageErrors).toEqual([]);
});

// D2: the application title actually renders in the Black Ops One typeface
// (regression guard for the "old font" caching bug).
test('application title uses the Black Ops One font family', async ({ page }) => {
  await mockApi(page);
  await page.goto(baseURL);
  const fontFamily = await page.locator('.header h1').evaluate(el => getComputedStyle(el).fontFamily);
  expect(fontFamily.toLowerCase()).toContain('black ops one');
});
