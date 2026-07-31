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

const HEALTHY_STATUS = { gameRunning: [], compatibility: { compatible: true, tools: { sqlite3mc: true, uesave: true }, reasons: [] }, writeReady: true, mutation: {}, activeSaveDir: 'C:\\fixture\\saves', blockingReasons: [], appVersion: '0.10.0', verifiedGameVersion: '1.2.3' };

// Mirrors the express-static + page.route API-mocking harness from
// test/browser/ux.spec.js. `options.status` seeds the initial /api/status
// response; tests that need to simulate a status change after load swap it
// out with page.unroute('**/api/**') + mockApi(page, { status: ... }).
async function mockApi(page, options = {}) {
  const mutations = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== 'GET') mutations.push({ pathname, method, body: request.postDataJSON() });
    let body;
    if (pathname === '/api/session') body = { csrfToken: 'fixture-token' };
    else if (pathname === '/api/status') body = options.status || HEALTHY_STATUS;
    else if (pathname === '/api/dashboard') body = { character: { tag: 'Pawn.Player.Gunhead', shortName: 'Gunhead', level: 1, xp: 0 }, loadout: {}, quests: [], inventory: [], currencies: { WaterBarrels: 10, TestCurrency: 20 } };
    else if (pathname === '/api/vendors') body = { factions: [], traders: [] };
    else if (pathname === '/api/characters') body = [];
    else if (pathname === '/api/stats') body = { player: {}, damage: {}, factions: {}, characters: {}, maps: [], territory: [] };
    else if (pathname === '/api/weapon-builds') body = { categories: [], weapons: [] };
    else if (pathname === '/api/hub-upgrades') body = [];
    else if (pathname === '/api/inventory') body = [];
    else if (pathname === '/api/weapon-xp') body = [];
    else if (pathname === '/api/weapon-xp/reference') body = {};
    else if (pathname === '/api/repair') body = { repairs: [], iff: [], destroyed: [] };
    else if (pathname === '/api/backups') body = [];
    else if (pathname === '/api/diagnostics') body = { checkedAt: new Date().toISOString(), gameRunning: [], compatibility: { compatible: true, tools: { sqlite3mc: true, uesave: true }, reasons: [], files: [{ exists: true }, { exists: true }, { exists: true }] }, gameVersion: { detected: false }, inventoryRoundTrip: { byteIdentical: true, bytes: 10, inventoryEntries: 1, maps: [] }, mutation: {}, activeSaveDir: 'C:\\fixture', writeReady: true, steamCloudWarning: 'Steam Cloud may overwrite edited saves.' };
    else body = { success: true, added: true, afterIntegrity: { passed: true }, afterFk: { passed: true }, operationId: 'fixture-op', backupId: 'fixture-backup' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return mutations;
}

// Task 2/1: gameRunning truthiness + broken-value formatting are covered
// structurally in test/shell-ux.test.js; this file focuses on the
// behavioural asks: preflight visibility, nav reachability, and hash
// routing.

test('a healthy status keeps the preflight panel out of the way', async ({ page }) => {
  await mockApi(page, { status: HEALTHY_STATUS });
  await page.goto(baseURL);
  await expect(page.locator('#preflightPanel')).toBeHidden();
});

test('a failing /api/status produces a visible, specific, dismissible preflight message', async ({ page }) => {
  const brokenStatus = { gameRunning: [], compatibility: { compatible: false, tools: { sqlite3mc: false, uesave: true }, reasons: ['missing-sqlite3mc'] }, writeReady: false, mutation: {}, activeSaveDir: '', blockingReasons: ['missing-sqlite3mc'], appVersion: '0.10.0', verifiedGameVersion: null };
  await mockApi(page, { status: brokenStatus });
  await page.goto(baseURL);

  const panel = page.locator('#preflightPanel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('SQLite3MC');
  await expect(panel).toContainText('sqlite3mc_shell_x64.exe');
  // Must not be a modal / focus trap: no <dialog>, and the rest of the page
  // (e.g. the primary nav) stays reachable and interactive.
  await expect(page.locator('dialog#preflightPanel')).toHaveCount(0);
  await page.locator('[data-page="characters"]').click();
  await expect(page.locator('#page-characters')).toHaveClass(/active/);

  // Dismissible, and the dismissal survives an identical follow-up refresh
  // (simulated here via the existing retry-status hook) without the panel
  // popping back up for the exact same unresolved issue.
  await page.locator('#preflightDismissButton').click();
  await expect(panel).toBeHidden();
  await page.evaluate(() => document.getElementById('retryConnectionButton').click());
  await expect(panel).toBeHidden();

  // A genuinely new/different blocker must still surface, since dismissal
  // is scoped to the issue set the user actually saw, not "forever".
  await page.unroute('**/api/**');
  const runningStatus = { ...brokenStatus, compatibility: { compatible: false, tools: { sqlite3mc: false, uesave: true }, reasons: ['missing-sqlite3mc'] }, blockingReasons: ['missing-sqlite3mc', 'game-running'], gameRunning: ['TheForeverWinter.exe'] };
  await mockApi(page, { status: runningStatus });
  await page.evaluate(() => document.getElementById('retryConnectionButton').click());
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('currently running');
});

test('the diagnostics/settings shortcuts on the preflight panel actually navigate', async ({ page }) => {
  const brokenStatus = { gameRunning: [], compatibility: { compatible: false, tools: { sqlite3mc: true, uesave: true }, reasons: ['key-or-database-incompatible'] }, writeReady: false, mutation: {}, activeSaveDir: 'C:\\fixture', blockingReasons: ['key-or-database-incompatible'], appVersion: '0.10.0', verifiedGameVersion: '1.2.3' };
  await mockApi(page, { status: brokenStatus });
  await page.goto(baseURL);
  await expect(page.locator('#preflightPanel')).toBeVisible();
  await page.locator('#preflightPanel [data-page-target="settings"]').click();
  await expect(page.locator('#page-settings')).toHaveClass(/active/);
});

test('SYSTEM nav group (Backups/Diagnostics/Settings) is reachable at 1366x768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockApi(page);
  await page.goto(baseURL);

  const nav = page.locator('#primaryNav');
  const overflowing = await nav.evaluate(el => el.scrollHeight - el.clientHeight > 4);
  if (overflowing) {
    // If the compact density fix alone isn't enough at this viewport, the
    // fade+chevron affordance must actually reflect that there's more below.
    await expect(page.locator('#navScrollHint')).toHaveClass(/visible/);
  }

  const backupsButton = page.locator('[data-page="backups"]');
  await backupsButton.scrollIntoViewIfNeeded();
  await expect(backupsButton).toBeVisible();
  const box = await backupsButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(769);

  await backupsButton.click();
  await expect(page.locator('#page-backups')).toHaveClass(/active/);
});

test('navigating sets the URL hash and a reload restores that page with focus on its heading', async ({ page }) => {
  await mockApi(page);
  await page.goto(baseURL);
  await page.locator('[data-page="weapon-xp"]').click();
  await expect(page).toHaveURL(/#weapon-xp$/);

  await page.reload();
  await expect(page.locator('#page-weapon-xp')).toHaveClass(/active/);
  await expect(page.locator('#page-weapon-xp h2')).toBeFocused();
  await expect(page.locator('[data-page="weapon-xp"]')).toHaveAttribute('aria-current', 'page');
});

test('browser Back restores the previous page via popstate', async ({ page }) => {
  await mockApi(page);
  await page.goto(baseURL);
  await page.locator('[data-page="inventory"]').click();
  await expect(page.locator('#page-inventory')).toHaveClass(/active/);
  await page.locator('[data-page="rigs"]').click();
  await expect(page.locator('#page-rigs')).toHaveClass(/active/);

  await page.goBack();
  await expect(page.locator('#page-inventory')).toHaveClass(/active/);
  await page.goBack();
  await expect(page.locator('#page-dashboard')).toHaveClass(/active/);
});

test('an unknown or malformed hash falls back to Overview and is never injected into the DOM', async ({ page }) => {
  await mockApi(page);
  await page.goto(`${baseURL}#<img src=x onerror=window.__hashProbe=1>`);
  await expect(page.locator('#page-dashboard')).toHaveClass(/active/);
  expect(await page.evaluate(() => window.__hashProbe)).toBeUndefined();
  await expect(page.locator('[data-escape-probe]')).toHaveCount(0);

  await page.goto(`${baseURL}#totally-not-a-real-page`);
  await expect(page.locator('#page-dashboard')).toHaveClass(/active/);
});
