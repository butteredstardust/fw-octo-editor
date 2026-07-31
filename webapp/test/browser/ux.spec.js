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
    else if (pathname === '/api/vendors') body = options.vendors || { factions: [], traders: [] };
    else if (pathname === '/api/characters') body = options.characters || [];
    else if (pathname === '/api/stats') body = options.stats || { player: {}, damage: {}, factions: {}, characters: {}, maps: [], territory: [] };
    else if (pathname === '/api/weapon-builds') body = options.weaponBuilds || { categories: [], weapons: [] };
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
  await expect(page.locator('[data-action="set-resource"]')).toHaveCount(2);
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
  await expect(page.locator('#weaponXpOperationStatus .receipt')).toContainText('Change verified');
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

test('confirmation dialog uses action-specific tone and Cancel/Escape are no-ops with focus return', async ({ page }) => {
  const weapon = { id: 'A', name: 'A', category: 'Rifle', weaponOwned: true, stats: {}, build: { missing: 1, owned: 0, score: 50, parts: [], suppressed: false, suppressionMessage: '' } };
  const mutations = await mockApi(page, { weaponBuilds: { categories: ['Rifle'], weapons: [weapon] } });
  await page.goto(baseURL);
  await page.locator('[data-page="weapon-builds"]').click();
  const trigger = page.locator('#weaponBuildAddOwned');
  await trigger.click();
  await expect(page.locator('#appDialog')).toBeVisible();
  await expect(page.locator('#appDialogTitle')).toHaveText('Add recommended parts?');
  await expect(page.locator('#appDialogAccept')).toHaveText(/Add recommended parts/);
  // Adding parts goes through the same inventory-write path as any ordinary
  // Add Item and is not destructive, so it deliberately carries the neutral
  // primary tone. Reserving warn/danger for actions that actually destroy
  // progress is what keeps those warnings meaningful -- the destructive case
  // is asserted below so this stays a tone *contrast* test, not just a
  // recording of whatever tone the code happens to use.
  await expect(page.locator('#appDialogAccept')).toHaveClass(/btn-primary/);
  await expect(page.locator('#appDialogAccept')).not.toHaveClass(/btn-warn|danger-btn/);
  await expect(page.locator('#appDialogAccept .action-icon')).toHaveCount(1);
  await page.locator('#appDialogCancel').click();
  await expect(trigger).toBeFocused();
  expect(mutations).toHaveLength(0);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#appDialog')).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(mutations).toHaveLength(0);
});

test('destructive actions keep the danger tone that routine adds gave up', async ({ page }) => {
  const mutations = await mockApi(page, { characters: [{ characterId: 'fixture', name: 'Gunhead', level: 3, xp: 0 }] });
  await page.goto(baseURL);
  await page.locator('[data-page="characters"]').click();
  await page.locator('[data-action="apply-prestige"]').first().click();
  await expect(page.locator('#appDialog')).toBeVisible();
  await expect(page.locator('#appDialogTitle')).toHaveText('Apply prestige?');
  await expect(page.locator('#appDialogAccept')).toHaveClass(/danger-btn/);
  // The body must state the actual consequence (a skill reset), not a vague
  // "experimental" hedge of the kind that was removed from routine adds.
  await expect(page.locator('#appDialogMessage')).toContainText('resets this character');
  await page.locator('#appDialogCancel').click();
  expect(mutations).toHaveLength(0);
});

test('Weapon Builds bulk action reports positive and zero missing states', async ({ page }) => {
  const weapon = (id, missing) => ({ id, name: id, category: 'Rifle', weaponOwned: true, stats: {}, build: { missing, owned: 0, score: 50, parts: [], suppressed: false, suppressionMessage: '' } });
  await mockApi(page, { weaponBuilds: { categories: ['Rifle'], weapons: [weapon('A', 2), weapon('B', 1)] } });
  await page.goto(baseURL);
  await page.locator('[data-page="weapon-builds"]').click();
  await expect(page.locator('#weaponBuildOwnedSummary')).toContainText('3 missing parts across 2 owned weapons');
  await expect(page.locator('#weaponBuildAddOwned')).toBeEnabled();

  await page.unroute('**/api/**');
  await mockApi(page, { weaponBuilds: { categories: ['Rifle'], weapons: [weapon('A', 0)] } });
  await page.reload();
  await page.locator('[data-page="weapon-builds"]').click();
  await expect(page.locator('#weaponBuildOwnedSummary')).toContainText('Nothing missing');
  await expect(page.locator('#weaponBuildAddOwned')).toBeDisabled();
});

test('Stats renders exact accessible comparisons, unknown entities, and narrow layouts safely', async ({ page }) => {
  const probe = '<img data-stats-probe src=x onerror="window.__statsProbe=1">';
  await page.setViewportSize({ width: 390, height: 740 });
  await mockApi(page, { stats: {
    player: { kills: 12, deaths: 3, extractions: 9, downed: 1, attacks: 20, xp: 123456 },
    damage: { Europa: { damage: 1000, kills: 5 }, [probe]: { damage: 250, kills: 2 } },
    factions: { Europa: { attacks: 10, kills: 5 }, [probe]: { attacks: 4, kills: 2 } },
    characters: { Gunhead: { kills: 8, extractions: 6, deaths: 2 }, [probe]: { kills: 1, extractions: 1, deaths: 0 } },
    maps: [{ map: 'L_AshenMesa_WP', entry: 10, extract: 7, death: 4 }],
    territory: [{ location: 'AshenMesa', factions: { Europa: .6, [probe]: .4 } }]
  } });
  await page.goto(baseURL);
  await page.evaluate(() => document.querySelector('[data-page="stats"]').click());
  await expect(page.locator('.stats-kpi')).toContainText(['12', '3', '4.00', '9']);
  await expect(page.locator('[role="img"][aria-label="Damage: 1,000"]')).toHaveCount(1);
  await expect(page.locator('.map-stats-card')).toContainText('70');
  await expect(page.locator('.map-stats-card')).toContainText('40');
  await expect(page.locator('[role="img"][aria-label="Extraction rate: 70%"]')).toHaveCount(1);
  await expect(page.locator('[role="img"][aria-label="Death rate: 40%"]')).toHaveCount(1);
  await expect(page.locator('#statsContent')).toContainText(probe);
  await expect(page.locator('[data-stats-probe]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__statsProbe)).toBeUndefined();
  const overflow = await page.locator('#page-stats').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

// Both controls below pass their value via a data-value attribute, which routes
// through validateInteger() rather than reading an input. That helper was never
// destructured from FW in either module, so each button threw a ReferenceError
// that the dispatcher swallowed into a generic failure banner -- the control
// looked live but silently did nothing. These assert the mutation is issued.
test('vendor trust tier presets issue the mutation they advertise', async ({ page }) => {
  const mutations = await mockApi(page, {
    vendors: { factions: [{ faction: 'Scavengers', scope: 'Scavengers', score: 0 }], traders: [] }
  });
  await page.goto(baseURL);
  await page.locator('[data-page="vendors"]').click();
  const preset = page.locator('[data-action="set-faction"][data-value]').first();
  await expect(preset).toBeVisible();
  await preset.click();
  await expect.poll(() => mutations.length).toBe(1);
  expect(mutations[0].pathname).toContain('/api/vendors');
});

test('per-weapon "set XP" preset button issues the mutation it advertises', async ({ page }) => {
  const mutations = await mockApi(page, {
    weaponXp: [{ weapon: 'Scope.Weapon.RFL12', xp: 100 }],
    weaponReference: { 'Scope.Weapon.RFL12': 1000 }
  });
  await page.goto(baseURL);
  await page.locator('[data-page="weapon-xp"]').click();
  const preset = page.locator('[data-action="set-weapon-xp"][data-value]').first();
  await expect(preset).toBeVisible();
  await preset.click();
  await expect.poll(() => mutations.length).toBe(1);
  expect(mutations[0].body).toMatchObject({ xp: 100000 });
});
