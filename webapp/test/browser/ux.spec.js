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
    if (method !== 'GET' && options.mutationErrorPath === pathname) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: options.mutationError || 'fixture mutation failure' }) });
      return;
    }
    let body;
    if (pathname === '/api/session') body = { csrfToken: 'fixture-token' };
    else if (pathname === '/api/status') body = { gameRunning: [], compatibility: { compatible: true }, writeReady: true, mutation: {}, activeSaveDir: 'fixture', blockingReasons: [] };
    else if (pathname === '/api/dashboard') body = options.dashboard || { character: { tag: 'Pawn.Player.Gunhead', shortName: 'Gunhead', level: 1, xp: 0 }, loadout: {}, quests: [], inventory: [], currencies: { WaterBarrels: 10, TestCurrency: 20 } };
    else if (pathname === '/api/vendors') body = options.vendors || { factions: [], traders: [] };
    else if (pathname === '/api/characters') body = options.characters || [];
    else if (pathname === '/api/stats') body = options.stats || { player: {}, damage: {}, factions: {}, characters: {}, maps: [], territory: [] };
    else if (pathname === '/api/weapon-builds') body = options.weaponBuilds || { categories: [], weapons: [] };
    else if (pathname === '/api/presets') body = options.presets || { weapons: [], rigs: [], summary: { weaponPresets: 0, rigPresets: 0, activeWeaponPreset: null } };
    else if (pathname === '/api/rigs') body = options.rigs || { rigs: [], ownedCount: 0, totalCount: 0 };
    else if (pathname === '/api/hub-upgrades') body = [];
    else if (pathname === '/api/inventory') {
      if (options.inventoryError) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'fixture inventory failure' }) });
        return;
      }
      body = options.inventory || [];
    }
    else if (pathname === '/api/inventory/catalog') body = options.inventoryCatalog || [];
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

test('inventory loading clears busy state on errors and empty results', async ({ page }) => {
  await mockApi(page, { inventoryError: true });
  await page.goto(baseURL);
  await page.locator('[data-page="inventory"]').click();
  const list = page.locator('#inventoryList');
  await expect(list).toContainText('Could not load your inventory');
  await expect(list).not.toHaveAttribute('aria-busy', 'true');

  await page.unroute('**/api/**');
  await mockApi(page, { inventory: [] });
  await page.reload();
  await expect(list).toContainText('No matching items');
  await expect(list).not.toHaveAttribute('aria-busy', 'true');
});

test('shared inventory identity renders one technical ID and reusable metadata', async ({ page }) => {
  await mockApi(page, { inventory: [{ name: 'RareLoot_33_Bolts', quantity: 3, sourceMap: 'Items', validLayout: true }] });
  await page.goto(baseURL);
  await page.locator('[data-page="inventory"]').click();
  const card = page.locator('.inv-item');
  await expect(card).toContainText('Bolts');
  await expect(card.locator('.technical-details')).toHaveCount(1);
  await expect(card.locator('.item-taxonomy .item-pill')).not.toHaveCount(0);
  await expect(card.locator('.hv-badge')).toHaveCount(1);
  await expect(card.locator('.item-desc')).toHaveCount(1);
});

test('inventory mutation feedback has shared receipt and accessible error semantics', async ({ page }) => {
  const inventory = [{ name: 'RareLoot_33_Bolts', quantity: 3, sourceMap: 'Items', validLayout: true }];
  await mockApi(page, { inventory });
  await page.goto(baseURL);
  await page.locator('[data-page="inventory"]').click();
  await page.locator('[data-action="update-item"]').click();
  const success = page.locator('#op-RareLoot_33_Bolts');
  await expect(success).toHaveClass(/success/);
  await expect(success).toHaveAttribute('role', 'status');
  await expect(success).toHaveAttribute('aria-live', 'polite');
  await expect(success.locator('.receipt')).toHaveCount(1);

  await page.unroute('**/api/**');
  await mockApi(page, {
    inventory,
    mutationErrorPath: '/api/inventory/update',
    mutationError: 'SQL failed at C:\\private\\save <img data-inline-probe src=x>'
  });
  await page.reload();
  await page.locator('[data-page="inventory"]').click();
  await page.locator('[data-action="update-item"]').click();
  const failure = page.locator('#op-RareLoot_33_Bolts');
  await expect(failure).toHaveClass(/error/);
  await expect(failure).toHaveAttribute('role', 'alert');
  await expect(failure).toHaveAttribute('aria-live', 'assertive');
  await expect(failure).toContainText('This quantity could not be saved.');
  await expect(failure.locator('[data-inline-probe]')).toHaveCount(0);
  await expect(failure.locator('.technical-details')).toContainText('SQL failed');
});

test('Add Items search expands matching sections and section focus survives rerender', async ({ page }) => {
  await mockApi(page, { inventoryCatalog: [
    { id: 'FixtureWeapon', wiki: 'Test Rifle', inventoryMap: 'Weapons', taxonomyTags: ['Weapons', 'Rifle'], have: 0 },
    { id: 'FixtureLoot', wiki: 'Test Relic', inventoryMap: 'Items', taxonomyGroup: 'Loot', taxonomyTags: ['Relic'], have: 0 }
  ] });
  await page.goto(baseURL);
  await page.locator('[data-page="add-items"]').click();
  const headers = page.locator('#addCatalogList .add-cat-head');
  await expect(headers).toHaveCount(2);
  await page.locator('#addSearch').fill('test');
  await expect.poll(() => headers.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-expanded')))).toEqual(['true', 'true']);

  const firstHeader = headers.first();
  const headerId = await firstHeader.getAttribute('id');
  await firstHeader.focus();
  await firstHeader.click();
  await expect(page.locator(`#${headerId}`)).toBeFocused();

  const expandAll = page.locator('#add-items-expand-all');
  await expandAll.focus();
  await expandAll.click();
  await expect(page.locator('#add-items-expand-all')).toBeFocused();
});

test('shared entity cards keep consistent anatomy, escaped content, and narrow layouts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await mockApi(page, { presets: {
    weapons: [{
      active: true,
      bisScore: 4,
      category: 'Rifle',
      saveIndex: 1,
      name: '<img data-card-probe src=x>',
      weaponName: 'Fixture rifle',
      weaponId: 'Fixture.Weapon',
      attachments: [],
      bisSupported: false,
      bisMatches: 0,
      bisMissing: []
    }],
    rigs: [],
    summary: { weaponPresets: 1, rigPresets: 0, activeWeaponPreset: 'Fixture' }
  } });
  await page.goto(`${baseURL}/#presets`);
  const preset = page.locator('.preset-card.card-ui');
  await expect(preset).toHaveCount(1);
  await expect(preset.locator('.card-ui__header h3')).toContainText('<img data-card-probe src=x>');
  await expect(preset.locator('[data-card-probe]')).toHaveCount(0);
  await expect(preset.locator('.card-ui__status .preset-badge.active')).toContainText('Active');
  await expect(preset.locator('.card-ui__footer')).toContainText('No recommended-build comparison available.');
  expect(await preset.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);

  await page.goto(`${baseURL}/#crafting`);
  const recipe = page.locator('.recipe-card.card-ui').first();
  await expect(recipe).toBeVisible();
  await expect(recipe.locator('.card-ui__status .recipe-badge')).toHaveCount(1);
  await expect(recipe.locator('.card-ui__footer .recipe-card-actions button')).toHaveCount(2);
  expect(await recipe.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
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
    damage: {
      All: { moddedDamage: 750, unmoddedDamage: 250, moddedKills: 6, unmoddedKills: 2 },
      Europa: { damage: 1000, kills: 5 },
      [probe]: { damage: 250, kills: 2 }
    },
    factions: { Europa: { attacks: 10, kills: 5 }, [probe]: { attacks: 4, kills: 2 } },
    characters: { Gunhead: { kills: 8, extractions: 6, deaths: 2 }, [probe]: { kills: 1, extractions: 1, deaths: 0 } },
    maps: [
      { map: 'L_AshenMesa_WP', entry: 10, extract: 7, death: 4 },
      { map: 'Dungeon_Tunnel2_01', entry: 2, extract: 1, death: 1 },
      { map: 'Dungeon_Tunnel2_04', entry: 3, extract: 2, death: 1 }
    ],
    territory: [{ location: 'AshenMesa', factions: { Europa: .6, [probe]: .4 } }]
  } });
  await page.goto(baseURL);
  await page.evaluate(() => document.querySelector('[data-page="stats"]').click());
  await expect(page.locator('.stats-kpi')).toContainText(['12', '3', '4.00', '9']);
  // Faction combat profile uses a horizontal grouped bar plus paired data
  // table. Unknown/new faction keys remain in both the denominator and the
  // output, so the shares stay honest after a game update.
  // Select figures by the stable data-chart hook (set by chartFigure()),
  // not by walking ancestors from the canvas -- that selector broke the
  // moment the figure grew extra wrapper markup for small multiples.
  const profileFigure = page.locator('[data-chart="stats-chart-faction-profile"]');
  await expect(page.locator('[role="img"][aria-label*="Faction combat profile"]')).toHaveCount(1);
  await expect(profileFigure).toHaveCount(1);
  // Pin the exact rendered row rather than a bare toContainText('1,000'),
  // which would also pass on any other occurrence of those digits.
  const profileRows = profileFigure.locator('.chart-data-table tbody tr');
  await expect(profileRows.nth(0).locator('td')).toHaveText(['Europa', '1,000', '80.0%', '5', '71.4%']);
  await expect(profileRows.nth(1).locator('td')).toHaveText([probe, '250', '20.0%', '2', '28.6%']);

  const modSplitRows = page.locator('[data-chart="stats-chart-modsplit"] .chart-data-table tbody tr');
  await expect(modSplitRows.nth(0).locator('td')).toHaveText(['Damage', '750', '75.0%', '250', '25.0%']);
  await expect(modSplitRows.nth(1).locator('td')).toHaveText(['Kills', '6', '75.0%', '2', '25.0%']);

  // Map activity and Combat by Character are now small-multiples figures
  // (chartFigure's `panels` option -- one single-series canvas per metric,
  // see charts.mjs and stats.mjs's STATUS_GREEN/RED/AMBER comment for why
  // a single three-series grouped bar was dropped: no green/red/amber
  // triple clears the dataviz-skill validator's CVD floor while also
  // staying distinct from the on-page faction colors).
  const mapFigure = page.locator('[data-chart="stats-chart-maps"]');
  await expect(mapFigure).toHaveCount(1);
  // Three single-series panels (Entries / Extractions / Deaths), each its
  // own canvas with its own accessible name -- not one three-series
  // grouped bar with one combined aria-label.
  await expect(mapFigure.locator('canvas')).toHaveCount(3);
  await expect(mapFigure.locator('[role="img"][aria-label="Entries by map"]')).toHaveCount(1);
  await expect(mapFigure.locator('[role="img"][aria-label="Extractions by map"]')).toHaveCount(1);
  await expect(mapFigure.locator('[role="img"][aria-label="Deaths by map"]')).toHaveCount(1);
  await expect(mapFigure.locator('.chart-data-table caption')).toHaveText('Map activity');
  const mapRow = mapFigure.locator('.chart-data-table tbody tr').first();
  await expect(mapRow.locator('td')).toHaveText(['Ashen Mesa', '10', '7', '4', '70%', '40%', 'L_AshenMesa_WP']);
  const tunnelRow = mapFigure.locator('.chart-data-table tbody tr').nth(1);
  await expect(tunnelRow.locator('td').first()).toHaveText('Tunnel B');
  await expect(tunnelRow.locator('td').last()).toHaveText('Dungeon_Tunnel2_01, Dungeon_Tunnel2_04');
  // Extraction rate / death rate are restored as visible information, not
  // just table cells behind the "Show data table" disclosure -- the old
  // browser test asserted these exact percentages before the chart
  // rewrite silently dropped them.
  await expect(page.locator('.stats-rate-list')).toContainText('extraction rate 70%');
  await expect(page.locator('.stats-rate-list')).toContainText('death rate 40%');

  const charactersFigure = page.locator('[data-chart="stats-chart-characters"]');
  await expect(charactersFigure.locator('canvas')).toHaveCount(3);
  const charRow = charactersFigure.locator('.chart-data-table tbody tr').first();
  await expect(charRow.locator('td')).toHaveText(['Gunhead', '8', '2', '6', '4.00']);

  const territoryFigure = page.locator('[data-chart="stats-chart-territory"]');
  await expect(territoryFigure.locator('.chart-data-table thead')).toContainText(probe);
  await expect(territoryFigure.locator('.chart-data-table tbody tr').first().locator('td')).toHaveText(['Ashen Mesa', '60%', '40%']);
  await expect(page.locator('.unknown-faction-marker')).not.toHaveCount(0);

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
