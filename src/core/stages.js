function getStages(state = {}) {
  if (Array.isArray(state.stages) && state.stages.length > 0) return state.stages;
  if (state.tournamentSettings && Array.isArray(state.tournamentSettings.stages)) return state.tournamentSettings.stages;
  return [];
}

function getStageById(state = {}, stageId) {
  return getStages(state).find(stage => stage.id === stageId) || null;
}

function getActiveStage(state = {}) {
  const stages = getStages(state);
  if (stages.length === 0) return null;
  if (state.activeStageId) return getStageById(state, state.activeStageId) || null;
  if (state.phase === 'swiss' || state.phase === 'swiss-ended') return stages.find(stage => stage.type === 'swiss') || null;
  if (state.phase === 'groups' || state.phase === 'groups-ended') return stages.find(stage => stage.type === 'groups' || stage.type === 'group_round_robin') || null;
  if (state.phase === 'double_elimination' || state.phase === 'double_elimination-ended') return stages.find(stage => stage.type === 'double_elimination') || null;
  if (state.phase === 'top8' || state.phase === 'done') return stages.find(stage => stage.type === 'single_elimination') || null;
  return null;
}

function getStageMatches(state = {}, stageId) {
  const stage = getStageById(state, stageId);
  if (!stage) return [];
  return (state.matches || []).filter(match => {
    if (match.stageId) return match.stageId === stageId;
    if (stage.type === 'swiss') return typeof match.round === 'number';
    if (stage.type === 'single_elimination') return !!match.phase;
    if (stage.type === 'groups' || stage.type === 'group_round_robin' || stage.type === 'round_robin') return match.stagePhase === 'groups' || typeof match.groupRound === 'number';
    if (stage.type === 'double_elimination') return match.stagePhase === 'double_elimination' || !!match.doubleEliminationRound;
    return false;
  });
}

function isStageComplete(state = {}, stageId) {
  const matches = getStageMatches(state, stageId);
  return matches.length > 0 && matches.every(match => !!match.done);
}

function buildStageViewModel(state = {}, stageId = null) {
  const stage = stageId ? getStageById(state, stageId) : getActiveStage(state);
  if (!stage) return null;
  const matches = getStageMatches(state, stage.id);
  return {
    id: stage.id,
    role: stage.role,
    type: stage.type,
    name: stage.name,
    entrySource: stage.entrySource || null,
    matchRules: stage.matchRules,
    advancement: stage.advancement || null,
    swiss: stage.swiss || null,
    groups: stage.groups || null,
    elimination: stage.elimination || null,
    doubleElimination: stage.doubleElimination || null,
    matchCount: matches.length,
    completedMatchCount: matches.filter(match => !!match.done).length,
    complete: matches.length > 0 && matches.every(match => !!match.done),
  };
}

module.exports = {
  getStages,
  getStageById,
  getActiveStage,
  getStageMatches,
  isStageComplete,
  buildStageViewModel,
};
