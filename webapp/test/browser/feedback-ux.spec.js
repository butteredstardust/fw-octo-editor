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

// A raw backend error exactly like the ones this feature guards against:
// an absolute Windows tool path plus a SQL fragment. It must never render
// inline as visible text -- only inside the collapsed technical-details
// disclosure -- while the visible copy stays a plain sentence.
const RAW_TECHNICAL_ERROR = 'cipher_compatibility mismatch decrypting file at C:\\Users\\Admin\\AppData\\Local\\ForeverWinter\\Saved\\SaveGames\\primary.sav ; SELECT * FROM Currencies WHERE Id=1';

async function mockApi(page, options = {}) {
  const mutations = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== 'GET') mutations.push({ pathname, method, body: request.postDataJSON() });
    if (pathname === '/api/session') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: 'fixture-token' }) }); return; }
    if (pathname === '/api/status') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gameRunning: [], compatibility: { compatible: true }, writeReady: true, mutation: {}, activeSaveDir: 'fixture', blockingReasons: [] }) }); return; }
    if (options.failResource && pathname === '/api/currencies/WaterBarrels' && method === 'PUT') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: RAW_TECHNICAL_ERROR }) });
      return;
    }
    let body;
    if (pathname === '/api/dashboard') body = options.dashboard || { character: { tag: 'Pawn.Player.Gunhead', shortName: 'Gunhead', level: 1, xp: 0 }, loadout: {}, quests: [], inventory: [], currencies: { WaterBarrels: 10, TestCurrency: 20 } };
    else if (pathname === '/api/vendors') body = { factions: [], traders: [] };
    else if (pathname === '/api/vault') body = { items: [], currency: { amount: 0 } };
    else if (pathname === '/api/characters') body = options.characters || [];
    else if (pathname === '/api/inventory') body = options.inventory || [];
    else if (pathname === '/api/inventory/catalog') body = options.addCatalog || [];
    else body = { success: true, added: true, afterIntegrity: { passed: true }, afterFk: { passed: true }, operationId: 'fixture-op', backupId: 'fixture-backup' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return mutations;
}

test('a raw backend error shows a plain-language sentence inline, with the raw SQL/path text only inside the collapsed technical disclosure', async ({ page }) => {
  await mockApi(page, { failResource: true });
  await page.goto(baseURL);
  await page.locator('#res-WaterBarrels').fill('12');
  await page.locator('[data-action="set-resource"][data-id="WaterBarrels"]').click();

  const msg = page.locator('#resmsg-WaterBarrels');
  await expect(msg).toContainText('The database key could not open this save.');
  // The raw technical string is present in the DOM (inside the collapsed
  // disclosure below) but must not be part of the rendered, visible text --
  // innerText (unlike textContent) respects the disclosure's collapsed
  // display:none state, so this is the right check for "not shown inline".
  const visibleText = await msg.innerText();
  expect(visibleText).not.toContain('primary.sav');
  expect(visibleText).not.toContain('SELECT * FROM Currencies');
  // ...but it is present, collapsed, inside the existing technical-details pattern.
  const details = msg.locator('details.technical-details');
  await expect(details).toHaveCount(1);
  const idSpan = details.locator('.technical-id');
  await expect(idSpan).toContainText('primary.sav');
  // Closed by default -- the raw text is not shown until the user opts in.
  await expect(idSpan).toBeHidden();
  await details.locator('summary').click();
  await expect(idSpan).toBeVisible();
  await expect(idSpan).toContainText('SELECT * FROM Currencies');
});

test('the matching error toast also stays plain-language and is dismissible', async ({ page }) => {
  await mockApi(page, { failResource: true });
  await page.goto(baseURL);
  await page.locator('#res-WaterBarrels').fill('12');
  await page.locator('[data-action="set-resource"][data-id="WaterBarrels"]').click();

  const toast = page.locator('#toastRegion .toast.error').first();
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('database key could not open this save');
  await expect(toast).not.toContainText('primary.sav');

  const dismiss = toast.locator('.toast-dismiss');
  await expect(dismiss).toHaveAttribute('aria-label', 'Dismiss notification');
  await dismiss.click();
  await expect(toast).toHaveCount(0);
});

test('an error toast survives past the old 4200ms auto-expiry until dismissed', async ({ page }) => {
  await mockApi(page, { failResource: true });
  await page.goto(baseURL);
  await page.locator('#res-WaterBarrels').fill('9');
  await page.locator('[data-action="set-resource"][data-id="WaterBarrels"]').click();

  const toast = page.locator('#toastRegion .toast.error').first();
  await expect(toast).toBeVisible();
  await page.waitForTimeout(4700);
  await expect(toast).toBeVisible();
  await toast.locator('.toast-dismiss').click();
  await expect(toast).toHaveCount(0);
});

test('a success toast keeps auto-expiring on its own', async ({ page }) => {
  await mockApi(page);
  await page.goto(baseURL);
  await page.locator('#res-WaterBarrels').fill('12');
  await page.locator('[data-action="set-resource"][data-id="WaterBarrels"]').click();

  const toast = page.locator('#toastRegion .toast:not(.error)').first();
  await expect(toast).toBeVisible();
  await page.waitForTimeout(4700);
  await expect(toast).toHaveCount(0);
});

test('a catalog fetch failure on Manage Inventory produces visible user feedback instead of silently degrading', async ({ page }) => {
  await mockApi(page, { inventory: [{ name: 'Bolts', quantity: 5, sourceMap: 'Items', validLayout: true }] });
  await page.route('**/catalog.json', route => route.fulfill({ status: 500, contentType: 'text/plain', body: 'internal error' }));
  await page.goto(baseURL);
  await page.locator('[data-page="inventory"]').click();

  // Toast fires from loadCatalog()'s catch and persists (it's an error toast).
  const toast = page.locator('#toastRegion .toast.error').first();
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('item catalog');

  // The page itself also carries a persistent banner, not just a toast that
  // could be missed -- covers the "Add Items page silently degrades" case.
  await expect(page.locator('#inventoryList .catalog-warning')).toBeVisible();
  await expect(page.locator('#inventoryList .catalog-warning')).toContainText('Item catalog failed to load');
});
