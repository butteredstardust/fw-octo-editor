const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const canonical = require('../data/recipes.canonical.json');
const audit = require('../data/recipe-audit.json');
const hub = require('../data/hub-upgrades.json');
let recipePlannerTotals;

test.before(async () => {
  ({ recipePlannerTotals } = await import('../public/modules/recipe-planner.mjs'));
});

const frontendSource = () => {
  const root = require('node:path').join(__dirname, '..', 'public', 'modules');
  const read = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? read(require('node:path').join(directory, entry.name)) : entry.name.endsWith('.mjs') ? [fs.readFileSync(require('node:path').join(directory, entry.name), 'utf8')] : []);
  return read(root).join('\n');
};

test('canonical recipe snapshot covers all three implemented stations', () => {
  assert.equal(canonical.schemaVersion, 1);
  assert.equal(canonical.recipes.workshop.length, 37);
  assert.equal(canonical.recipes.munitions.length, 23);
  assert.equal(canonical.recipes.upgrades.length, 36);
  assert.deepEqual(audit.counts, {
    workshop: 37,
    munitions: 23,
    upgrades: 36,
    components: 332,
    unsupportedComponents: 11,
    unsupportedProducts: 1
  });
});

test('every upgrade has a unique exact save tag and an acyclic prerequisite', () => {
  const tags = canonical.recipes.upgrades.map(recipe => recipe.upgradeTag);
  assert.equal(new Set(tags).size, 36);
  assert.deepEqual(hub.upgrades.map(upgrade => upgrade.tag).sort(), [...tags].sort());
  const byTag = new Map(canonical.recipes.upgrades.map(recipe => [recipe.upgradeTag, recipe]));
  for (const recipe of canonical.recipes.upgrades) {
    if (recipe.prerequisiteTag) assert.ok(byTag.has(recipe.prerequisiteTag));
  }
});

test('known hand-transcription regressions resolve to reference-save identities', () => {
  const all = [...canonical.recipes.workshop, ...canonical.recipes.munitions];
  const product = name => all.find(recipe => recipe.product.name === name).product;
  assert.equal(product('.45 ACP Ammo').itemId, 'Item.Ammo.45ACP');
  assert.equal(product('40mm Grenade').itemId, 'Item.Ammo.40mmHE');
  assert.equal(product('Decoy Grenade').itemId, 'Item.Ammo.NoiseMakerGrenade');
  const whiskey = all.flatMap(recipe => recipe.components).find(component => component.name === 'Whiskey');
  assert.equal(whiskey.itemId, 'Alcohol01');
});

test('components already resolvable elsewhere in the app are writable from recipes', () => {
  const all = [...canonical.recipes.workshop, ...canonical.recipes.munitions, ...canonical.recipes.upgrades];
  const drone = all.flatMap(recipe => recipe.components).find(component => component.name === 'Construction Drone');
  assert.equal(drone.itemId, 'Drone_Construction');
  assert.equal(drone.writable, true);
});

test('crafted intermediates use output batch sizes rather than multiplying full recipes', () => {
  const recipes = canonical.recipes.munitions;
  const cluster = recipes.find(recipe => recipe.product.name === 'Cluster Grenade');
  const clusterTotals = recipePlannerTotals(recipes, {}, cluster.id, 1).components;
  assert.equal(clusterTotals.find(component => component.name === 'Explosives').total, 1);
  assert.equal(clusterTotals.find(component => component.name === 'Old Paint Can').total, 3);
  assert.equal(clusterTotals.find(component => component.name === 'Fuse').total, 3);

  const pst = recipes.find(recipe => recipe.product.name === '.50 PST Ammo');
  const oneBatch = recipePlannerTotals(recipes, {}, pst.id, 8).components;
  assert.equal(oneBatch.find(component => component.name === 'Rare Metals').total, 2);
  assert.equal(oneBatch.find(component => component.name === 'Gunpowder').total, 2);
  const fourBatches = recipePlannerTotals(recipes, {}, pst.id, 32).components;
  assert.equal(fourBatches.find(component => component.name === 'Rare Metals').total, 4);
  assert.equal(fourBatches.find(component => component.name === 'Gunpowder').total, 4);
});

test('unsupported requirements are explicit and filtered before mutation', () => {
  assert.ok(audit.unresolved.some(row => row.name === 'Explosives' && row.status === 'unsupported'));
  assert.ok(audit.unresolved.some(row => row.name === 'Military Hard Drive' && row.status === 'unsupported'));
  const app = frontendSource();
  assert.match(app, /components\.filter\(component => component\.writable && component\.itemId\)/);
  assert.match(app, /sourceMap: component\.sourceMap/);
  assert.doesNotMatch(app, /WORKSHOP_RECIPES\.products|MUNITIONS_RECIPES\.products/);
});

test('frontend loads generated recipe data through the native module graph', () => {
  const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
  assert.match(html, /<script type="module" src="app\.mjs\?v=/);
  const core = fs.readFileSync(require.resolve('../public/modules/core.mjs'), 'utf8');
  const planners = fs.readFileSync(require.resolve('../public/modules/features/settings-planners.mjs'), 'utf8');
  assert.match(core, /from '\.\/recipe-data\.mjs'/);
  assert.match(planners, /from '\.\.\/recipe-planner\.mjs'/);
  assert.doesNotMatch(html, /workshop-recipes\.js|munitions-recipes\.js/);
});


test('upgrades page renders only reviewed Hub upgrade tags', () => {
  const app = frontendSource();
  assert.match(app, /\.filter\(tag => HUB_UPGRADE_RECIPES\[tag\]\)/);
  assert.doesNotMatch(app, /DLC \/ Event Cosmetics|Other Save Flags/);
  assert.doesNotMatch(app, /renderHubUpgrades\(unlockedTags, gifts, otherFlags\)/);
});
