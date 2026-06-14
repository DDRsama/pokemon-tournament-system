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

function freshState(overrides = {}) {
  return {
    _id: null,
    _createdAt: Date.now(),
    tournamentName: 'Pokemon Tournament System',
    phase: 'setup',
    round: 0,
    players: [],
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
    swissRankingArchive: [],
    swissRollbackSnapshots: [],
    playerProfiles: {},
    playerSessions: {},
    playerReports: {},
    ...overrides,
  };
}

function restoreByeSet(rawByeSet) {
  if (!rawByeSet) return new Set();
  if (rawByeSet instanceof Set) return rawByeSet;
  if (Array.isArray(rawByeSet)) return new Set(rawByeSet);
  return new Set(Object.keys(rawByeSet || {}));
}

function restoreState(rawState = {}) {
  return {
    ...freshState(),
    ...rawState,
    lastLiveMatch: rawState.lastLiveMatch || null,
    lastResult: rawState.lastResult || null,
    _byeSet: restoreByeSet(rawState._byeSet),
    swissMatchesArchive: rawState.swissMatchesArchive || [],
    swissRollbackSnapshots: rawState.swissRollbackSnapshots || [],
    playerProfiles: rawState.playerProfiles || {},
    playerSessions: rawState.playerSessions || {},
    playerReports: rawState.playerReports || {},
  };
}

function isTournamentFinished(state = {}) {
  if (state.phase === 'done') return true;
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
  const plain = {
    ...state,
    _byeSet: state._byeSet instanceof Set
      ? [...state._byeSet]
      : Array.isArray(state._byeSet)
        ? [...state._byeSet]
        : (state._byeSet && typeof state._byeSet === 'object' ? Object.keys(state._byeSet) : []),
  };
  return JSON.parse(JSON.stringify(plain));
}

module.exports = {
  freshState,
  restoreByeSet,
  restoreState,
  serializeState,
  normalizeTop8MatchTables,
  isTournamentFinished,
  displayPhaseForTournament,
};
