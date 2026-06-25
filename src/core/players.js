const { normalizeEntrant } = require('./entrants');

function normalizeDisplayName(value) {
  return String(value || '').trim();
}

function createPlayerProfile(input = {}) {
  const displayName = normalizeDisplayName(input.displayName || input.name);
  if (!displayName) throw new Error('missing player displayName');
  return {
    id: input.id || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    displayName,
    aliases: Array.isArray(input.aliases) ? [...new Set(input.aliases.map(normalizeDisplayName).filter(Boolean))] : [],
    bindings: Array.isArray(input.bindings) ? input.bindings.map(binding => ({ ...binding })) : [],
    stats: {
      tournamentsPlayed: 0,
      rankedTournamentsPlayed: 0,
      leaguePoints: 0,
      ...(input.stats || {}),
    },
  };
}

function createGuestEntrant({ tournamentId, displayName, id = null, source = 'scan_only' } = {}) {
  const name = normalizeDisplayName(displayName);
  if (!name) throw new Error('missing entrant displayName');
  return normalizeEntrant({
    id: id || `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tournamentId,
    profileId: null,
    displayName: name,
    entryType: 'guest',
    source,
    rankedEligible: false,
  });
}

function createRegisteredEntrant({ tournamentId, profile, id = null, source = 'manual_or_scan' } = {}) {
  if (!profile || !profile.id) throw new Error('missing player profile');
  return normalizeEntrant({
    id: id || `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tournamentId,
    profileId: profile.id,
    displayName: profile.displayName,
    entryType: 'registered',
    source,
    rankedEligible: true,
  });
}

function bindEntrantToProfile(entrant, profile) {
  if (!entrant || !profile || !profile.id) throw new Error('missing entrant or profile');
  return normalizeEntrant({
    ...entrant,
    profileId: profile.id,
    displayName: entrant.displayName || profile.displayName,
    entryType: 'registered',
    rankedEligible: true,
  });
}

function mergePlayerProfiles(primary, duplicate) {
  if (!primary || !duplicate) throw new Error('missing profiles');
  const aliases = new Set([...(primary.aliases || []), ...(duplicate.aliases || []), duplicate.displayName].filter(Boolean));
  const bindingKeys = new Set();
  const bindings = [];
  for (const binding of [...(primary.bindings || []), ...(duplicate.bindings || [])]) {
    const key = `${binding.type}:${binding.value}`;
    if (bindingKeys.has(key)) continue;
    bindingKeys.add(key);
    bindings.push({ ...binding });
  }
  return {
    ...primary,
    aliases: [...aliases],
    bindings,
    stats: {
      tournamentsPlayed: (primary.stats?.tournamentsPlayed || 0) + (duplicate.stats?.tournamentsPlayed || 0),
      rankedTournamentsPlayed: (primary.stats?.rankedTournamentsPlayed || 0) + (duplicate.stats?.rankedTournamentsPlayed || 0),
      leaguePoints: (primary.stats?.leaguePoints || 0) + (duplicate.stats?.leaguePoints || 0),
    },
  };
}

module.exports = {
  normalizeDisplayName,
  createPlayerProfile,
  createGuestEntrant,
  createRegisteredEntrant,
  bindEntrantToProfile,
  mergePlayerProfiles,
};
