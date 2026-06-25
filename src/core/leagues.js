const { summarizeAwards } = require('./points');

function normalizeTournamentBinding(binding = {}, fallbackProfileId = null) {
  const tournamentId = String(binding.tournamentId || binding.id || '').trim();
  if (!tournamentId) return null;
  return {
    tournamentId,
    pointsProfileId: binding.pointsProfileId || fallbackProfileId || null,
    includedAt: binding.includedAt || Date.now(),
  };
}

function normalizeTournamentBindings(input = {}) {
  const fallbackProfileId = input.pointsProfileId || null;
  const bindings = Array.isArray(input.tournamentBindings)
    ? input.tournamentBindings
    : [];
  const byTournamentId = new Map();
  for (const binding of bindings) {
    const normalized = normalizeTournamentBinding(binding, fallbackProfileId);
    if (normalized) byTournamentId.set(normalized.tournamentId, normalized);
  }
  for (const tournamentId of Array.isArray(input.includedTournamentIds) ? input.includedTournamentIds : []) {
    const id = String(tournamentId || '').trim();
    if (!id || byTournamentId.has(id)) continue;
    byTournamentId.set(id, normalizeTournamentBinding({ tournamentId: id }, fallbackProfileId));
  }
  return [...byTournamentId.values()];
}

function createLeague(input = {}) {
  const tournamentBindings = normalizeTournamentBindings(input);
  return {
    id: input.id || `league_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: input.name || '未命名联赛',
    seasonLabel: input.seasonLabel || '',
    game: input.game || 'vgc',
    divisions: Array.isArray(input.divisions) ? [...input.divisions] : ['open'],
    regions: Array.isArray(input.regions) ? [...input.regions] : [],
    pointsProfileId: input.pointsProfileId || null,
    tournamentBindings,
    includedTournamentIds: tournamentBindings.map(binding => binding.tournamentId),
    finalTournamentIds: Array.isArray(input.finalTournamentIds) ? [...input.finalTournamentIds] : [],
    bestFinishLimit: Number.isInteger(input.bestFinishLimit) && input.bestFinishLimit > 0 ? input.bestFinishLimit : null,
  };
}

function applyBestFinishLimit(awards = [], limit = null) {
  if (!limit) return awards;
  const grouped = new Map();
  for (const award of awards) {
    const list = grouped.get(award.profileId) || [];
    list.push(award);
    grouped.set(award.profileId, list);
  }
  return [...grouped.values()].flatMap(list =>
    list
      .slice()
      .sort((a, b) => (b.points - a.points) || String(a.tournamentId || '').localeCompare(String(b.tournamentId || '')))
      .slice(0, limit),
  );
}

function buildLeagueLeaderboard({ league = {}, tournamentAwards = [] } = {}) {
  const normalizedLeague = createLeague(league);
  const included = new Set(normalizedLeague.tournamentBindings.map(binding => binding.tournamentId));
  const filtered = tournamentAwards.filter(award =>
    included.has(award.tournamentId),
  );
  const limited = applyBestFinishLimit(filtered, normalizedLeague.bestFinishLimit);
  return summarizeAwards(limited).map((entry, index) => ({
    rank: index + 1,
    ...entry,
  }));
}

function buildFinalQualification(leaderboard = [], count = 8) {
  return leaderboard.slice(0, count).map(entry => ({
    rank: entry.rank,
    profileId: entry.profileId,
    displayName: entry.displayName,
    points: entry.points,
  }));
}

module.exports = {
  createLeague,
  normalizeTournamentBindings,
  applyBestFinishLimit,
  buildLeagueLeaderboard,
  buildFinalQualification,
};
