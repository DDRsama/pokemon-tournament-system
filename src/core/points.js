function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePlacementPointRow(row, index = 0) {
  if (Number.isFinite(Number(row))) {
    return { rank: index + 1, points: Number(row) };
  }
  if (!row || typeof row !== 'object') return null;
  const points = toFiniteNumber(row.points, 0);
  const rank = toPositiveInteger(row.rank);
  const rankMin = toPositiveInteger(row.rankMin);
  const rankMax = toPositiveInteger(row.rankMax);
  if (rank) return { rank, points };
  if (rankMin && rankMax) return { rankMin: Math.min(rankMin, rankMax), rankMax: Math.max(rankMin, rankMax), points };
  return { rank: index + 1, points };
}

function createPointsProfile(input = {}) {
  const placementPoints = Array.isArray(input.placementPoints)
    ? input.placementPoints.map(normalizePlacementPointRow).filter(Boolean)
    : [];
  const bestFinishLimit = toPositiveInteger(input.bestFinishLimit);
  return {
    id: input.id || `points_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: input.name || 'Default Points',
    participationPoints: toFiniteNumber(input.participationPoints, 0),
    placementPoints,
    eventTierMultiplier: toFiniteNumber(input.eventTierMultiplier, 1),
    bestFinishLimit,
  };
}

function getPlacementPoints(rank, profile = {}) {
  const rows = Array.isArray(profile.placementPoints)
    ? profile.placementPoints.map(normalizePlacementPointRow).filter(Boolean)
    : [];
  const row = rows.find(item => {
    if (Number.isInteger(item.rank)) return item.rank === rank;
    const min = Number.isInteger(item.rankMin) ? item.rankMin : item.rank;
    const max = Number.isInteger(item.rankMax) ? item.rankMax : item.rank;
    return Number.isInteger(min) && Number.isInteger(max) && rank >= min && rank <= max;
  });
  return row ? Number(row.points || 0) : 0;
}

function buildEntrantLookup(entrants = []) {
  const byName = new Map();
  const byProfileId = new Map();
  for (const entrant of entrants) {
    if (entrant.displayName) byName.set(entrant.displayName, entrant);
    if (entrant.profileId) byProfileId.set(entrant.profileId, entrant);
  }
  return { byName, byProfileId };
}

function calculateTournamentPoints({ standings = [], entrants = [], profile = createPointsProfile() } = {}) {
  const normalizedProfile = createPointsProfile(profile);
  const { byName, byProfileId } = buildEntrantLookup(entrants);
  const awards = [];
  const awardedProfileIds = new Set();
  for (const standing of standings) {
    const entrant = standing.profileId
      ? byProfileId.get(standing.profileId) || standing
      : byName.get(standing.player || standing.displayName);
    const profileId = standing.profileId || entrant?.profileId || null;
    const rankedEligible = typeof entrant?.rankedEligible === 'boolean' ? entrant.rankedEligible : !!profileId;
    if (!profileId || !rankedEligible) continue;
    const rank = Number(standing.rank);
    const placement = Number.isInteger(rank) ? getPlacementPoints(rank, normalizedProfile) : 0;
    const points = (normalizedProfile.participationPoints + placement) * normalizedProfile.eventTierMultiplier;
    awards.push({
      profileId,
      displayName: standing.player || standing.displayName || entrant?.displayName || profileId,
      rank,
      participationPoints: normalizedProfile.participationPoints,
      placementPoints: placement,
      multiplier: normalizedProfile.eventTierMultiplier,
      points,
    });
    awardedProfileIds.add(profileId);
  }
  for (const entrant of entrants) {
    const profileId = entrant?.profileId || null;
    const rankedEligible = typeof entrant?.rankedEligible === 'boolean' ? entrant.rankedEligible : !!profileId;
    if (!profileId || !rankedEligible || awardedProfileIds.has(profileId)) continue;
    const participationOnlyPoints = normalizedProfile.participationPoints * normalizedProfile.eventTierMultiplier;
    if (participationOnlyPoints === 0) continue;
    awards.push({
      profileId,
      displayName: entrant.displayName || profileId,
      rank: null,
      participationPoints: normalizedProfile.participationPoints,
      placementPoints: 0,
      multiplier: normalizedProfile.eventTierMultiplier,
      points: participationOnlyPoints,
    });
    awardedProfileIds.add(profileId);
  }
  return awards;
}

function summarizeAwards(awards = []) {
  const totals = new Map();
  for (const award of awards) {
    const current = totals.get(award.profileId) || {
      profileId: award.profileId,
      displayName: award.displayName,
      points: 0,
      awards: [],
    };
    current.points += award.points || 0;
    current.awards.push(award);
    totals.set(award.profileId, current);
  }
  return [...totals.values()].sort((a, b) => (b.points - a.points) || a.displayName.localeCompare(b.displayName, 'zh-CN'));
}

module.exports = {
  createPointsProfile,
  getPlacementPoints,
  calculateTournamentPoints,
  summarizeAwards,
};
