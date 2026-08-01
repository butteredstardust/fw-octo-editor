const { runShell } = require('../../utils/validation');
const { getSavePaths } = require('./paths');

// Debug-only Tug-of-War scopes present in every save (a synthetic
// scaling-test map and an internal check-in test), never real playable
// content -- excluded from the territory-control display.
const TUG_OF_WAR_DEBUG_SCOPES = new Set(['TestMapTOWScaling', 'PlayerCheckinTests']);

// Read-only lifetime/combat/progression stats from ScopedCounterValues that
// no existing feature surfaces: overall player totals, damage/kills by
// faction (with a modded-vs-unmodded weapons split), per-character combat
// counts, per-map entry/extract/death counts, and per-location Tug-of-War
// territory control. DataWindow.Persistent carries the canonical value for
// everything except the TugOfWar.* territory scopes, which only ever exist
// under DataWindow.TugOfWar (see listFactionScores()'s comment on the same
// Persistent-vs-TugOfWar duplication elsewhere in this table).
async function getPlayerStats(key) {
  const dbPath = getSavePaths()[0];
  const rows = await runShell(dbPath, key, [
    `SELECT ns.Name, nw.Name, nc.Name, sc.Value FROM ScopedCounterValues sc
     JOIN Names ns ON ns.NameID = sc.ScopeID
     JOIN Names nw ON nw.NameID = sc.WindowID
     JOIN Names nc ON nc.NameID = sc.CounterID
     WHERE nw.Name IN ('DataWindow.Persistent', 'DataWindow.TugOfWar')`
  ]);

  const player = {};
  const damage = {};
  const factions = {};
  const characters = {};
  const mapsByName = new Map();
  const territoryByLocation = new Map();

  for (const raw of rows) {
    const [scope, window, counter, rawValue] = raw.split('|');
    const value = parseFloat(rawValue);

    if (scope === 'Scope.Player' && window === 'DataWindow.Persistent') {
      const key = counter.replace(/^Counter\./, '').toLowerCase();
      player[key] = value;
    } else if (scope.startsWith('Scope.Damage.') && window === 'DataWindow.Persistent') {
      const faction = scope.replace('Scope.Damage.', '');
      const entry = damage[faction] || (damage[faction] = {});
      if (counter === `Counter.Damage.${faction}`) entry.damage = value;
      else if (counter === `Counter.Damage.Kills.${faction}`) entry.kills = value;
      else if (counter === 'Counter.Damage.ModdedWeapons') entry.moddedDamage = value;
      else if (counter === 'Counter.Damage.UnModdedWeapons') entry.unmoddedDamage = value;
      else if (counter === 'Counter.Damage.Kills.ModdedWeapons') entry.moddedKills = value;
      else if (counter === 'Counter.Damage.Kills.UnModdedWeapons') entry.unmoddedKills = value;
    } else if (scope.startsWith('Scope.Faction.') && window === 'DataWindow.Persistent') {
      const faction = scope.replace('Scope.Faction.', '');
      const entry = factions[faction] || (factions[faction] = {});
      if (counter === 'Counter.Attacks') entry.attacks = value;
      else if (counter === 'Counter.Kills') entry.kills = value;
      // Counter.FactionScore is already covered by listFactionScores(); skip it here.
    } else if (scope.startsWith('Scope.Character.') && window === 'DataWindow.Persistent') {
      const character = scope.replace('Scope.Character.', '');
      const entry = characters[character] || (characters[character] = {});
      if (counter === 'Counter.Kills') entry.kills = value;
      else if (counter === 'Counter.Deaths') entry.deaths = value;
      else if (counter === 'Counter.Extractions') entry.extractions = value;
      // Counter.XP is already covered by listCharacters()/listCharacterDetails(); skip it here.
    } else if (scope === 'MapStatistics' && window === 'DataWindow.Persistent') {
      const match = /^MapStatistics\.(.+)\.(Entry|Extract|Death)$/.exec(counter);
      if (!match) continue;
      const [, map, kind] = match;
      const entry = mapsByName.get(map) || { map, entry: 0, extract: 0, death: 0 };
      entry[kind.toLowerCase()] = value;
      mapsByName.set(map, entry);
    } else if (scope.startsWith('TugOfWar.') && window === 'DataWindow.TugOfWar') {
      const location = scope.replace('TugOfWar.', '');
      if (TUG_OF_WAR_DEBUG_SCOPES.has(location)) continue;
      const match = /^AI\.Faction\.Factions\.(.+)$/.exec(counter);
      if (!match) continue;
      const entry = territoryByLocation.get(location) || { location, factions: {} };
      entry.factions[match[1]] = value;
      territoryByLocation.set(location, entry);
    }
  }

  return {
    player,
    damage,
    factions,
    characters,
    maps: [...mapsByName.values()].sort((a, b) => a.map.localeCompare(b.map)),
    territory: [...territoryByLocation.values()].sort((a, b) => a.location.localeCompare(b.location))
  };
}

module.exports = {
  getPlayerStats
};
