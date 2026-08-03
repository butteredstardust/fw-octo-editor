import { FW, expose } from '../runtime.mjs';
import { createChart, destroyCharts, chartFigure, chartTheme, SERIES_COLORS } from '../charts.mjs';
import { lifetimeSummaryHtml } from './lifetime-summary.mjs';

const { api, esc, appIcon, showLoading, setRenderedHtml, technicalDetails, CHARACTER_META, loadErrorHtml, emptyStateHtml } = FW;

// Semantic status colors for the per-character and per-map charts (kills /
// deaths / extractions / entries) -- deliberately NOT charts.mjs's
// SERIES_COLORS. SERIES_COLORS' first three hues are numerically identical
// to three FACTION_META colors below (Eurasia/Europa/Euruska), and this
// page shows faction identity (territory legend, territory chart) on the
// same screen as the per-character/per-map charts, so reusing SERIES_COLORS
// there would silently repaint faction identity onto an unrelated series.
// These come from foundation.css's status tokens instead, matched to what
// each count means: an extraction is good, a death is bad, a kill/entry is
// neutral effort.
//
// These were originally used as a THREE-SERIES categorical triple in one
// grouped bar per chart (kills/deaths/extractions side by side) -- that
// failed validate_palette.js hard, and not recoverably:
//   node validate_palette.js "#5FD38A,#FF8A7A,#D96B27" --mode dark --surface "#15171C" --pairs all
//   -> FAIL lightness band (green 0.781, red 0.758, both outside 0.48-0.67)
//   -> FAIL CVD separation: red<->green worst-pair ΔE 2.7 deutan (floor is
//      6, target 8 -- 2.7 is not a WARN, it's a hard collapse)
//   -> FAIL normal-vision floor: amber<->red ΔE 12.2 (hard gate is 15;
//      this floor is NOT excused by secondary encoding per the skill)
// Darker/more-saturated re-steps were tried next, searched programmatically
// (brute-forced over the OKLCH lightness/chroma/hue space the dark L-band
// 0.48-0.67 allows, at 0.015 L / 0.015 C / 3-4 deg H resolution) rather than
// hand-picked -- see scripts search_palette.mjs / diag*.mjs used during
// development. Result: **no green/red/amber triple exists** that (a) sits
// in the dark lightness band, (b) clears CVD ΔE >= 6 pairwise, (c) clears
// the ΔE >= 15 normal-vision floor pairwise, AND (d) stays >= 15 ΔE from
// all seven FACTION_META hues below (required since faction identity is on
// this same page). The blocking constraint is (d) on the green slot
// specifically: FACTION_META already places TWO greens in this exact
// lightness band (Euruska #199e70, Water Thieves #008300), and scanning
// every hue from 100-190 deg (yellow-green through teal) at every L/C the
// band allows found ZERO candidates >= 15 ΔE from both simultaneously --
// the two existing faction greens' 15-ΔE exclusion zones cover the entire
// usable green region of the band. (Dropping constraint (d) alone does
// make a passing triple possible, e.g. green #05ab86 / red #d0003a / amber
// #c98000 clears CVD 12.2 and normal-vision 20.7 -- but #c98000 sits 1.2 ΔE
// from the Cultist faction color #c98500, i.e. is that color, which is
// exactly the collision (d) exists to prevent.)
//
// So per the dataviz skill's documented fallback: these two charts are
// SMALL MULTIPLES (chartFigure's `panels` option) -- three single-series
// panels (Kills / Deaths / Extractions, or Entries / Extractions / Deaths)
// instead of one three-series grouped bar. A lone series needs no legend
// and carries no categorical CVD-separation requirement at all, so the
// semantic reading (extraction=good/green, death=bad/red, kill or
// entry=neutral/amber) is free and correct by construction; these three
// hex values are unchanged from the original set. Cross-metric comparison
// (which used to come from reading three adjacent bars) now lives in the
// one data table shared by all three panels.
const STATUS_GREEN = '#5FD38A';
const STATUS_RED = '#FF8A7A';
const STATUS_AMBER = '#D96B27';

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
// this app's dark surface (#15171C) with the dataviz skill's
// scripts/validate_palette.js (run ad hoc from the skill's own directory --
// it is not a script that lives in this repo): all 8 slots pass (worst
// adjacent CVD delta 8.4 protan, in the 6-8 "warn" band the skill allows
// given secondary encoding -- every use here always pairs color with a text
// label, never color-alone). Charts and cards always render factions in this
// fixed FACTION_ORDER (never sorted by value) so any subset of factions shown
// adjacent stays a validated-adjacent subsequence.
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

function sectionHeading(icon, eyebrow, title, description = '') {
  return `<header class="stats-section__head">
    <span class="stats-section__icon">${appIcon(icon)}</span>
    <div><span class="eyebrow">${esc(eyebrow)}</span><h3>${esc(title)}</h3>${description ? `<p>${esc(description)}</p>` : ''}</div>
  </header>`;
}

function renderPlayerSummary(player) {
  return `<section class="stats-section stats-section--summary">${sectionHeading('shield', 'Your record', 'Lifetime summary', 'A friendly snapshot of every run, across all characters.')}${lifetimeSummaryHtml(player)}</section>`;
}

function comparisonRows(entries, metric, label) {
  const max = Math.max(0, ...entries.map(([, values]) => Number(values[metric]) || 0));
  return `<div class="comparison-chart" aria-label="${esc(label)}">${entries.map(([faction, values]) => `<div class="comparison-row"><div class="comparison-name">${faction === 'All' ? 'All Factions' : factionTag(faction)}</div>${metricBar(label, values[metric], max, faction === 'All' ? 'var(--text-2)' : factionMeta(faction).color)}</div>`).join('')}</div>`;
}

// Faction combat profile: each faction's SHARE OF TOTAL (%), not raw
// damage/kills. A horizontal grouped bar stays meaningful even when only one
// or two factions are present, unlike a radar with fewer than three axes.
// The denominator includes every faction actually present (not the save's
// own "All" counter), including unfamiliar keys from newer game versions.
function factionShareData(damage) {
  const keys = entityOrder(Object.keys(damage).filter(f => f !== 'All' && damage[f]));
  const totalDamage = keys.reduce((sum, f) => sum + (Number(damage[f].damage) || 0), 0);
  const totalKills = keys.reduce((sum, f) => sum + (Number(damage[f].kills) || 0), 0);
  const damageShares = keys.map(f => totalDamage > 0 ? (Number(damage[f].damage) || 0) / totalDamage * 100 : 0);
  const killShares = keys.map(f => totalKills > 0 ? (Number(damage[f].kills) || 0) / totalKills * 100 : 0);
  return { keys, totalDamage, totalKills, damageShares, killShares };
}

function renderFactionProfile(damage) {
  const { keys, totalDamage, totalKills, damageShares, killShares } = factionShareData(damage);
  if (!keys.length || (totalDamage <= 0 && totalKills <= 0)) return '';
  const rows = keys.map((f, i) => [factionMeta(f).name, fmt(damage[f].damage), `${damageShares[i].toFixed(1)}%`, fmt(damage[f].kills), `${killShares[i].toFixed(1)}%`]);
  return `<section class="stats-section stats-section--chart stats-section--combat">${sectionHeading('target', 'Combat intelligence', 'Faction combat profile', 'Where your damage and kills have landed.')}${chartFigure({
    id: 'stats-chart-faction-profile',
    ariaLabel: 'Faction combat profile: share of total damage and share of total kills, by faction',
    title: 'Faction combat profile (% of total)',
    columns: ['Faction', 'Damage', 'Damage %', 'Kills', 'Kills %'],
    rows,
    height: Math.max(220, keys.length * 52)
  })}</section>`;
}

function initFactionProfile(container, damage) {
  const canvas = container.querySelector('#stats-chart-faction-profile');
  const { keys, totalDamage, totalKills, damageShares, killShares } = factionShareData(damage);
  if (!canvas || !keys.length || (totalDamage <= 0 && totalKills <= 0)) return;
  createChart(canvas, {
    type: 'bar',
    data: {
      labels: keys.map(f => factionMeta(f).name),
      datasets: [
        {
          label: 'Damage % of total',
          data: damageShares,
          backgroundColor: SERIES_COLORS[0]
        },
        {
          label: 'Kills % of total',
          data: killShares,
          backgroundColor: SERIES_COLORS[1]
        }
      ]
    },
    options: {
      indexAxis: 'y',
      scales: { x: { min: 0, max: 100, ticks: { callback: v => `${v}%` } } },
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(1)}%` } } }
    }
  });
}

// Modded vs. unmodded weapons: two 100%-stacked horizontal bars (Damage,
// Kills) on one shared 0-100% axis -- never a dual-axis chart mixing raw
// damage and raw kills, which are different units on different scales.
function renderModSplit(damage) {
  const all = damage.All;
  const dmgModded = Number(all && all.moddedDamage) || 0, dmgUnmodded = Number(all && all.unmoddedDamage) || 0;
  const killsModded = Number(all && all.moddedKills) || 0, killsUnmodded = Number(all && all.unmoddedKills) || 0;
  const dmgTotal = dmgModded + dmgUnmodded, killsTotal = killsModded + killsUnmodded;
  if (!all || (dmgTotal <= 0 && killsTotal <= 0)) return '';
  const pct = (n, total) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '—';
  const rows = [
    ['Damage', fmt(dmgModded), pct(dmgModded, dmgTotal), fmt(dmgUnmodded), pct(dmgUnmodded, dmgTotal)],
    ['Kills', fmt(killsModded), pct(killsModded, killsTotal), fmt(killsUnmodded), pct(killsUnmodded, killsTotal)]
  ];
  return `<section class="stats-section stats-section--chart stats-section--loadout">${sectionHeading('weapon', 'Loadout insight', 'Modded vs. unmodded weapons', 'The share of damage and kills earned with each weapon setup.')}${chartFigure({
    id: 'stats-chart-modsplit',
    ariaLabel: 'Modded versus unmodded weapons: percent of total damage and percent of total kills',
    title: 'Modded vs. unmodded (% of total)',
    columns: ['Metric', 'Modded', 'Modded %', 'Unmodded', 'Unmodded %'],
    rows,
    height: 170
  })}</section>`;
}

function initModSplit(container, damage) {
  const canvas = container.querySelector('#stats-chart-modsplit');
  const all = damage.All;
  const dmgModded = Number(all && all.moddedDamage) || 0, dmgUnmodded = Number(all && all.unmoddedDamage) || 0;
  const killsModded = Number(all && all.moddedKills) || 0, killsUnmodded = Number(all && all.unmoddedKills) || 0;
  const dmgTotal = dmgModded + dmgUnmodded, killsTotal = killsModded + killsUnmodded;
  if (!canvas || !all || (dmgTotal <= 0 && killsTotal <= 0)) return;
  const pct = (n, total) => total > 0 ? (n / total) * 100 : 0;
  createChart(canvas, {
    type: 'bar',
    data: {
      labels: ['Damage', 'Kills'],
      datasets: [
        { label: 'Modded', data: [pct(dmgModded, dmgTotal), pct(killsModded, killsTotal)], backgroundColor: SERIES_COLORS[0], rawValues: [dmgModded, killsModded] },
        { label: 'Unmodded', data: [pct(dmgUnmodded, dmgTotal), pct(killsUnmodded, killsTotal)], backgroundColor: SERIES_COLORS[1], rawValues: [dmgUnmodded, killsUnmodded] }
      ]
    },
    options: {
      indexAxis: 'y',
      scales: { x: { min: 0, max: 100, stacked: true, ticks: { callback: v => `${v}%` } }, y: { stacked: true } },
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(1)}% (${fmt(ctx.dataset.rawValues[ctx.dataIndex])})` } } }
    }
  });
}

function renderFactionCombat(factions) {
  const present = entityOrder(Object.keys(factions)).filter(f => factions[f] && (factions[f].attacks != null || factions[f].kills != null));
  if (!present.length) return '';
  const entries = present.map(key => [key, factions[key]]);
  return `<section class="stats-section stats-section--combat">${sectionHeading('shield', 'Combat log', 'Combat by faction', 'Game combat-log counters; these can differ from damage totals.')}<div class="comparison-pair"><div><h4>Attacks</h4>${comparisonRows(entries, 'attacks', 'Attacks')}</div><div><h4>Kills</h4>${comparisonRows(entries, 'kills', 'Kills')}</div></div></section>`;
}

function characterOrder(characters) {
  const known = Object.keys(CHARACTER_META).map(tag => tag.replace('Pawn.Player.', ''));
  return [...known.filter(name => characters[name] !== undefined), ...Object.keys(characters).filter(name => !known.includes(name)).sort((a, b) => a.localeCompare(b))];
}

// Per-character combat: three single-series horizontal-bar panels (kills /
// deaths / extractions), not one three-series grouped bar -- see the
// STATUS_GREEN/RED/AMBER comment above for why. Each panel shares the axis
// labels (character names) and the paired data table below.
function characterHasActivity(characters, order) {
  return order.some(name => {
    const c = characters[name] || {};
    return (Number(c.kills) || 0) > 0 || (Number(c.deaths) || 0) > 0 || (Number(c.extractions) || 0) > 0;
  });
}

// Per-character K/D: the old card-based layout never showed this (each
// character card was just kills/deaths/extractions bars, no ratio) so there
// is nothing to restore here beyond the player-level K/D that
// renderPlayerSummary already carries -- but the table gets a K/D column
// anyway since it costs nothing once kills/deaths are already columns and a
// reader comparing characters side by side benefits from it same as the
// lifetime summary above.
function renderCharacterCombat(characters) {
  const order = characterOrder(characters);
  if (!order.length) return '';
  // An all-zero chart (every bar at 0 height) reads as an empty/broken axis,
  // not as data -- show an honest sentence instead of a chart nobody can
  // read anything from.
  if (!characterHasActivity(characters, order)) {
    return `<section class="stats-section stats-section--chart stats-section--crew">${sectionHeading('mask', 'Crew performance', 'Combat by character')}<p class="stats-note">No kills, deaths, or extractions recorded yet.</p></section>`;
  }
  const rows = order.map(name => {
    const c = characters[name] || {};
    const played = c.kills != null || c.deaths != null || c.extractions != null;
    const kd = ratio(c.kills, c.deaths);
    return [
      characterLabel(name),
      played ? fmt(c.kills ?? 0) : 'Not yet deployed',
      played ? fmt(c.deaths ?? 0) : '—',
      played ? fmt(c.extractions ?? 0) : '—',
      played ? (kd ?? '—') : '—'
    ];
  });
  return `<section class="stats-section stats-section--chart stats-section--crew">${sectionHeading('mask', 'Crew performance', 'Combat by character', 'Compare each scavenger’s combat record at a glance.')}${chartFigure({
    id: 'stats-chart-characters',
    ariaLabel: 'Kills, deaths, and extractions by character',
    title: 'Combat by character',
    columns: ['Character', 'Kills', 'Deaths', 'Extractions', 'K/D'],
    rows,
    height: Math.max(220, order.length * 50),
    panels: [
      { id: 'stats-chart-characters-kills', label: 'Kills', ariaLabel: 'Kills by character' },
      { id: 'stats-chart-characters-deaths', label: 'Deaths', ariaLabel: 'Deaths by character' },
      { id: 'stats-chart-characters-extractions', label: 'Extractions', ariaLabel: 'Extractions by character' }
    ]
  })}</section>`;
}

function initCharacterCombat(container, characters) {
  const order = characterOrder(characters);
  if (!order.length || !characterHasActivity(characters, order)) return;
  const labels = order.map(characterLabel);
  const metricChart = (canvasId, metric, color) => {
    const canvas = container.querySelector(`#${canvasId}`);
    if (!canvas) return;
    createChart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: metric[0].toUpperCase() + metric.slice(1), data: order.map(name => Number((characters[name] || {})[metric]) || 0), backgroundColor: color }] },
      options: { indexAxis: 'y' }
    });
  };
  metricChart('stats-chart-characters-kills', 'kills', STATUS_AMBER);
  metricChart('stats-chart-characters-deaths', 'deaths', STATUS_RED);
  metricChart('stats-chart-characters-extractions', 'extractions', STATUS_GREEN);
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

// Internal/QA maps get the same "not on the wiki" flag the old per-map
// cards showed, folded into the axis label itself since a bar has no
// separate tag slot.
function mapChartLabel(g) {
  const meta = MAP_META[g.key];
  const label = meta ? meta.name : mapFallbackLabel(g.key);
  return meta && meta.internal ? `${label} (Internal/QA)` : label;
}

function mapHasActivity(groups) {
  return groups.some(g => g.entry > 0 || g.extract > 0 || g.death > 0);
}

// Extraction rate / death rate: restores the derived per-map percentages
// the pre-chart card layout showed (`Extraction rate: 70%` / `Death rate:
// 40%`, asserted by the old browser test) that the raw entries/extractions/
// deaths bars alone silently dropped. Both are entries-denominated (not
// extractions+deaths like the player-level rate in renderPlayerSummary --
// entries is this section's own natural denominator and matches what the
// old cards computed) and both guard the 0-entries case: percent() already
// returns null rather than NaN/Infinity when the denominator is <= 0, and
// every caller renders that null as an em dash.
function mapRates(g) {
  return { extractRate: percent(g.extract, g.entry), deathRate: percent(g.death, g.entry) };
}

function mapActivityRow(g, rank) {
  const { extractRate, deathRate } = mapRates(g);
  const meta = MAP_META[g.key];
  const sourceLabel = g.ids.length > 1
    ? `${g.ids.length} grouped variants: ${g.ids.join(', ')}`
    : g.ids[0];
  const source = technicalDetails(sourceLabel, g.ids.length > 1 ? 'Show grouped location IDs' : 'Show internal location ID');
  const rate = extractRate == null ? '—' : `${extractRate}%`;
  const rateWidth = extractRate == null ? 0 : Math.max(0, Math.min(100, extractRate));
  return `<article class="map-activity-row" role="listitem">
    <span class="map-activity-rank" aria-label="Rank ${rank}">${rank}</span>
    <div class="map-activity-place"><h4>${esc(mapChartLabel(g))}</h4>${source}${meta && meta.blurb ? `<p>${esc(meta.blurb)}</p>` : ''}</div>
    <dl class="map-activity-metrics" aria-label="Activity for ${esc(mapChartLabel(g))}">
      <div><dt>Entries</dt><dd>${fmt(g.entry)}</dd></div>
      <div><dt>Extracted</dt><dd>${fmt(g.extract)}</dd></div>
      <div><dt>Deaths</dt><dd>${fmt(g.death)}</dd></div>
    </dl>
    <div class="map-activity-rate" aria-label="Extraction rate ${esc(rate)}; death rate ${deathRate == null ? '—' : `${deathRate}%`}">
      <span><b>${esc(rate)}</b> extracted</span>
      <span class="map-activity-rate__track"><span style="width:${rateWidth}%"></span></span>
    </div>
  </article>`;
}

function renderMapActivity(maps) {
  if (!maps.length) return '';
  const groups = groupMapStats(maps).sort((a, b) => b.entry - a.entry);
  if (!mapHasActivity(groups)) {
    return `<section class="stats-section stats-section--route">${sectionHeading('runner', 'Route history', 'Map activity')}<p class="stats-note">No entries recorded yet.</p></section>`;
  }
  const visible = groups.slice(0, 6).map((g, index) => mapActivityRow(g, index + 1)).join('');
  const remaining = groups.slice(6).map((g, index) => mapActivityRow(g, index + 7)).join('');
  return `<section class="stats-section stats-section--route">${sectionHeading('runner', 'Route history', 'Map activity', 'Your busiest locations, ranked by entries with extraction performance alongside.')}
    <div class="map-activity-list" role="list">${visible}</div>
    ${remaining ? `<details class="map-activity-more"><summary>${groups.length - 6} more ${groups.length - 6 === 1 ? 'location' : 'locations'}</summary><div class="map-activity-list" role="list">${remaining}</div></details>` : ''}
  </section>`;
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
  const domMeta = dominantFaction && FACTION_META[dominantFaction] ? factionMeta(dominantFaction) : null;
  const breakdown = entityOrder(Object.keys(g.factions)).map(f => {
    const pct = g.factions[f];
    const fMeta = factionMeta(f);
    const marker = FACTION_META[f] ? factionDot(fMeta.color) : '<span class="unknown-faction-marker" aria-hidden="true">?</span>';
    return `<span class="territory-share">${marker}${esc(fMeta.name)} <b>${Math.round(pct * 100)}%</b></span>`;
  }).join('');
  const cardStyle = domMeta ? ` style="--dominant-color:${esc(domMeta.color)};--dominant-wash:${esc(hexToRgba(domMeta.color, 0.12))}"` : '';
  return `<article class="territory-card"${cardStyle}>
    <header class="territory-card-head">
      <span class="territory-card-icon">${appIcon('target')}</span>
      <h4>${esc(label)} ${idLabel}</h4>
    </header>
    ${meta && meta.blurb ? `<p class="territory-blurb">${esc(meta.blurb)}</p>` : ''}
    <div class="territory-breakdown">${breakdown}</div>
    ${domMeta ? `<p class="territory-predict">${factionDot(domMeta.color)}<b>${esc(domMeta.name)}</b> controls ${Math.round(dominantShare * 100)}% here -- expect the most, and best-equipped, ${esc(domMeta.name)} hostiles.</p>` : ''}
  </article>`;
}

// Territory control: known factions use one stacked horizontal bar per
// location in validated FACTION_ORDER. If a newer save introduces an unknown
// faction, switch the whole figure to single-series small multiples: no
// unvalidated identity color is introduced, and every unknown value remains
// visible by its text label in both its panel and the paired data table.
function territoryHasActivity(groups) {
  return groups.some(g => Object.values(g.factions).some(pct => (Number(pct) || 0) > 0));
}

function renderTerritoryChart(groups) {
  if (!groups.length || !territoryHasActivity(groups)) return '';
  const factionsPresent = entityOrder(groups.flatMap(g => Object.keys(g.factions)));
  if (!factionsPresent.length) return '';
  const hasUnknown = factionsPresent.some(f => !FACTION_META[f]);
  const rows = groups.map(g => [
    MAP_META[g.key] ? MAP_META[g.key].name : mapFallbackLabel(g.key),
    ...factionsPresent.map(f => g.factions[f] != null ? `${Math.round(g.factions[f] * 100)}%` : '—')
  ]);
  return chartFigure({
    id: 'stats-chart-territory',
    ariaLabel: 'Territory control by location, percent share per faction',
    title: 'Territory control by location',
    columns: ['Location', ...factionsPresent.map(f => factionMeta(f).name)],
    rows,
    height: Math.max(220, groups.length * 50),
    panels: hasUnknown ? factionsPresent.map((f, index) => ({
      id: `stats-chart-territory-panel-${index}`,
      label: factionMeta(f).name,
      ariaLabel: `${factionMeta(f).name} territory control by location`
    })) : null
  });
}

function initTerritoryChart(container, groups) {
  if (!groups.length || !territoryHasActivity(groups)) return;
  const factionsPresent = entityOrder(groups.flatMap(g => Object.keys(g.factions)));
  if (!factionsPresent.length) return;
  const labels = groups.map(g => MAP_META[g.key] ? MAP_META[g.key].name : mapFallbackLabel(g.key));
  const theme = chartTheme();
  if (factionsPresent.some(f => !FACTION_META[f])) {
    factionsPresent.forEach((f, index) => {
      const canvas = container.querySelector(`#stats-chart-territory-panel-${index}`);
      if (!canvas) return;
      createChart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{
          label: factionMeta(f).name,
          data: groups.map(g => (g.factions[f] || 0) * 100),
          backgroundColor: FACTION_META[f] ? factionMeta(f).color : '#767D88'
        }] },
        options: {
          indexAxis: 'y',
          scales: { x: { min: 0, max: 100, ticks: { callback: v => `${v}%` } } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.x.toFixed(0)}%` } } }
        }
      });
    });
    return;
  }
  const canvas = container.querySelector('#stats-chart-territory');
  if (!canvas) return;
  createChart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: factionsPresent.map(f => ({
        label: factionMeta(f).name,
        data: groups.map(g => (g.factions[f] || 0) * 100),
        backgroundColor: factionMeta(f).color,
        borderColor: theme.tooltipBg,
        borderWidth: 2
      }))
    },
    options: {
      indexAxis: 'y',
      scales: { x: { min: 0, max: 100, stacked: true, ticks: { callback: v => `${v}%` } }, y: { stacked: true } },
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(0)}%` } } }
    }
  });
}

function renderTerritory(territory, groups) {
  if (!territory.length) return '';
  const territoryFactions = entityOrder(territory.flatMap(row => Object.keys(row.factions || {})));
  const knownFactions = territoryFactions.filter(f => FACTION_META[f]);
  const unknownFactions = territoryFactions.filter(f => !FACTION_META[f]);
  const legend = `${factionLegend(knownFactions)}${unknownFactions.length ? `<div class="faction-legend"><span class="faction-tag"><span class="unknown-faction-marker" aria-hidden="true">?</span>${esc(unknownFactions.length === 1 ? factionMeta(unknownFactions[0]).name : 'Unrecognized factions (see data table)')}</span></div>` : ''}`;
  return `<section class="stats-section stats-section--territory territory-section">
    ${sectionHeading('target', 'Theater of War', 'Territory control', 'Higher faction control means more—and better-equipped—hostiles in that location.')}
    <p class="territory-source"><a href="https://theforeverwinter.wiki.gg/wiki/Factions" target="_blank" rel="noopener noreferrer">Faction reference on the Forever Winter wiki</a></p>
    ${legend}
    ${renderTerritoryChart(groups)}
    <div class="territory-grid">${groups.map(territoryCard).join('')}</div>
  </section>`;
}

async function loadStats() {
  const el = document.getElementById('statsContent');
  destroyCharts(el);
  showLoading(el, 4, 'Loading stats');
  try {
    const stats = await api('/stats');
    const damage = stats.damage || {};
    const characters = stats.characters || {};
    const maps = stats.maps || [];
    const territory = stats.territory || [];
    const territoryGroups = groupTerritory(territory);
    const characterCombat = renderCharacterCombat(characters);
    const mapActivity = renderMapActivity(maps);
    const factionCombat = renderFactionCombat(stats.factions || {});
    const factionProfile = renderFactionProfile(damage);
    const activityStory = characterCombat || mapActivity
      ? `<div class="stats-story-grid">${characterCombat}${mapActivity}</div>` : '';
    const combatStory = factionCombat || factionProfile
      ? `<div class="stats-story-grid stats-story-grid--combat">${factionCombat}${factionProfile}</div>` : '';
    const html = `<div class="stats-dashboard-intro"><span class="stats-dashboard-intro__icon">${appIcon('target')}</span><div><span class="eyebrow">Read-only field report</span><p>Your combat history, organized from your personal record to the state of the war.</p></div></div>${[
      renderPlayerSummary(stats.player || {}),
      renderTerritory(territory, territoryGroups),
      activityStory,
      combatStory,
      renderModSplit(damage)
    ].join('')}`;
    // Destroy any charts bound to the outgoing markup's canvases BEFORE
    // replacing innerHTML (see charts.mjs's lifecycle note); charts are then
    // (re)created below, after the new canvases are actually in the DOM.
    destroyCharts(el);
    setRenderedHtml(el, html || emptyStateHtml('No stats found'));
    if (html) {
      initFactionProfile(el, damage);
      initModSplit(el, damage);
      initCharacterCombat(el, characters);
      initTerritoryChart(el, territoryGroups);
    }
  } catch (error) {
    destroyCharts(el);
    setRenderedHtml(el, loadErrorHtml('stats', error));
  }
}

expose({ loadStats });
