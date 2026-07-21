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

async function mockApi(page, options = {}) {
  const mutations = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== 'GET') mutations.push({ pathname, method, body: request.postDataJSON() });
    if (options.delayMutation && method !== 'GET') await new Promise(resolve => setTimeout(resolve, options.delayMutation));
    let body;
    if (pathname === '/api/session') body = { csrfToken: 'fixture-token' };
    else if (pathname === '/api/status') body = { gameRunning: [], compatibility: { compatible: true }, writeReady: true, mutation: {}, activeSaveDir: 'fixture', blockingReasons: [] };
    else if (pathname === '/api/dashboard') body = options.dashboard || { character: { tag: 'Pawn.Player.Gunhead', shortName: 'Gunhead', level: 1, xp: 0 }, loadout: {}, quests: [], inventory: [], currencies: { WaterBarrels: 10, TestCurrency: 20 } };
    else if (pathname === '/api/vendors') body = { factions: [], traders: [] };
    else if (pathname === '/api/characters') body = options.characters || [];
    else if (pathname === '/api/hub-upgrades') body = [];
    else if (pathname === '/api/inventory') body = [];
    else if (pathname === '/api/weapon-xp') body = options.weaponXp || [];
    else if (pathname === '/api/weapon-xp/reference') body = options.weaponReference || {};
    else if (pathname === '/api/repair') body = { repairs: [], iff: [], destroyed: [] };
    else body = { success: true, added: true, afterIntegrity: { passed: true }, afterFk: { passed: true }, operationId: 'fixture-op', backupId: 'fixture-backup' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return mutations;
}

test('native modules and external styles boot without frontend errors', async ({ page }) => {
  const pageErrors = [];
  const failedAssets = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedAssets.push(request.url()));
  await mockApi(page);
  await page.goto(baseURL);
  await expect(page.locator('[data-action="set-resource"]')).toHaveCount(5);
  expect(pageErrors).toEqual([]);
  expect(failedAssets).toEqual([]);
  expect(await page.locator('style').count()).toBe(0);
  expect(await page.locator('link[rel="stylesheet"][href*="styles.css"]').count()).toBe(1);
});

test('Overview resources send the current mutation method and JSON body', async ({ page }) => {
  const mutations = await mockApi(page);
  await page.goto(baseURL);
  await page.locator('#res-WaterBarrels').fill('12');
  await page.locator('[data-action="set-resource"][data-id="WaterBarrels"]').click();
  await expect.poll(() => mutations.length).toBeGreaterThan(0);
  expect(mutations[0]).toMatchObject({ pathname: '/api/currencies/WaterBarrels', method: 'PUT', body: { amount: 12 } });

  await page.locator('#res-Drone_Recovery').fill('3');
  await page.locator('[data-action="add-resource"][data-id="Drone_Recovery"]').click();
  await expect.poll(() => mutations.length).toBe(2);
  expect(mutations[1]).toMatchObject({ pathname: '/api/inventory/add', method: 'POST', body: { itemId: 'Drone_Recovery', quantity: 3 } });
});

test('fractional inputs are rejected without issuing a mutation', async ({ page }) => {
  const mutations = await mockApi(page);
  await page.goto(baseURL);
  await page.locator('#res-WaterBarrels').fill('5.5');
  await page.locator('[data-action="set-resource"][data-id="WaterBarrels"]').click();
  await expect(page.locator('#res-WaterBarrels')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#resmsg-WaterBarrels')).toContainText('whole number');
  expect(mutations).toHaveLength(0);
});

test('mobile navigation isolates content and restores toggle focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await mockApi(page);
  await page.goto(baseURL);
  await page.locator('#navToggle').click();
  await expect(page.locator('#main-content')).toHaveAttribute('inert', '');
  await expect(page.locator('#navBackdrop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#main-content')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#navToggle')).toBeFocused();
});

test('a visible single-flight indicator accompanies slow mutations', async ({ page }) => {
  await mockApi(page, { delayMutation: 300 });
  await page.goto(baseURL);
  await page.locator('#res-WaterBarrels').fill('11');
  const click = page.locator('[data-action="set-resource"][data-id="WaterBarrels"]').click();
  await expect(page.locator('#mutationStatus')).toBeVisible();
  await expect(page.locator('#mutationStatusLabel')).toContainText('Updating resources');
  await click;
  await expect(page.locator('#mutationStatus')).toBeHidden();
});

test('primary action colors meet WCAG AA contrast', async ({ page }) => {
  await mockApi(page);
  await page.goto(baseURL);
  const ratio = await page.locator('[data-action="set-resource"][data-id="WaterBarrels"]').evaluate(element => {
    const style = getComputedStyle(element);
    const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = value => rgb(value).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const foreground = luminance(style.color), background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('routine weapon mutations report inline with a verification receipt', async ({ page }) => {
  await mockApi(page, { weaponXp: [{ weapon: 'Scope.Weapon.RFL12', xp: 100 }], weaponReference: { 'Scope.Weapon.RFL12': 1000 } });
  await page.goto(baseURL);
  await page.locator('[data-page="weapon-xp"]').click();
  await page.locator('[id="xp-Scope.Weapon.RFL12"]').fill('250');
  await page.locator('[data-action="set-weapon-xp"]').first().click();
  await expect(page.locator('#weaponXpOperationStatus')).toContainText('Weapon XP set to 250');
  await expect(page.locator('#weaponXpOperationStatus .receipt')).toContainText('Verification details');
  await expect(page.locator('#appDialog')).not.toBeVisible();
});

test('API-provided markup is rendered as inert text', async ({ page }) => {
  const payload = '<img data-escape-probe src=x onerror="window.__escapeProbe=1">';
  await mockApi(page, {
    dashboard: { character: { tag: 'Pawn.Player.Unknown', shortName: payload, level: 1, xp: 0 }, loadout: {}, quests: [], inventory: [], currencies: { WaterBarrels: 10, TestCurrency: 20 } },
    characters: [{ characterId: 'fixture', name: payload, level: 1, xp: 0 }]
  });
  await page.goto(baseURL);
  await expect(page.locator('#dashCharacter')).toContainText(payload);
  await expect(page.locator('[data-escape-probe]')).toHaveCount(0);
  await page.locator('[data-page="characters"]').click();
  await expect(page.locator('#charactersList')).toContainText(payload);
  await expect(page.locator('[data-escape-probe]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__escapeProbe)).toBeUndefined();
});
