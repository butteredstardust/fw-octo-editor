'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'data', 'items.csv');
const overridesPath = path.join(root, 'data', 'item-overrides.json');
const wikiSnapshotPath = path.join(root, 'data', 'wiki-items.snapshot.json');
const referenceSnapshotPath = path.join(root, 'data', 'reference-items.snapshot.json');
const gameSnapshotPath = path.join(root, 'data', 'game-items.snapshot.json');
const canonicalPath = path.join(root, 'data', 'items.canonical.json');
const catalogPath = path.join(root, 'public', 'catalog.json');
const auditPath = path.join(root, 'data', 'item-map-audit.json');
function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) { if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (char === '"') quoted = false; else field += char; }
    else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter(values => values.some(Boolean)).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}
const splitCategories = value => value.split(',').map(part => part.trim()).filter(Boolean);
function inferredCategories(id) {
  const partSlots = { BRL: 'Barrel', CHG: 'Charging handle', FGR: 'Foregrip', GAS: 'Gas Tube', HGD: 'Handguard', MAG: 'Magazine', PGR: 'Grip', RLS: 'Rear sight', STK: 'Stock', TRG: 'Trigger', UPP: 'Upper assembly' };
  if (/^WPN_/.test(id)) { const slot = Object.entries(partSlots).find(([code]) => id.includes(`_${code}_`)); return ['Weapon parts', slot ? slot[1] : 'Weapon component']; }
  if (/^PICOPT/.test(id)) return ['Weapon attachments', 'Optic'];
  if (/^PICSCP/.test(id)) return ['Weapon attachments', 'Scope'];
  if (/^PICFGR/.test(id)) return ['Weapon attachments', 'Foregrip'];
  if (/^(PICLAM|PICFLL)/.test(id)) return ['Weapon attachments', 'Picatinny attachment'];
  if (/^ATTMD/.test(id)) return ['Weapon attachments', 'Muzzle Device'];
  if (/^(BP_|.*Dangly|.*_Dangly)/i.test(id)) return ['Rig components'];
  if (/^(Item\.Ammo\.|mmHE$|FactionGrenade$|ClusterGrenade$)/.test(id)) return ['Ammo'];
  if (/^Codex/i.test(id)) return ['Uncategorized items'];
  return [];
}
function tagToId(tag) {
  return String(tag || '').trim().replace(/^Inventory\.(?:Item|Weapon|Dangly)\./, '');
}
function inferMap(id, top, categories) {
  if (top === 'Damaged Weapons' || id.endsWith('_Broken')) return 'DamagedWeapons';
  if (top === 'Weapons' && categories.some(value => /^(weapons|pistols|rifles|shotguns|submachine|light machine|heavy)/i.test(value))) return 'Weapons';
  return 'Items';
}
// inventoryMap picks the GVAS map (Items_0 / Weapons_0 / Danglies_0); dataTablePath
// picks the RowHandle's DataTable. They are NOT interchangeable: DanglyDetailsData and
// DanglyDetailsData_DroppedWeapons both live in Danglies_0, so 'DamagedWeapons' alone
// cannot say which table a row belongs to. Fallback only — the game snapshot is truth.
const DATA_TABLE_BY_MAP = {
  Items: '/Game/Blueprints/Data/ItemDetailsData.ItemDetailsData',
  Weapons: '/Game/Blueprints/Data/WeaponsDetailsData.WeaponsDetailsData',
  DamagedWeapons: '/Game/Blueprints/Data/DanglyDetailsData_DroppedWeapons.DanglyDetailsData_DroppedWeapons'
};
function merge(target, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = merge({ ...(target[key] || {}) }, value);
    else target[key] = value;
  }
  return target;
}
const rows = parseCsv(fs.readFileSync(sourcePath, 'utf8'));
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
const wikiSnapshot = fs.existsSync(wikiSnapshotPath) ? JSON.parse(fs.readFileSync(wikiSnapshotPath, 'utf8')) : { items: [] };
const referenceSnapshot = fs.existsSync(referenceSnapshotPath) ? JSON.parse(fs.readFileSync(referenceSnapshotPath, 'utf8')) : null;
const referenceById = new Map((referenceSnapshot?.items || []).map(item => [item.name, item]));
const gameSnapshot = fs.existsSync(gameSnapshotPath) ? JSON.parse(fs.readFileSync(gameSnapshotPath, 'utf8')) : null;
const gameById = new Map((gameSnapshot?.items || []).map(item => [item.id, item]));
// Rows the game defines but never finished: no authored name/description, dev or test
// naming, bulk internal id patterns. Kept in the snapshot for auditing, kept OUT of the catalog.
const gameAdmissible = item => !item.problems?.length && Boolean(item.inventoryMap);
// IDs the wiki documents but the reference save never contained; admitted into the catalog anyway. See data/item-overrides.json.
const allowlist = new Set(Object.keys(overrides.additionalItems || {}).filter(id => !id.startsWith('_')));
const wikiById = new Map();
const wikiByIdLower = new Map();
for (const item of wikiSnapshot.items || []) {
  const tags = String(item.internalTag || '').split(/<br\s*\/?>|\n/).map(tagToId).filter(Boolean);
  for (const id of tags) {
    if (!wikiById.has(id)) wikiById.set(id, item);
    if (!wikiByIdLower.has(id.toLowerCase())) wikiByIdLower.set(id.toLowerCase(), item);
  }
}
const canonical = {}; const excluded = [];
for (const row of rows) {
  const id = (row.CsvItemName || row.DbItemName || '').trim();
  if (!id || id.includes('<br>')) { excluded.push({ id: id || null, displayName: row.WikiPage || null, source: row.Source || null, reason: id.includes('<br>') ? 'composite-wiki-cell' : 'no-save-id' }); continue; }
  const wikiItem = wikiById.get(id) || wikiByIdLower.get(id.toLowerCase()) || null;
  const categories = splitCategories(row.Category || '');
  if (!categories.length) categories.push(...(wikiItem?.categories || inferredCategories(id)));
  const displayName = wikiItem?.name || row.WikiPage || id;
  const matched = Boolean(wikiItem) || (row.Source === 'Matched' && Boolean(row.WikiPage));
  const wikiPage = wikiItem?.page || row.WikiPage || null;
  const imageFile = wikiItem?.imageFile || null;
  canonical[id] = {
    id, displayName, inventoryMap: inferMap(id, row.TopLevelCategory, categories), internalTag: row.InternalTag || null,
    taxonomy: { group: row.TopLevelCategory || 'Loot', type: categories[0] || null, subtype: categories[1] || null, tags: categories },
    wiki: { page: wikiPage, pageUrl: wikiPage ? `https://theforeverwinter.wiki.gg/wiki/${encodeURIComponent(wikiPage.replace(/ /g, '_'))}` : null, imageFile, imageUrl: imageFile ? `https://theforeverwinter.wiki.gg/wiki/Special:Redirect/file/${encodeURIComponent(imageFile)}` : null, revisionId: null, description: wikiItem?.description || null, buffs: wikiItem?.buffs || null, debuffs: wikiItem?.debuffs || null },
    match: { method: wikiItem ? 'wiki-cargo-internal-tag' : (matched ? 'legacy-exact-tag' : 'unmatched-reference-id'), confidence: wikiItem ? 1 : (matched ? 0.9 : 0), reviewed: false },
    sources: ['reference-save-2026-07-05', wikiItem ? 'wiki.gg-cargo-items' : (matched ? 'wiki.gg-legacy-export' : 'reference-save-only')]
  };
}
if (referenceSnapshot) {
  for (const id of Object.keys(canonical)) if (!referenceById.has(id) && !allowlist.has(id)) delete canonical[id];
  for (const id of allowlist) {
    if (!canonical[id]) throw new Error(`additionalItems refers to an ID absent from data/items.csv: ${id}`);
    if (referenceById.has(id)) continue;
    canonical[id].sources = canonical[id].sources.map(source => (source === 'reference-save-2026-07-05' ? 'wiki-only-allowlist' : source));
  }
  for (const [id, referenceItem] of referenceById) {
    if (canonical[id]) { canonical[id].inventoryMap = referenceItem.sourceMap === 'Base Weapons' ? 'Weapons' : (referenceItem.sourceMap === 'Damaged Weapons' ? 'DamagedWeapons' : 'Items'); continue; }
    const wikiItem = wikiById.get(id) || wikiByIdLower.get(id.toLowerCase()) || null;
    const categories = wikiItem?.categories?.length ? wikiItem.categories : inferredCategories(id);
    canonical[id] = {
      id, displayName: wikiItem?.name || id,
      inventoryMap: referenceItem.sourceMap === 'Base Weapons' ? 'Weapons' : (referenceItem.sourceMap === 'Damaged Weapons' ? 'DamagedWeapons' : 'Items'),
      internalTag: wikiItem?.internalTag || null,
      taxonomy: { group: referenceItem.sourceMap === 'Base Weapons' ? 'Weapons' : (referenceItem.sourceMap === 'Damaged Weapons' ? 'Damaged Weapons' : 'Loot'), type: categories[0] || null, subtype: categories[1] || null, tags: categories },
      wiki: { page: wikiItem?.page || null, pageUrl: wikiItem?.page ? `https://theforeverwinter.wiki.gg/wiki/${encodeURIComponent(wikiItem.page.replace(/ /g, '_'))}` : null, imageFile: wikiItem?.imageFile || null, imageUrl: wikiItem?.imageFile ? `https://theforeverwinter.wiki.gg/wiki/Special:Redirect/file/${encodeURIComponent(wikiItem.imageFile)}` : null, revisionId: null, description: wikiItem?.description || null, buffs: wikiItem?.buffs || null, debuffs: wikiItem?.debuffs || null },
      match: { method: wikiItem ? 'wiki-cargo-internal-tag' : 'unmatched-reference-id', confidence: wikiItem ? 1 : 0, reviewed: false },
      sources: ['reference-save-2026-07-05', wikiItem ? 'wiki.gg-cargo-items' : 'reference-save-only']
    };
  }
}
// Admit items the shipped game DataTables define but the reference save never held. Runs
// AFTER the reference-save intersection above so these survive the prune.
const gameAdded = [];
for (const [id, gameItem] of gameById) {
  if (canonical[id] || !gameAdmissible(gameItem)) continue;
  const wikiItem = wikiById.get(id) || wikiByIdLower.get(id.toLowerCase()) || null;
  const categories = wikiItem?.categories?.length ? wikiItem.categories : inferredCategories(id);
  const group = gameItem.inventoryMap === 'Weapons' ? 'Weapons' : (gameItem.inventoryMap === 'DamagedWeapons' ? 'Damaged Weapons' : 'Loot');
  canonical[id] = {
    id, displayName: wikiItem?.name || gameItem.displayName || id, inventoryMap: gameItem.inventoryMap,
    internalTag: wikiItem?.internalTag || null,
    taxonomy: { group, type: categories[0] || gameItem.category || null, subtype: categories[1] || null, tags: categories },
    wiki: { page: wikiItem?.page || null, pageUrl: wikiItem?.page ? `https://theforeverwinter.wiki.gg/wiki/${encodeURIComponent(wikiItem.page.replace(/ /g, '_'))}` : null, imageFile: wikiItem?.imageFile || null, imageUrl: wikiItem?.imageFile ? `https://theforeverwinter.wiki.gg/wiki/Special:Redirect/file/${encodeURIComponent(wikiItem.imageFile)}` : null, revisionId: null, description: wikiItem?.description || gameItem.description || null, buffs: wikiItem?.buffs || null, debuffs: wikiItem?.debuffs || null },
    match: { method: wikiItem ? 'wiki-cargo-internal-tag' : 'game-datatable-row', confidence: wikiItem ? 1 : 0.8, reviewed: false },
    sources: [`game-datatables-${gameSnapshot.gameBuild}`, ...(wikiItem ? ['wiki.gg-cargo-items'] : [])]
  };
  gameAdded.push(id);
}
// Every item carries the DataTable its RowHandle must reference. The game snapshot wins;
// otherwise fall back to the historical one-table-per-map assumption.
for (const [id, item] of Object.entries(canonical)) item.dataTablePath = gameById.get(id)?.dataTablePath || DATA_TABLE_BY_MAP[item.inventoryMap] || null;
for (const [id, patch] of Object.entries(overrides.items || {})) { if (!canonical[id]) throw new Error(`Override refers to unknown reference-save ID: ${id}`); canonical[id] = merge(canonical[id], patch); }
const sorted = Object.fromEntries(Object.entries(canonical).sort(([a], [b]) => a.localeCompare(b)));
const catalog = Object.fromEntries(Object.entries(sorted).map(([id, item]) => [id, {
  wiki: item.displayName, category: item.taxonomy.tags.join(','), top: item.taxonomy.group, inventoryMap: item.inventoryMap, dataTablePath: item.dataTablePath,
  taxonomyGroup: item.taxonomy.group, taxonomyType: item.taxonomy.type, taxonomySubtype: item.taxonomy.subtype, taxonomyTags: item.taxonomy.tags,
  internalTag: item.internalTag, imageFile: item.wiki.imageFile, imageUrl: item.wiki.imageUrl, wikiPage: item.wiki.page,
  wikiUrl: item.wiki.pageUrl, matchConfidence: item.match.confidence, reviewed: item.match.reviewed,
  description: item.wiki.description, buffs: item.wiki.buffs, debuffs: item.wiki.debuffs
}]));
const entries = Object.values(sorted);
const audit = { schemaVersion: 1, generatedAt: new Date().toISOString(), source: 'data/items.csv', counts: {
  canonical: entries.length, exactFriendlyNames: entries.filter(item => item.match.confidence >= 0.9).length,
  inferredNames: entries.filter(item => item.match.confidence > 0 && item.match.confidence < 0.9).length,
  unresolvedNames: entries.filter(item => item.match.confidence === 0).length, uncategorized: entries.filter(item => !item.taxonomy.type).length,
  withImages: entries.filter(item => item.wiki.imageFile || item.wiki.imageUrl).length, reviewed: entries.filter(item => item.match.reviewed).length,
  withDescription: entries.filter(item => item.wiki.description).length, withBuffOrDebuff: entries.filter(item => item.wiki.buffs || item.wiki.debuffs).length,
  excludedWikiRows: excluded.length, wikiSnapshotItems: (wikiSnapshot.items || []).length, referenceSnapshotItems: (referenceSnapshot?.items || []).length,
  allowlistedWithoutReference: entries.filter(item => item.sources.includes('wiki-only-allowlist')).length,
  gameSnapshotItems: (gameSnapshot?.items || []).length, gameSnapshotAdmissible: (gameSnapshot?.items || []).filter(gameAdmissible).length,
  addedFromGameDataTables: gameAdded.length, withDataTablePath: entries.filter(item => item.dataTablePath).length,
  nonDefaultDataTablePath: entries.filter(item => item.dataTablePath && item.dataTablePath !== DATA_TABLE_BY_MAP[item.inventoryMap]).length },
  addedFromGameDataTableIds: gameAdded.sort(),
  nonDefaultDataTablePathIds: entries.filter(item => item.dataTablePath && item.dataTablePath !== DATA_TABLE_BY_MAP[item.inventoryMap]).map(item => item.id),
  allowlistedWithoutReferenceIds: entries.filter(item => item.sources.includes('wiki-only-allowlist')).map(item => item.id), unresolvedIds: entries.filter(item => item.match.confidence === 0).map(item => item.id), uncategorizedIds: entries.filter(item => !item.taxonomy.type).map(item => item.id), excludedWikiRows: excluded };
fs.writeFileSync(canonicalPath, `${JSON.stringify({ schemaVersion: 1, generatedAt: audit.generatedAt, items: sorted }, null, 2)}\n`);
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog)}\n`);
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit.counts, null, 2));
