'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const snapshotPath = path.join(root, 'data', 'wiki-quests.snapshot.json');
const overridesPath = path.join(root, 'data', 'quest-map-overrides.json');
const canonicalPath = path.join(root, 'data', 'quests.canonical.json');
const auditPath = path.join(root, 'data', 'quest-map-audit.json');

// Wikitext -> plain text: "[[Page|Label]]" -> "Label", "[[Page]]" -> "Page",
// leading "# " MediaWiki ordered-list markers stripped per line.
function stripWikitext(value) {
  return String(value || '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .trim();
}
function objectiveLines(text) {
  return String(text || '')
    .split('\n')
    .map(line => stripWikitext(line.replace(/^#+\s*/, '')))
    .filter(Boolean);
}
function splitList(value) {
  return String(value || '').split(',').map(part => stripWikitext(part.trim())).filter(Boolean);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const overridesRaw = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
const tagMap = Object.fromEntries(Object.entries(overridesRaw).filter(([key]) => !key.startsWith('_')));

const rewardsByPage = new Map();
for (const row of snapshot.rewards) {
  const page = row._pageName;
  if (!page) continue;
  const quantity = Number(row.Quantity);
  if (!rewardsByPage.has(page)) rewardsByPage.set(page, []);
  rewardsByPage.get(page).push({ item: row.Item || null, quantity: Number.isFinite(quantity) ? quantity : null });
}

const quests = {};
for (const row of snapshot.quests) {
  const page = row._pageName;
  if (!page) continue;
  quests[page] = {
    name: page,
    faction: stripWikitext(row.Faction) || null,
    location: stripWikitext(row.Location) || null,
    questline: row.Questline || null,
    questlineStep: row.QuestlineStep || null,
    taskType: row.TaskType || null,
    objectives: objectiveLines(row.Objectives),
    related: splitList(row.Related),
    replayable: row.Replayable === '1',
    rewards: rewardsByPage.get(page) || []
  };
}

// Every override must resolve to a real wiki quest page -- fail closed rather
// than silently pointing the app at a typo'd page name.
const brokenOverrides = Object.entries(tagMap).filter(([, page]) => !quests[page]);
if (brokenOverrides.length) {
  throw new Error(`quest-map-overrides.json references unknown wiki quest page(s): ${brokenOverrides.map(([tag, page]) => `${tag} -> ${page}`).join(', ')}`);
}

const mappedTags = Object.keys(tagMap).length;
const referencedPages = new Set(Object.values(tagMap));

const generatedAt = new Date().toISOString();
const canonical = {
  schemaVersion: 1,
  generatedAt,
  source: { url: snapshot.sourceUrl, fetchedAt: snapshot.fetchedAt, attribution: snapshot.attribution },
  quests,
  tagMap
};
const audit = {
  schemaVersion: 1,
  generatedAt,
  counts: {
    wikiQuestsTotal: Object.keys(quests).length,
    mappedTags,
    distinctWikiQuestsReferenced: referencedPages.size
  },
  note: 'Save-file quest tags not present in tagMap render with a prettified fallback of the raw tag instead of wiki-sourced data (see saveService.js questFriendlyData()).'
};

fs.writeFileSync(canonicalPath, `${JSON.stringify(canonical, null, 2)}\n`);
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit.counts, null, 2));
