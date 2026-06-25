const { SCHEMA_VERSION, clone, createDefaultTournamentSettings } = require('./presets');

function normalizeBestOf(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return fallback;
  return number % 2 === 1 ? number : number + 1;
}

function winsRequired(bestOf) {
  const safeBestOf = normalizeBestOf(bestOf, 1);
  return Math.floor(safeBestOf / 2) + 1;
}

function usesGameScore(rules = {}, stage = null) {
  const bestOf = normalizeBestOf(rules.bestOf ?? stage?.matchRules?.bestOf ?? 1, 1);
  return rules.scoreMode === 'games'
    || bestOf > 1
    || stage?.type === 'single_elimination'
    || stage?.type === 'double_elimination';
}

function normalizeMatchRules(raw = {}, defaults = {}) {
  const fallback = {
    bestOf: 1,
    allowDraw: false,
    scoreMode: 'match',
    ...defaults,
  };
  return {
    bestOf: normalizeBestOf(raw.bestOf ?? fallback.bestOf, fallback.bestOf),
    allowDraw: typeof raw.allowDraw === 'boolean' ? raw.allowDraw : !!fallback.allowDraw,
    scoreMode: raw.scoreMode || fallback.scoreMode || 'match',
  };
}

function normalizeStage(rawStage = {}, index = 0) {
  const type = rawStage.type || (index === 0 ? 'swiss' : 'single_elimination');
  const role = rawStage.role || (type === 'swiss' || type === 'groups' || type === 'group_round_robin' || type === 'round_robin' ? 'qualification' : 'finals');
  const id = rawStage.id || `stage_${type}_${index + 1}`;
  const stage = {
    ...clone(rawStage),
    id,
    role,
    type,
    name: rawStage.name || id,
    entrySource: rawStage.entrySource || { type: index === 0 ? 'all_entrants' : 'previous_stage_advancers' },
    matchRules: normalizeMatchRules(rawStage.matchRules || {}, type === 'swiss'
      ? { bestOf: 1, allowDraw: true, scoreMode: 'match' }
      : { bestOf: 3, allowDraw: false, scoreMode: 'games' }),
  };
  if (type === 'swiss') {
    const rawSwiss = rawStage.swiss || {};
    stage.swiss = {
      roundPolicy: rawSwiss.roundPolicy || 'auto_by_entrant_count',
      pairingMethod: rawSwiss.pairingMethod || 'swiss',
      byePolicy: rawSwiss.byePolicy || 'avoid_repeat',
    };
  }
  return stage;
}

function deriveLegacyPresetOptions(legacyState = {}) {
  const topCutSize = Array.isArray(legacyState.pendingTop8) && legacyState.pendingTop8.length > 0
    ? legacyState.pendingTop8.length
    : Array.isArray(legacyState.top8) && legacyState.top8.length > 0
      ? legacyState.top8.length
      : 8;
  return {
    topCutSize,
  };
}

function normalizeTournamentSettings(rawSettings = null, legacyState = {}) {
  const legacyStages = Array.isArray(legacyState.stages) ? legacyState.stages : [];
  const base = createDefaultTournamentSettings(deriveLegacyPresetOptions(legacyState));
  const merged = {
    ...base,
    ...(rawSettings && typeof rawSettings === 'object' ? clone(rawSettings) : {}),
  };
  const rawStages = Array.isArray(merged.stages) && merged.stages.length > 0
    ? merged.stages
    : legacyStages.length > 0
      ? legacyStages
      : base.stages;
  return {
    presetId: merged.presetId || base.presetId,
    game: merged.game || 'vgc',
    entrantType: merged.entrantType || 'player',
    stages: rawStages.map(normalizeStage),
  };
}

function validateTournamentSettings(settings = {}) {
  const errors = [];
  const normalized = normalizeTournamentSettings(settings);
  const stages = normalized.stages || [];
  if (stages.length === 0) errors.push('at least one stage is required');

  const stageIds = new Set();
  for (const stage of stages) {
    if (!stage.id) errors.push('stage id is required');
    if (stage.id && stageIds.has(stage.id)) errors.push(`duplicate stage id: ${stage.id}`);
    if (stage.id) stageIds.add(stage.id);
  }

  for (const stage of stages) {
    if (stage.advancement && stage.advancement.targetStageId && !stageIds.has(stage.advancement.targetStageId)) {
      errors.push(`stage ${stage.id} advancement target does not exist: ${stage.advancement.targetStageId}`);
    }
    if (stage.entrySource?.fromStageId && !stageIds.has(stage.entrySource.fromStageId)) {
      errors.push(`stage ${stage.id} entry source does not exist: ${stage.entrySource.fromStageId}`);
    }
    if (stage.type === 'swiss') {
      const roundPolicy = stage.swiss?.roundPolicy || 'auto_by_entrant_count';
      if (roundPolicy !== 'auto_by_entrant_count') errors.push(`stage ${stage.id} requires swiss.roundPolicy auto_by_entrant_count`);
    }
    if (stage.type === 'groups' || stage.type === 'group_round_robin') {
      const groupCount = Number(stage.groups?.groupCount);
      const advancePerGroup = Number(stage.groups?.advancePerGroup ?? stage.advancement?.count);
      if (!Number.isInteger(groupCount) || groupCount <= 0) errors.push(`stage ${stage.id} requires groups.groupCount`);
      if (!Number.isInteger(advancePerGroup) || advancePerGroup <= 0) errors.push(`stage ${stage.id} requires groups.advancePerGroup`);
    }
    if (stage.type === 'single_elimination') {
      const bracketSize = Number(stage.elimination?.bracketSize);
      if (!Number.isInteger(bracketSize) || bracketSize < 2) errors.push(`stage ${stage.id} requires elimination.bracketSize >= 2`);
    }
    if (stage.type === 'double_elimination') {
      const bracketSize = Number(stage.doubleElimination?.bracketSize);
      if (!Number.isInteger(bracketSize) || bracketSize < 2) errors.push(`stage ${stage.id} requires doubleElimination.bracketSize >= 2`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    settings: normalized,
  };
}

function normalizeEngineState(rawState = {}) {
  const tournamentSettings = normalizeTournamentSettings(rawState.tournamentSettings, rawState);
  return {
    ...rawState,
    schemaVersion: SCHEMA_VERSION,
    tournamentSettings,
    stages: clone(tournamentSettings.stages),
    activeStageId: rawState.activeStageId || inferActiveStageId(rawState, tournamentSettings.stages),
    stageResults: rawState.stageResults && typeof rawState.stageResults === 'object' ? rawState.stageResults : {},
    groupAssignments: rawState.groupAssignments && typeof rawState.groupAssignments === 'object' ? rawState.groupAssignments : {},
    groupRound: Number.isInteger(Number(rawState.groupRound)) && Number(rawState.groupRound) > 0 ? Number(rawState.groupRound) : 1,
    groupStageRounds: rawState.groupStageRounds && typeof rawState.groupStageRounds === 'object' ? rawState.groupStageRounds : {},
    doubleElimination: rawState.doubleElimination && typeof rawState.doubleElimination === 'object' ? rawState.doubleElimination : {},
  };
}

function inferActiveStageId(state = {}, stages = []) {
  if (!Array.isArray(stages) || stages.length === 0) return null;
  if (state.phase === 'swiss' || state.phase === 'swiss-ended') {
    return stages.find(stage => stage.type === 'swiss')?.id || stages[0].id;
  }
  if (state.phase === 'groups' || state.phase === 'groups-ended') {
    return stages.find(stage => stage.type === 'groups' || stage.type === 'group_round_robin')?.id || stages[0].id;
  }
  if (state.phase === 'double_elimination' || state.phase === 'double_elimination-ended') {
    return stages.find(stage => stage.type === 'double_elimination')?.id || stages[stages.length - 1].id;
  }
  if (state.phase === 'top8' || state.phase === 'done') {
    return stages.find(stage => stage.type === 'single_elimination')?.id || stages[stages.length - 1].id;
  }
  return null;
}

module.exports = {
  normalizeBestOf,
  winsRequired,
  usesGameScore,
  normalizeMatchRules,
  normalizeStage,
  normalizeTournamentSettings,
  validateTournamentSettings,
  normalizeEngineState,
  inferActiveStageId,
};
