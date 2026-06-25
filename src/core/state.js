const { SCHEMA_VERSION, createDefaultTournamentSettings, clone } = require('./presets');
const { normalizeEngineState } = require('./rules');
const { migrateLegacyEntrants } = require('./entrants');

function normalizeTop8MatchTables(state = {}) {
  const matches = state && Array.isArray(state.matches) ? state.matches : [];
  const qfOrder = ['qf1', 'qf2', 'qf3', 'qf4'];
  const sfOrder = ['sf1', 'sf2'];
  const medalOrder = ['final', 'bronze'];

  qfOrder.forEach((id, index) => {
    const match = matches.find(m => m.id === id || (m.phase === 'Quarter Finals' && m.bracketRound === 1 && m.id === id));
    if (match) match.table = index + 1;
  });
  sfOrder.forEach((id, index) => {
    const match = matches.find(m => m.id === id || (m.phase === 'Semi Finals' && m.bracketRound === 2 && m.id === id));
    if (match) match.table = index + 1;
  });
  medalOrder.forEach((id, index) => {
    const match = matches.find(m => m.id === id || ((id === 'final' ? m.phase === 'Finals' : m.phase === 'Bronze Match') && m.bracketRound === 3));
    if (match) match.table = index + 1;
  });
  return state;
}

function getStages(state = {}) {
  if (Array.isArray(state.stages) && state.stages.length > 0) return state.stages;
  if (Array.isArray(state.tournamentSettings?.stages) && state.tournamentSettings.stages.length > 0) {
    return state.tournamentSettings.stages;
  }
  return [];
}

function hasStageResult(state = {}, stageId = '') {
  return !!(stageId && state.stageResults && state.stageResults[stageId]);
}

function isTerminalSwissSummary(state = {}) {
  if (state.phase !== 'swiss-ended') return false;
  const stages = getStages(state);
  const swissStage = stages.find(stage => stage.id === state.activeStageId && stage.type === 'swiss')
    || stages.find(stage => stage.type === 'swiss')
    || null;
  if (!swissStage) return false;
  const hasRanking = Array.isArray(state.swissRanking) && state.swissRanking.length > 0;
  const hasArchivedRanking = Array.isArray(state.swissRankingArchive) && state.swissRankingArchive.length > 0;
  if (!hasRanking && !hasArchivedRanking && !hasStageResult(state, swissStage.id)) return false;
  return !swissStage.advancement?.targetStageId;
}

function getTerminalSwissStage(state = {}) {
  if (state.phase !== 'swiss-ended' && state.phase !== 'done') return null;
  const stages = getStages(state);
  const swissStage = stages.find(stage => stage.id === state.activeStageId && stage.type === 'swiss')
    || stages.find(stage => stage.type === 'swiss')
    || null;
  return swissStage && !swissStage.advancement?.targetStageId ? swissStage : null;
}

function freshState(overrides = {}) {
  const baseSettings = createDefaultTournamentSettings(overrides.tournamentSettings || {});
  const state = {
    schemaVersion: SCHEMA_VERSION,
    _id: null,
    _createdAt: Date.now(),
    tournamentName: 'Pokemon Tournament System',
    tournamentSettings: baseSettings,
    stages: clone(baseSettings.stages),
    activeStageId: null,
    stageResults: {},
    phase: 'setup',
    round: 0,
    groupRound: 1,
    groupStageRounds: {},
    players: [],
    entrants: [],
    matches: [],
    top8: [],
    pendingTop8: null,
    swissRanking: [],
    swissRounds: 0,
    publicBaseUrlOverride: '',
    liveRoomCode: '',
    currentLiveMatch: null,
    lastLiveMatch: null,
    lastResult: null,
    overlayState: 'idle',
    _dropped: [],
    _dropAfterRound: {},
    _byeSet: new Set(),
    _featuredSwissPlayers: [],
    swissMatchHistory: [],
    swissMatchesArchive: [],
    groupMatchHistory: [],
    swissRankingArchive: [],
    swissRollbackSnapshots: [],
    playerProfiles: {},
    playerSessions: {},
    playerReports: {},
    pointAwards: [],
    ...overrides,
  };
  return normalizeEngineState(state);
}

function restoreByeSet(rawByeSet) {
  if (!rawByeSet) return new Set();
  if (rawByeSet instanceof Set) return rawByeSet;
  if (Array.isArray(rawByeSet)) return new Set(rawByeSet);
  return new Set(Object.keys(rawByeSet || {}));
}

function restoreState(rawState = {}) {
  const base = freshState();
  const restored = {
    ...base,
    ...rawState,
    tournamentSettings: rawState.tournamentSettings,
    stages: rawState.stages,
    activeStageId: rawState.activeStageId,
    stageResults: rawState.stageResults && typeof rawState.stageResults === 'object' ? rawState.stageResults : {},
    lastLiveMatch: rawState.lastLiveMatch || null,
    lastResult: rawState.lastResult || null,
    _byeSet: restoreByeSet(rawState._byeSet),
    swissMatchesArchive: rawState.swissMatchesArchive || [],
    groupMatchHistory: Array.isArray(rawState.groupMatchHistory) ? rawState.groupMatchHistory : [],
    swissRollbackSnapshots: rawState.swissRollbackSnapshots || [],
    playerProfiles: rawState.playerProfiles || {},
    playerSessions: rawState.playerSessions || {},
    playerReports: rawState.playerReports || {},
    pointAwards: Array.isArray(rawState.pointAwards) ? rawState.pointAwards : [],
  };
  restored.entrants = migrateLegacyEntrants(restored);
  const normalized = normalizeEngineState(restored);
  if (isTerminalSwissSummary(normalized)) {
    const swissStage = getTerminalSwissStage(normalized);
    const result = swissStage && normalized.stageResults ? normalized.stageResults[swissStage.id] : null;
    if (result && Array.isArray(result.advancers) && result.advancers.length > 0) {
      normalized.stageResults[swissStage.id] = {
        ...result,
        advancers: [],
        metadata: {
          ...(result.metadata || {}),
          advancementMode: 'none',
        },
      };
    }
    normalized.phase = 'done';
    normalized.overlayState = 'swiss-ended';
    normalized.pendingTop8 = null;
  }
  return normalized;
}

function isTournamentFinished(state = {}) {
  if (state.phase === 'done') return true;
  if (isTerminalSwissSummary(state)) return true;
  const matches = state.matches || [];
  const finalsDone = matches.some(m => m.phase === 'Finals' && m.done);
  const bronzeDone = matches.some(m => m.phase === 'Bronze Match' && m.done);
  return finalsDone && bronzeDone;
}

function displayPhaseForTournament(state = {}) {
  return isTournamentFinished(state) ? 'done' : state.phase;
}

function serializeState(state = {}) {
  normalizeTop8MatchTables(state);
  const normalized = normalizeEngineState(state);
  normalized.entrants = migrateLegacyEntrants(normalized);
  const plain = {
    ...normalized,
    _byeSet: normalized._byeSet instanceof Set
      ? [...normalized._byeSet]
      : Array.isArray(normalized._byeSet)
        ? [...normalized._byeSet]
        : (normalized._byeSet && typeof normalized._byeSet === 'object' ? Object.keys(normalized._byeSet) : []),
  };
  return JSON.parse(JSON.stringify(plain));
}

module.exports = {
  freshState,
  restoreByeSet,
  restoreState,
  serializeState,
  normalizeTop8MatchTables,
  isTerminalSwissSummary,
  isTournamentFinished,
  displayPhaseForTournament,
};
