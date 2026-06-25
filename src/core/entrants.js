function createEntrantId(tournamentId, displayName) {
  const safeName = String(displayName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'entrant';
  const safeTournament = String(tournamentId || 'tournament').replace(/[^A-Za-z0-9_-]+/g, '_');
  return `entry_${safeTournament}_${safeName}`;
}

function normalizeEntrant(raw = {}) {
  const displayName = String(raw.displayName || raw.name || raw.teamName || '').trim();
  const entrantType = raw.entrantType || (raw.teamRoster || raw.teamName ? 'team' : 'player');
  const teamRoster = Array.isArray(raw.teamRoster)
    ? raw.teamRoster.map(member => String(member || '').trim()).filter(Boolean)
    : [];
  return {
    id: raw.id || createEntrantId(raw.tournamentId, displayName),
    tournamentId: raw.tournamentId || null,
    profileId: raw.profileId || null,
    displayName,
    entryType: raw.entryType || (raw.profileId ? 'registered' : 'guest'),
    entrantType,
    teamRoster,
    source: raw.source || 'manual',
    rankedEligible: typeof raw.rankedEligible === 'boolean' ? raw.rankedEligible : !!raw.profileId,
    dropped: !!raw.dropped,
    dropAfterRound: typeof raw.dropAfterRound === 'number' ? raw.dropAfterRound : null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

function createGuestEntrant({ tournamentId, displayName, id = null, source = 'manual', entrantType = 'player', teamRoster = [] } = {}) {
  return normalizeEntrant({
    id,
    tournamentId,
    displayName,
    entryType: 'guest',
    entrantType,
    teamRoster,
    source,
    rankedEligible: false,
  });
}

function createRegisteredEntrant({ tournamentId, profile, displayName = null, id = null, source = 'manual', entrantType = 'player', teamRoster = [] } = {}) {
  if (!profile || !profile.id) throw new Error('missing player profile');
  return normalizeEntrant({
    id,
    tournamentId,
    profileId: profile.id,
    displayName: displayName || profile.displayName,
    entryType: 'registered',
    entrantType,
    teamRoster,
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

function entrantFromLegacyPlayer(name, state = {}) {
  const displayName = String(name || '').trim();
  if (!displayName || displayName === 'BYE') return null;
  const profile = state.playerProfiles ? state.playerProfiles[displayName] || null : null;
  const profileId = profile?.globalProfileId || null;
  return normalizeEntrant({
    id: profile?.entrantId || createEntrantId(state._id, displayName),
    tournamentId: state._id || null,
    profileId,
    displayName,
    entryType: profileId ? 'registered' : 'guest',
    entrantType: 'player',
    source: profileId ? 'legacy_bound_profile' : 'legacy_player_list',
    rankedEligible: !!profileId || profile?.rankedEligible === true,
    dropped: Array.isArray(state._dropped) ? state._dropped.includes(displayName) : !!state._dropped?.[displayName],
    dropAfterRound: typeof state._dropAfterRound?.[displayName] === 'number' ? state._dropAfterRound[displayName] : null,
  });
}

function migrateLegacyEntrants(state = {}) {
  const byName = new Map();
  for (const entrant of Array.isArray(state.entrants) ? state.entrants : []) {
    const normalized = normalizeEntrant({ tournamentId: state._id || null, ...entrant });
    if (normalized.displayName) byName.set(normalized.displayName, normalized);
  }
  for (const player of state.players || []) {
    if (byName.has(player)) continue;
    const entrant = entrantFromLegacyPlayer(player, state);
    if (entrant) byName.set(entrant.displayName, entrant);
  }
  return [...byName.values()];
}

function findEntrantByDisplayName(entrants = [], displayName) {
  const target = String(displayName || '').trim();
  if (!target) return null;
  return entrants.find(entrant => entrant.displayName === target) || null;
}

function findEntrantById(entrants = [], entrantId) {
  const target = String(entrantId || '').trim();
  if (!target) return null;
  return entrants.find(entrant => entrant.id === target) || null;
}

function createTeamEntrant({ tournamentId, teamName, teamRoster = [], id = null, source = 'manual', profileId = null, rankedEligible = !!profileId } = {}) {
  const displayName = String(teamName || '').trim();
  if (!displayName) throw new Error('missing teamName');
  return normalizeEntrant({
    id,
    tournamentId,
    profileId,
    displayName,
    entryType: profileId ? 'registered' : 'guest',
    entrantType: 'team',
    teamRoster,
    source,
    rankedEligible,
  });
}

function upsertEntrant(entrants = [], entrant) {
  const normalized = normalizeEntrant(entrant);
  const next = entrants.map(item => normalizeEntrant(item));
  const index = next.findIndex(item => item.id === normalized.id || item.displayName === normalized.displayName);
  if (index >= 0) next[index] = { ...next[index], ...normalized };
  else next.push(normalized);
  return next;
}

function patchEntrant(entrant = {}, patch = {}) {
  const current = normalizeEntrant(entrant);
  const next = {
    ...current,
    ...patch,
    id: current.id,
    tournamentId: current.tournamentId,
    displayName: patch.displayName || patch.name || patch.teamName || current.displayName,
    entrantType: patch.entrantType || current.entrantType,
    teamRoster: Array.isArray(patch.teamRoster) ? patch.teamRoster : current.teamRoster,
    profileId: Object.prototype.hasOwnProperty.call(patch, 'profileId') ? patch.profileId : current.profileId,
    rankedEligible: Object.prototype.hasOwnProperty.call(patch, 'rankedEligible') ? !!patch.rankedEligible : current.rankedEligible,
    entryType: patch.entryType || (patch.profileId ? 'registered' : current.entryType),
    updatedAt: Date.now(),
  };
  if (!next.profileId && next.entryType === 'registered') next.entryType = 'guest';
  if (next.profileId && next.entryType === 'guest') next.entryType = 'registered';
  return normalizeEntrant(next);
}

function removeEntrantByDisplayName(entrants = [], displayName) {
  const target = String(displayName || '').trim();
  return entrants.filter(entrant => entrant.displayName !== target);
}

function markEntrantDropped(entrants = [], displayName, roundNumber = null) {
  const target = String(displayName || '').trim();
  return entrants.map(entrant => {
    if (entrant.displayName !== target) return entrant;
    return normalizeEntrant({
      ...entrant,
      dropped: true,
      dropAfterRound: typeof roundNumber === 'number' ? roundNumber : entrant.dropAfterRound,
    });
  });
}

function isRegisteredEntrant(entrant = {}) {
  return !!entrant.profileId && entrant.entryType !== 'guest' && entrant.rankedEligible !== false;
}

function isGuestEntrant(entrant = {}) {
  return !entrant.profileId || entrant.entryType === 'guest';
}

module.exports = {
  createEntrantId,
  normalizeEntrant,
  createGuestEntrant,
  createRegisteredEntrant,
  bindEntrantToProfile,
  entrantFromLegacyPlayer,
  migrateLegacyEntrants,
  findEntrantByDisplayName,
  findEntrantById,
  upsertEntrant,
  patchEntrant,
  removeEntrantByDisplayName,
  markEntrantDropped,
  createTeamEntrant,
  isRegisteredEntrant,
  isGuestEntrant,
};
