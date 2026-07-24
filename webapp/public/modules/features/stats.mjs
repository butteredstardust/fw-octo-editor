import { FW, expose } from '../runtime.mjs';

const { api, esc, showLoading, setRenderedHtml, technicalDetails, CHARACTER_META } = FW;

// Prettify internal map codenames (e.g. "L_AshenMesa_WP" -> "Ashen Mesa",
// "L_Dungeon_Tunnel1_04" -> "Dungeon Tunnel1 04") without inventing names for
// maps that have none -- the raw id is always shown alongside via <small>.
function mapLabel(id) {
  const cleaned = String(id).replace(/^L_/, '').replace(/_WP$/, '').replace(/_/g, ' ').trim();
  return cleaned.replace(/\b\w/g, c => c.toUpperCase());
}

function factionLabel(name) {
  if (name === 'ScavengerNPC') return 'Scavenger NPC';
  return name;
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

function mapRowName(id) {
  return `${esc(mapLabel(id))} ${technicalDetails(id, 'Show internal map ID')}`;
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
  const order = ['All', 'Eurasia', 'Europa', 'Euruska', 'Cultist'];
  const keys = order.filter(k => damage[k]);
  if (!keys.length) return '';
  const rows = keys.map(faction => {
    const d = damage[faction];
    const detail = faction === 'All' && d.moddedDamage != null
      ? `Modded ${fmt(d.moddedDamage)} dmg / ${fmt(d.moddedKills)} kills &middot; Unmodded ${fmt(d.unmoddedDamage)} dmg / ${fmt(d.unmoddedKills)} kills`
      : '';
    return statsRow(esc(factionLabel(faction)), detail, `<span class="stat-chip">Damage<b>${fmt(d.damage)}</b></span><span class="stat-chip">Kills<b>${fmt(d.kills)}</b></span>`);
  }).join('');
  return `<div class="stats-section"><h3>Damage by Faction</h3>${rows}</div>`;
}

function renderFactionCombat(factions) {
  const rows = Object.entries(factions).filter(([, v]) => v.attacks != null || v.kills != null);
  if (!rows.length) return '';
  const html = rows.map(([faction, v]) => statsRow(esc(factionLabel(faction)), '', `<span class="stat-chip">Attacks<b>${fmt(v.attacks)}</b></span><span class="stat-chip">Kills<b>${fmt(v.kills)}</b></span>`)).join('');
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

function renderMapStats(maps) {
  if (!maps.length) return '';
  const rows = maps.map(m => {
    const rate = m.entry > 0 ? Math.round((m.extract / m.entry) * 100) : null;
    return statsRow(mapRowName(m.map), '', `<span class="stat-chip">Entries<b>${fmt(m.entry)}</b></span><span class="stat-chip">Extracts<b>${fmt(m.extract)}</b></span><span class="stat-chip">Deaths<b>${fmt(m.death)}</b></span>${rate != null ? `<span class="stat-chip">Extract rate<b>${rate}%</b></span>` : ''}`);
  }).join('');
  return `<div class="stats-section"><h3>Map Statistics</h3>${rows}</div>`;
}

function renderTerritory(territory) {
  if (!territory.length) return '';
  const rows = territory.map(t => {
    const chips = Object.entries(t.factions)
      .sort((a, b) => b[1] - a[1])
      .map(([faction, pct]) => `<span class="stat-chip">${esc(factionLabel(faction))}<b>${Math.round(pct * 100)}%</b></span>`)
      .join('');
    return statsRow(mapRowName(t.location), '', chips);
  }).join('');
  return `<div class="stats-section"><h3>Territory Control (Tug of War)</h3><p class="char-hint">Per-location faction control share, as tracked by the game's own AI/territory system.</p>${rows}</div>`;
}

async function loadStats() {
  const el = document.getElementById('statsContent');
  showLoading(el, 4, 'Loading stats');
  try {
    const stats = await api('/stats');
    const html = [
      renderPlayerSummary(stats.player),
      renderFactionDamage(stats.damage),
      renderFactionCombat(stats.factions),
      renderCharacterCombat(stats.characters),
      renderMapStats(stats.maps),
      renderTerritory(stats.territory)
    ].join('');
    setRenderedHtml(el, html || '<div class="empty-state"><strong>No stats found</strong></div>');
  } catch (error) {
    setRenderedHtml(el, `<div class="empty-state"><strong>Error</strong><br>${esc(error.message)}</div>`);
  }
}

expose({ loadStats });
