function normalizeEntrantName(value) {
  const name = String(value || '').trim();
  return name && name !== 'BYE' ? name : null;
}

function uniqueEntrants(values = []) {
  const seen = new Set();
  const entrants = [];
  for (const value of values) {
    const name = normalizeEntrantName(value);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    entrants.push(name);
  }
  return entrants;
}

function getAllEntrantNames(state = {}) {
  const entrantNames = Array.isArray(state.entrants)
    ? state.entrants.map(entrant => entrant.displayName)
    : [];
  const playerNames = Array.isArray(state.players) ? state.players : [];
  return uniqueEntrants([...entrantNames, ...playerNames]);
}

function getStageResult(state = {}, stageId) {
  if (!stageId || !state.stageResults || typeof state.stageResults !== 'object') return null;
  return state.stageResults[stageId] || null;
}

function setStageResult(state = {}, stageId, result = {}) {
  if (!stageId) return null;
  if (!state.stageResults || typeof state.stageResults !== 'object') state.stageResults = {};
  const normalized = {
    stageId,
    completedAt: result.completedAt || Date.now(),
    standings: Array.isArray(result.standings) ? result.standings.map(entry => ({ ...entry })) : [],
    advancers: uniqueEntrants(result.advancers || []),
    metadata: result.metadata && typeof result.metadata === 'object' ? { ...result.metadata } : {},
  };
  state.stageResults[stageId] = normalized;
  return normalized;
}

function getEntryListForStage(state = {}, stage = null) {
  if (!stage) return [];
  const source = stage.entrySource || {};
  if (source.type === 'previous_stage_advancers' && source.fromStageId) {
    const previous = getStageResult(state, source.fromStageId);
    if (previous && Array.isArray(previous.advancers) && previous.advancers.length > 0) {
      return uniqueEntrants(previous.advancers);
    }
  }
  if (Array.isArray(source.entrants) && source.entrants.length > 0) {
    return uniqueEntrants(source.entrants);
  }
  return getAllEntrantNames(state);
}

function buildAdvancersFromStandings(standings = [], count = 0, field = 'player') {
  const limit = Number(count);
  if (!Number.isInteger(limit) || limit <= 0) return [];
  return standings
    .slice(0, limit)
    .map(entry => entry[field] || entry.displayName || entry.player)
    .filter(Boolean);
}

module.exports = {
  normalizeEntrantName,
  uniqueEntrants,
  getAllEntrantNames,
  getStageResult,
  setStageResult,
  getEntryListForStage,
  buildAdvancersFromStandings,
};
