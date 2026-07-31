import { FW, expose } from '../runtime.mjs';

const { api, esc, appIcon, showLoading, setRenderedHtml, technicalDetails, CHARACTER_META, errorDetailHtml } = FW;

// Friendly names + blurbs sourced from https://theforeverwinter.wiki.gg/wiki/Maps.
// Keyed by a canonical short id that both naming conventions the save uses
// normalize to (see normalizeMapId): MapStatistics counters use "L_Name_WP"
// while TugOfWar territory scopes use the bare name directly.
const MAP_META = {
  AshenMesa: { name: 'Ashen Mesa', blurb: 'Once a thriving megacity, now lies buried under dunes of ash.' },
  FrozenSwamp: { name: 'Frozen Swamp', blurb: "Unforgiving wasteland born of industrial excess and war's relentless fury." },
  MechTrenches: { name: 'Mech Trenches', blurb: 'Sprawling network of Europan trenches under relentless Euruskan assault.' },
  UndergroundCemetery: { name: 'Underground Cemetery', blurb: 'Once sacred, this hallowed ground now lies defiled. Murky waters cloak a forgotten past.' },
  DowntownLostAngels: { name: 'Downtown Lost Angels', blurb: 'Perpetual war zone, where rubble meets ruin and hope is a distant memory.' },
  ElephantMausoleum: { name: 'Elephant Mausoleum', blurb: 'A maze of war-ravaged trenches scars this hostile wasteland, heavy with the stench of battle.' },
  StairwayGate: { name: 'Stairway Gate', blurb: "Gargantuan stairway flanked by crumbling skyscrapers, leads to the city's towering defensive wall." },
  ScorchedEnclave: { name: 'Scorched Enclave', blurb: 'Endless cracked earth bakes under a blistering sun. Ruined Europa bunkers dot the landscape.' },
  ScrapyardNexus: { name: 'Scrapyard Nexus', blurb: 'Treacherous expanse of Europan trenches, now overtaken by Euruska.' },
  Innards: { name: 'Innards', blurb: 'Home base -- has additional Training and Liberate the Innards layouts. "Thunder Dome" is one of these Innards layouts, not a separate location.' },
  Shanti: { name: 'Babel', blurb: 'Best fit for the wiki’s "twisted network of walkways and rickety bridges...above the ruins of Lost Angels" -- a shantytown, hence the internal codename.' },
  // "There are four tunnels in total, labeled A to D... four variants per
  // tunnel." The wiki's own A1-D4 -> game-id table (also on this page) maps
  // group 1->A, 2->B, 3->C, 4->D (e.g. "A1 = 1 1", "B1 = 2 4", "D4 = 4 3" --
  // first digit is always the tunnel group). Group 0 doesn't appear in that
  // table at all; the wiki gives no name for it, so it's labeled honestly as
  // unmapped rather than guessed into one of A-D.
  Tunnel1: { name: 'Tunnel A', blurb: "One of the four tunnel networks (A-D), each with 4 daily-rotating variants. Free fast travel, no water/credits/drone required." },
  Tunnel2: { name: 'Tunnel B', blurb: "One of the four tunnel networks (A-D), each with 4 daily-rotating variants. Free fast travel, no water/credits/drone required." },
  Tunnel3: { name: 'Tunnel C', blurb: "One of the four tunnel networks (A-D), each with 4 daily-rotating variants. Free fast travel, no water/credits/drone required." },
  Tunnel4: { name: 'Tunnel D', blurb: "One of the four tunnel networks (A-D), each with 4 daily-rotating variants. Free fast travel, no water/credits/drone required." },
  Tunnel0: { name: 'Tunnel (Group 0)', blurb: "Not covered by the wiki's A-D tunnel-variant table -- group number 0 has no wiki-confirmed letter, unlike groups 1-4 (which map to A-D)." },
  AI_Awareness_Map: { name: 'AI Awareness Map', blurb: 'Not documented on the wiki -- most likely an internal test/QA map.', internal: true },
  AI_Validation_Map: { name: 'AI Validation Map', blurb: 'Not documented on the wiki -- most likely an internal test/QA map.', internal: true }
};

// Normalizes both naming conventions the save uses down to MAP_META's keys.
// Tunnel sub-variants (Dungeon_Tunnel2_03, etc.) group by their tunnel number
// (-> TunnelN) rather than collapsing every group into one "Tunnels" bucket,
// so distinct networks (A/B/C/D) stay distinguishable in the UI.
function normalizeMapId(id) {
  const key = String(id).replace(/^L_/, '').replace(/_WP$/, '');
  const tunnel = /^Dungeon_Tunnel(\d+)/.exec(key);
  if (tunnel) return `Tunnel${tunnel[1]}`;
  if (key === 'HUB_V6' || key === 'HUB_Intro' || key === 'ThunderDome') return 'Innards';
  if (key === 'Shanti_Rooftops') return 'Shanti';
  return key;
}

// Prettify a map codename that has no MAP_META entry, rather than showing
// the raw id as the primary label.
function mapFallbackLabel(id) {
  const cleaned = String(id).replace(/^L_/, '').replace(/_WP$/, '').replace(/_/g, ' ').trim();
  return cleaned.replace(/\b\w/g, c => c.toUpperCase());
}

// Factions per https://theforeverwinter.wiki.gg/wiki/Factions. Colors are the
// dataviz skill's categorical palette in its validated order, checked against
// this app's dark surface (#15171C) with scripts/validate_palette.js: all 8
// slots pass (worst adjacent CVD delta 8.4 protan, in the 6-8 "warn" band the
// skill allows given secondary encoding -- every use here always pairs color
// with a text label, never color-alone). territoryBar() always renders
// factions in this fixed FACTION_ORDER (never sorted by value) so any subset
// of factions shown adjacent stays a validated-adjacent subsequence.
const FACTION_META = {
  Eurasia: { name: 'Eurasia', color: '#3987e5', blurb: 'Global government/corporate superpower controlling East & Central Asia; bio- and agro-tech, drone-heavy.' },
  Europa: { name: 'Europa', color: '#d95926', blurb: 'Military superpower spanning the Americas and Western Europe; totalitarian iconography, chronic famine.' },
  Euruska: { name: 'Euruska', color: '#199e70', blurb: 'Federation of former Slavic states and parts of Africa, allied with Eurasia; extreme biomechanical tech.' },
  Cultist: { name: 'the "R" Cult', color: '#c98500', blurb: 'Minor faction -- no vendors or reputation mechanics.' },
  Scavenger: { name: 'Scavengers', color: '#d55181', blurb: 'Civilians, mercenaries, and warlords surviving in the rubble and undercities.' },
  WaterThief: { name: 'Water Thieves', color: '#008300', blurb: 'Minor faction -- no vendors or reputation mechanics.' },
  ScavengerNPC: { name: 'Scavenger NPC', color: '#9085e9', blurb: "Scavenger-aligned NPC presence (e.g. the Innards' own defenders)." }
};
const FACTION_ORDER = ['Eurasia', 'Europa', 'Euruska', 'Cultist', 'Scavenger', 'WaterThief', 'ScavengerNPC'];
const FACTION_FALLBACK_COLORS = ['#e66767', '#59a7a7', '#b47bd7', '#d39b43', '#6f9fd8', '#c9799d'];

function stableFallbackColor(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return FACTION_FALLBACK_COLORS[(hash >>> 0) % FACTION_FALLBACK_COLORS.length];
}

function entityOrder(values) {
  const keys = [...new Set(values)];
  return [
    ...FACTION_ORDER.filter(key => keys.includes(key)),
    ...keys.filter(key => !FACTION_ORDER.includes(key)).sort((a, b) => a.localeCompare(b))
  ];
}

function factionMeta(faction) {
  return FACTION_META[faction] || { name: faction, color: stableFallbackColor(faction), blurb: '' };
}

function factionDot(color) {
  return `<span class="faction-dot" style="background:${esc(color)}"></span>`;
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function factionTag(faction) {
  const meta = factionMeta(faction);
  return `<span class="faction-tag">${factionDot(meta.color)}${esc(meta.name)}</span>`;
}

function factionLegend(factions) {
  return `<div class="faction-legend" aria-label="Faction color legend">${entityOrder(factions).map(factionTag).join('')}</div>`;
}

function characterLabel(shortName) {
  const meta = CHARACTER_META['Pawn.Player.' + shortName];
  return meta ? meta.name : shortName;
}

function fmt(n) {
  return n == null ? '—' : Math.round(n).toLocaleString();
}

function percent(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? Math.round((numerator / denominator) * 100) : null;
}

function ratio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? (numerator / denominator).toFixed(2) : null;
}

function metricBar(label, value, max, color = 'var(--amber)', displayValue = fmt(value)) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const width = max > 0 ? Math.max(0, Math.min(100, (safeValue / max) * 100)) : 0;
  return `<div class="metric-bar" role="img" aria-label="${esc(label)}: ${esc(displayValue)}"><span class="metric-bar-label">${esc(label)} <b>${esc(displayValue)}</b></span><span class="metric-bar-track"><span style="width:${width.toFixed(2)}%;background:${esc(color)}"></span></span></div>`;
}

function renderPlayerSummary(player) {
  const kd = ratio(player.kills, player.deaths);
  const runTotal = Number(player.extractions || 0) + Number(player.deaths || 0);
  const extractionRate = percent(player.extractions, runTotal);
  const cards = [
    ['Kills', player.kills, 'Lifetime confirmed kills'], ['Deaths', player.deaths, 'Lifetime deaths'],
    ['K/D', kd, kd == null ? 'Unavailable until at least one death is recorded' : 'Kills divided by deaths'],
    ['Extractions', player.extractions, 'Lifetime successful extractions'],
    ['Extraction rate', extractionRate == null ? null : `${extractionRate}%`, extractionRate == null ? 'Unavailable until an extraction or death is recorded' : 'Extractions divided by extractions plus deaths'],
    ['Downed', player.downed, 'Lifetime downs'], ['Attacks', player.attacks, 'Lifetime attacks'], ['Total XP', player.xp, 'Lifetime XP']
  ];
  return `<section class="stats-section"><h3>Lifetime Summary</h3><div class="stats-kpi-grid">${cards.map(([label, value, detail]) => `<article class="stats-kpi" aria-label="${esc(label)}: ${esc(value == null ? 'unavailable' : String(value))}"><span>${esc(label)}</span><strong>${esc(value == null ? '—' : typeof value === 'number' ? fmt(value) : value)}</strong><small>${esc(detail)}</small></article>`).join('')}</div></section>`;
}

function comparisonRows(entries, metric, label) {
  const max = Math.max(0, ...entries.map(([, values]) => Number(values[metric]) || 0));
  return `<div class="comparison-chart" aria-label="${esc(label)}">${entries.map(([faction, values]) => `<div class="comparison-row"><div class="comparison-name">${faction === 'All' ? 'All Factions' : factionTag(faction)}</div>${metricBar(label, values[metric], max, faction === 'All' ? 'var(--text-2)' : factionMeta(faction).color)}</div>`).join('')}</div>`;
}

function renderFactionDamage(damage) {
  const keys = ['All', ...entityOrder(Object.keys(damage).filter(key => key !== 'All'))].filter(key => damage[key]);
  if (!keys.length) return '';
  const entries = keys.map(key => [key, damage[key]]);
  const all = damage.All;
  const detail = all && all.moddedDamage != null ? `<p class="stats-note">All factions: modded ${esc(fmt(all.moddedDamage))} damage / ${esc(fmt(all.moddedKills))} kills; unmodded ${esc(fmt(all.unmoddedDamage))} damage / ${esc(fmt(all.unmoddedKills))} kills.</p>` : '';
  return `<section class="stats-section"><h3>Damage by Faction</h3><div class="comparison-pair"><div><h4>Damage</h4>${comparisonRows(entries, 'damage', 'Damage')}</div><div><h4>Kills</h4>${comparisonRows(entries, 'kills', 'Kills')}</div></div>${detail}</section>`;
}

function renderFactionCombat(factions) {
  const present = entityOrder(Object.keys(factions)).filter(f => factions[f] && (factions[f].attacks != null || factions[f].kills != null));
  if (!present.length) return '';
  const entries = present.map(key => [key, factions[key]]);
  return `<section class="stats-section"><h3>Combat by Faction</h3><p class="char-hint">Separate counters from the game's own combat log—not necessarily the same tally as the damage stats above.</p><div class="comparison-pair"><div><h4>Attacks</h4>${comparisonRows(entries, 'attacks', 'Attacks')}</div><div><h4>Kills</h4>${comparisonRows(entries, 'kills', 'Kills')}</div></div></section>`;
}

function renderCharacterCombat(characters) {
  const known = Object.keys(CHARACTER_META).map(tag => tag.replace('Pawn.Player.', ''));
  const order = [...known.filter(name => characters[name] !== undefined), ...Object.keys(characters).filter(name => !known.includes(name)).sort((a, b) => a.localeCompare(b))];
  if (!order.length) return '';
  const metrics = ['kills', 'extractions', 'deaths'];
  const maxima = Object.fromEntries(metrics.map(metric => [metric, Math.max(0, ...order.map(name => Number(characters[name][metric]) || 0))]));
  const cards = order.map(name => {
    const c = characters[name];
    const played = metrics.some(metric => c[metric] != null);
    return `<article class="character-combat-card"><h4>${esc(characterLabel(name))}</h4>${played ? metrics.map(metric => metricBar(metric[0].toUpperCase() + metric.slice(1), c[metric] ?? 0, maxima[metric])).join('') : '<p class="stats-note">Not yet deployed</p>'}</article>`;
  }).join('');
  return `<section class="stats-section"><h3>Combat by Character</h3><div class="character-combat-grid">${cards}</div></section>`;
}
// The save records each procedural Tunnel variant (Dungeon_Tunnel0, _1_04,
// etc.) as its own counter -- 13+ rows that would otherwise all render under
// the identical "Tunnels" label with no way to tell them apart. The wiki
// treats Tunnels as one location with variants, so they're summed into one
// row here; every underlying raw id is still listed in its disclosure.
function groupMapStats(maps) {
  const groups = new Map();
  for (const m of maps) {
    const key = normalizeMapId(m.map);
    const g = groups.get(key) || { key, ids: [], entry: 0, extract: 0, death: 0 };
    g.ids.push(m.map);
    g.entry += m.entry; g.extract += m.extract; g.death += m.death;
    groups.set(key, g);
  }
  return [...groups.values()];
}

function renderMapStats(maps) {
  if (!maps.length) return '';
  const cards = groupMapStats(maps).map(g => {
    const meta = MAP_META[g.key];
    const label = meta ? meta.name : mapFallbackLabel(g.key);
    const idList = g.ids.length > 1
      ? technicalDetails(`${g.ids.length} variants: ${g.ids.join(', ')}`, `Show ${g.ids.length} internal variant IDs`)
      : technicalDetails(g.ids[0], 'Show internal map ID');
    const extractRate = percent(g.extract, g.entry);
    const deathRate = percent(g.death, g.entry);
    return `<article class="map-stats-card"><header><h4>${esc(label)} ${idList}</h4>${meta && meta.internal ? '<span class="map-internal-tag">Internal / QA map</span>' : ''}</header><p class="map-entry-count"><b>${esc(fmt(g.entry))}</b> entries</p><div class="map-rate-grid">${extractRate == null ? '<span class="stats-note">Extraction rate unavailable</span>' : metricBar('Extraction rate', extractRate, 100, 'var(--green)', `${extractRate}%`)}${deathRate == null ? '<span class="stats-note">Death rate unavailable</span>' : metricBar('Death rate', deathRate, 100, 'var(--red)', `${deathRate}%`)}</div><p class="stats-note">${esc(fmt(g.extract))} extracts · ${esc(fmt(g.death))} deaths. Rates use entries independently; outcomes may overlap or be incomplete.</p></article>`;
  }).join('');
  return `<section class="stats-section"><h3>Map Statistics</h3><div class="map-stats-grid">${cards}</div></section>`;
}
// The stacked control bar: always iterates FACTION_ORDER (never sorted by
// value) so any subset of factions rendered adjacent is a subsequence of the
// validated-adjacent color order, and identity never gets repainted when the
// set of present factions differs per location (dataviz skill: "color
// follows the entity, never its rank").
function territoryBar(factionShares) {
  const order = entityOrder(Object.keys(factionShares));
  const segments = order
    .filter(f => factionShares[f] != null)
    .map(f => {
      const pct = factionShares[f];
      const meta = factionMeta(f);
      return `<span class="territory-seg" style="width:${(pct * 100).toFixed(2)}%;background:${meta.color}" title="${esc(meta.name)}: ${Math.round(pct * 100)}%"></span>`;
    }).join('');
  return `<div class="territory-bar" role="img" aria-label="Territory control: ${esc(order.filter(f => factionShares[f] != null).map(f => `${factionMeta(f).name} ${Math.round(factionShares[f] * 100)}%`).join(', '))}">${segments}</div>`;
}

// Some raw locations normalize to the same canonical place (e.g. ThunderDome
// -> Innards) -- average their per-faction shares rather than show duplicate
// cards with the same label. (In the one observed case the splits were
// already identical, so this averages to that same value; it's still the
// correct general behavior if a future save has them diverge slightly.)
function groupTerritory(territory) {
  const groups = new Map();
  for (const t of territory) {
    const key = normalizeMapId(t.location);
    const g = groups.get(key) || { key, ids: [], factionSums: {}, count: 0 };
    g.ids.push(t.location);
    g.count++;
    for (const [f, pct] of Object.entries(t.factions)) g.factionSums[f] = (g.factionSums[f] || 0) + pct;
    groups.set(key, g);
  }
  return [...groups.values()].map(g => ({
    key: g.key,
    ids: g.ids,
    factions: Object.fromEntries(Object.entries(g.factionSums).map(([f, sum]) => [f, sum / g.count]))
  }));
}

function territoryCard(g) {
  const meta = MAP_META[g.key];
  const label = meta ? meta.name : mapFallbackLabel(g.key);
  const idLabel = g.ids.length > 1
    ? technicalDetails(`${g.ids.length} sources: ${g.ids.join(', ')}`, `Show ${g.ids.length} internal location IDs`)
    : technicalDetails(g.ids[0], 'Show internal location ID');
  const ranked = Object.entries(g.factions).sort((a, b) => b[1] - a[1]);
  const [dominantFaction, dominantShare] = ranked[0] || [];
  const domMeta = dominantFaction ? factionMeta(dominantFaction) : null;
  const breakdown = entityOrder(Object.keys(g.factions)).map(f => {
    const pct = g.factions[f];
    const fMeta = factionMeta(f);
    return `<span class="territory-share">${factionDot(fMeta.color)}${esc(fMeta.name)} <b>${Math.round(pct * 100)}%</b></span>`;
  }).join('');
  const cardStyle = domMeta ? ` style="--dominant-color:${esc(domMeta.color)};--dominant-wash:${esc(hexToRgba(domMeta.color, 0.12))}"` : '';
  return `<article class="territory-card"${cardStyle}>
    <header class="territory-card-head">
      <span class="territory-card-icon">${appIcon('target')}</span>
      <h4>${esc(label)} ${idLabel}</h4>
    </header>
    ${meta && meta.blurb ? `<p class="territory-blurb">${esc(meta.blurb)}</p>` : ''}
    ${territoryBar(g.factions)}
    <div class="territory-breakdown">${breakdown}</div>
    ${domMeta ? `<p class="territory-predict">${factionDot(domMeta.color)}<b>${esc(domMeta.name)}</b> controls ${Math.round(dominantShare * 100)}% here -- expect the most, and best-equipped, ${esc(domMeta.name)} hostiles.</p>` : ''}
  </article>`;
}

function renderTerritory(territory) {
  if (!territory.length) return '';
  return `<div class="stats-section territory-section">
    <h3>Territory Control</h3>
    <p class="char-hint">Per-location faction control share (the game's own "Theater of War" system) -- higher control means both <b>more</b> hostiles and <b>better-equipped</b> ones for that faction. <a href="https://theforeverwinter.wiki.gg/wiki/Factions" target="_blank" rel="noopener noreferrer">theforeverwinter.wiki.gg/wiki/Factions</a></p>
    ${factionLegend(territory.flatMap(row => Object.keys(row.factions || {})))}
    <div class="territory-grid">${groupTerritory(territory).map(territoryCard).join('')}</div>
  </div>`;
}

async function loadStats() {
  const el = document.getElementById('statsContent');
  showLoading(el, 4, 'Loading stats');
  try {
    const stats = await api('/stats');
    const html = [
      renderTerritory(stats.territory || []),
      renderPlayerSummary(stats.player || {}),
      renderFactionDamage(stats.damage || {}),
      renderFactionCombat(stats.factions || {}),
      renderCharacterCombat(stats.characters || {}),
      renderMapStats(stats.maps || [])
    ].join('');
    setRenderedHtml(el, html || '<div class="empty-state"><strong>No stats found</strong></div>');
  } catch (error) {
    setRenderedHtml(el, `<div class="empty-state"><strong>Could not load stats</strong><br>${errorDetailHtml(error, 'Stats could not be read.')}</div>`);
  }
}

expose({ loadStats });
