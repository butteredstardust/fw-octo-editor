import { FW, expose } from '../runtime.mjs';

const { api, esc, appIcon, showLoading, setRenderedHtml, technicalDetails, CHARACTER_META } = FW;

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
const FACTION_FALLBACK_COLOR = '#e66767';

function factionMeta(faction) {
  return FACTION_META[faction] || { name: faction, color: FACTION_FALLBACK_COLOR, blurb: '' };
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

function factionLegend() {
  return `<div class="faction-legend">${FACTION_ORDER.map(factionTag).join('')}</div>`;
}

function characterLabel(shortName) {
  const meta = CHARACTER_META['Pawn.Player.' + shortName];
  return meta ? meta.name : shortName;
}

function fmt(n) {
  return n == null ? '—' : Math.round(n).toLocaleString();
}

function statsRow(name, detail, chips) {
  return `<div class="stats-row"><div class="stats-row-main"><div class="stats-row-name">${name}</div>${detail ? `<div class="stats-row-detail">${detail}</div>` : ''}</div><div class="stats-chips">${chips}</div></div>`;
}

function renderPlayerSummary(player) {
  const rows = [
    ['Kills', player.kills], ['Deaths', player.deaths], ['Downed', player.downed],
    ['Extractions', player.extractions], ['Attacks', player.attacks], ['Total XP', player.xp]
  ];
  return `<div class="stats-section"><h3>Lifetime Summary</h3><div class="dash-stats">${
    rows.map(([k, v]) => `<div><span class="k">${esc(k)}</span><span class="v">${fmt(v)}</span></div>`).join('')
  }</div></div>`;
}

function renderFactionDamage(damage) {
  const order = ['All', ...FACTION_ORDER];
  const keys = order.filter(k => damage[k]);
  if (!keys.length) return '';
  const rows = keys.map(faction => {
    const d = damage[faction];
    const name = faction === 'All' ? 'All Factions' : factionTag(faction);
    const detail = faction === 'All' && d.moddedDamage != null
      ? `Modded ${fmt(d.moddedDamage)} dmg / ${fmt(d.moddedKills)} kills &middot; Unmodded ${fmt(d.unmoddedDamage)} dmg / ${fmt(d.unmoddedKills)} kills`
      : '';
    return statsRow(name, detail, `<span class="stat-chip">Damage<b>${fmt(d.damage)}</b></span><span class="stat-chip">Kills<b>${fmt(d.kills)}</b></span>`);
  }).join('');
  return `<div class="stats-section"><h3>Damage by Faction</h3>${rows}</div>`;
}

function renderFactionCombat(factions) {
  const present = FACTION_ORDER.filter(f => factions[f] && (factions[f].attacks != null || factions[f].kills != null));
  if (!present.length) return '';
  const html = present.map(f => statsRow(factionTag(f), '', `<span class="stat-chip">Attacks<b>${fmt(factions[f].attacks)}</b></span><span class="stat-chip">Kills<b>${fmt(factions[f].kills)}</b></span>`)).join('');
  return `<div class="stats-section"><h3>Combat by Faction</h3><p class="char-hint">Separate counters from the game's own combat log -- not necessarily the same tally as the damage stats above.</p>${html}</div>`;
}

function renderCharacterCombat(characters) {
  const known = Object.keys(CHARACTER_META).map(tag => tag.replace('Pawn.Player.', ''));
  const order = known.filter(name => characters[name] !== undefined);
  if (!order.length) return '';
  const rows = order.map(name => {
    const c = characters[name];
    const played = c.kills != null || c.extractions != null || c.deaths != null;
    const chips = played
      ? `<span class="stat-chip">Kills<b>${fmt(c.kills ?? 0)}</b></span><span class="stat-chip">Extractions<b>${fmt(c.extractions ?? 0)}</b></span><span class="stat-chip">Deaths<b>${fmt(c.deaths ?? 0)}</b></span>`
      : `<span class="stat-chip neutral">Not yet deployed</span>`;
    return statsRow(esc(characterLabel(name)), '', chips);
  }).join('');
  return `<div class="stats-section"><h3>Combat by Character</h3>${rows}</div>`;
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
  const rows = groupMapStats(maps).map(g => {
    const meta = MAP_META[g.key];
    const label = meta ? meta.name : mapFallbackLabel(g.key);
    const idList = g.ids.length > 1
      ? `${esc(label)} ${technicalDetails(`${g.ids.length} variants: ${g.ids.join(', ')}`, `Show ${g.ids.length} internal variant IDs`)}`
      : `${esc(label)} ${technicalDetails(g.ids[0], 'Show internal map ID')}`;
    const rate = g.entry > 0 ? Math.round((g.extract / g.entry) * 100) : null;
    const detail = meta && meta.internal ? '<span class="map-internal-tag">Internal / QA map</span>' : '';
    return statsRow(idList, detail, `<span class="stat-chip">Entries<b>${fmt(g.entry)}</b></span><span class="stat-chip">Extracts<b>${fmt(g.extract)}</b></span><span class="stat-chip">Deaths<b>${fmt(g.death)}</b></span>${rate != null ? `<span class="stat-chip">Extract rate<b>${rate}%</b></span>` : ''}`);
  }).join('');
  return `<div class="stats-section"><h3>Map Statistics</h3>${rows}</div>`;
}

// The stacked control bar: always iterates FACTION_ORDER (never sorted by
// value) so any subset of factions rendered adjacent is a subsequence of the
// validated-adjacent color order, and identity never gets repainted when the
// set of present factions differs per location (dataviz skill: "color
// follows the entity, never its rank").
function territoryBar(factionShares) {
  const segments = FACTION_ORDER
    .filter(f => factionShares[f] != null)
    .map(f => {
      const pct = factionShares[f];
      const meta = factionMeta(f);
      return `<span class="territory-seg" style="width:${(pct * 100).toFixed(2)}%;background:${meta.color}" title="${esc(meta.name)}: ${Math.round(pct * 100)}%"></span>`;
    }).join('');
  return `<div class="territory-bar" role="img" aria-label="Territory control: ${esc(FACTION_ORDER.filter(f => factionShares[f] != null).map(f => `${factionMeta(f).name} ${Math.round(factionShares[f] * 100)}%`).join(', '))}">${segments}</div>`;
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
  const breakdown = ranked.map(([f, pct]) => {
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
    ${factionLegend()}
    <div class="territory-grid">${groupTerritory(territory).map(territoryCard).join('')}</div>
  </div>`;
}

async function loadStats() {
  const el = document.getElementById('statsContent');
  showLoading(el, 4, 'Loading stats');
  try {
    const stats = await api('/stats');
    const html = [
      renderTerritory(stats.territory),
      renderPlayerSummary(stats.player),
      renderFactionDamage(stats.damage),
      renderFactionCombat(stats.factions),
      renderCharacterCombat(stats.characters),
      renderMapStats(stats.maps)
    ].join('');
    setRenderedHtml(el, html || '<div class="empty-state"><strong>No stats found</strong></div>');
  } catch (error) {
    setRenderedHtml(el, `<div class="empty-state"><strong>Error</strong><br>${esc(error.message)}</div>`);
  }
}

expose({ loadStats });
