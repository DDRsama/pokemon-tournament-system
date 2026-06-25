const { emptyRecord, getRecord } = require('./records');
const { isMatchReady } = require('./matches');
const { usesGameScore, winsRequired } = require('./rules');
const { getEliminationPhaseOrderForState } = require('./top8');

function normalizeGroupRound(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function isVisiblePlayerMatch(match, state = {}) {
  if (!match || match.done) return false;
  if (!isMatchReady(match)) return false;
  if (state.phase === 'groups' && match.stagePhase === 'groups') {
    const currentRound = normalizeGroupRound(
      match.stageId ? state.groupStageRounds?.[match.stageId] : null,
      normalizeGroupRound(state.groupRound, 1),
    );
    return normalizeGroupRound(match.groupRound, 1) === currentRound;
  }
  return true;
}

function dedupeMatches(matches = []) {
  const byId = new Map();
  for (const match of matches) {
    if (!match || !match.id) continue;
    byId.set(match.id, match);
  }
  return [...byId.values()];
}

function isStageHistoryMatch(match = {}) {
  return typeof match.round !== 'number'
    && (match.stagePhase || match.stageId || match.phase || match.groupLabel || match.bracket);
}

function getStageHistorySource(state = {}) {
  return dedupeMatches([
    ...(Array.isArray(state.groupMatchHistory) ? state.groupMatchHistory : []),
    ...(Array.isArray(state.matches) ? state.matches : []).filter(isStageHistoryMatch),
  ]).sort((a, b) =>
    String(a.stageId || '').localeCompare(String(b.stageId || ''), 'zh-CN')
    || (a.groupRound || a.bracketRound || a.doubleEliminationRound || 0) - (b.groupRound || b.bracketRound || b.doubleEliminationRound || 0)
    || (a.groupIndex || 0) - (b.groupIndex || 0)
    || (a.table || 0) - (b.table || 0)
  );
}

function buildPlayerView({
  playerNameOrId,
  state,
  getPlayerNameById,
  getPlayerProfileByName,
  getPlayerCompletionStatus,
  getTop8AwardForPlayer,
}) {
  const playerName = getPlayerNameById(playerNameOrId) || playerNameOrId;
  const inPool = state.players.includes(playerName);
  const profile = getPlayerProfileByName(playerName);
  const standings = state.swissRankingArchive && state.swissRankingArchive.length > 0
    ? state.swissRankingArchive
    : [];
  const archived = standings.find(entry => entry.player === playerName) || null;
  const rawActiveMatch = state.matches.find(match =>
    isVisiblePlayerMatch(match, state) && (match.p1 === playerName || match.p2 === playerName)
  ) || null;
  const isLiveTable = !!(rawActiveMatch && state.currentLiveMatch && state.currentLiveMatch.id === rawActiveMatch.id);
  const stages = Array.isArray(state.stages) && state.stages.length > 0
    ? state.stages
    : Array.isArray(state.tournamentSettings?.stages) ? state.tournamentSettings.stages : [];
  const activeMatchStage = rawActiveMatch
    ? stages.find(stage => stage.id === rawActiveMatch.stageId)
      || (typeof rawActiveMatch.round === 'number'
        ? stages.find(stage => stage.type === 'swiss')
        : null)
    : null;
  const activeMatchRules = activeMatchStage?.matchRules || {};
  const activeMatchBestOf = Number(activeMatchRules.bestOf || rawActiveMatch?.bestOf || 1);
  const activeMatch = rawActiveMatch
    ? {
        ...rawActiveMatch,
        isLiveTable,
        bestOf: activeMatchBestOf,
        winsRequired: winsRequired(activeMatchBestOf),
        usesGameScore: usesGameScore(activeMatchRules, activeMatchStage),
      }
    : null;
  const swissSource = (state.swissMatchesArchive && state.swissMatchesArchive.length > 0)
    ? state.swissMatchesArchive
    : state.matches.filter(match => typeof match.round === 'number');
  const swissHistory = swissSource.filter(match => match.done && (match.p1 === playerName || match.p2 === playerName)).map(match => ({
    id: match.id,
    round: match.round || null,
    phase: '瑞士轮',
    table: match.table || null,
    opponent: match.p1 === playerName ? match.p2 : match.p1,
    result: match.draw ? 'draw' : match.winner === playerName ? 'win' : 'loss',
    p1: match.p1,
    p2: match.p2,
    winner: match.winner,
    draw: !!match.draw,
    wasLive: !!match.wasLive,
  }));
  const stageHistory = getStageHistorySource(state)
    .filter(match => match.done && (match.p1 === playerName || match.p2 === playerName))
    .map(match => ({
      id: match.id,
      round: match.groupRound || null,
      phase: match.phase || match.groupLabel || match.bracket || match.stagePhase || null,
      table: match.table || null,
      opponent: match.p1 === playerName ? match.p2 : match.p1,
      result: match.draw ? 'draw' : match.winner === playerName ? 'win' : 'loss',
      p1: match.p1,
      p2: match.p2,
      winner: match.winner,
      draw: !!match.draw,
      wasLive: !!match.wasLive,
    }));
  const history = [...swissHistory, ...stageHistory];
  const rec = archived
    ? { wins: archived.wins, draws: archived.draws, losses: archived.losses, points: archived.points }
    : inPool ? getRecord(playerName, state) : emptyRecord();
  const eliminationOverview = (state.phase === 'top8' || state.phase === 'double_elimination')
    ? {
        stages: [
          ...getEliminationPhaseOrderForState(state),
          'winners',
          'losers',
          'grand_final',
        ].map(phase => ({
          phase,
          matches: state.matches
            .filter(match => match.phase === phase || match.bracket === phase)
            .map(match => ({
              id: match.id,
              table: match.table,
              p1: match.p1,
              p2: match.p2,
              winner: match.winner,
              done: !!match.done,
              p1Wins: match.p1Wins || 0,
              p2Wins: match.p2Wins || 0,
            })),
        })).filter(stage => stage.matches.length > 0),
      }
    : null;

  const playerTop8Matches = state.matches.filter(match => match.phase && (match.p1 === playerName || match.p2 === playerName));
  const hasPlayableUnfinishedTop8Match = playerTop8Matches.some(match => !match.done && isMatchReady(match));
  const hasCompletedFinal = playerTop8Matches.some(match => match.done && match.phase === 'Finals');
  const hasCompletedBronze = playerTop8Matches.some(match => match.done && match.phase === 'Bronze Match');
  const lostQuarterFinal = playerTop8Matches.some(match => match.done && match.phase === 'Quarter Finals' && match.winner !== playerName);
  const groupStageResult = Object.values(state.stageResults || {}).find(result =>
    Array.isArray(result.advancers)
    && Array.isArray(result.standings)
    && result.standings.some(entry => entry.player === playerName || entry.displayName === playerName)
  ) || null;
  const advancedFromGroups = !!groupStageResult?.advancers?.includes(playerName);
  let mode = 'waiting';
  if (state.phase === 'setup') mode = inPool ? 'registered' : 'registration';
  else if ((state.phase === 'swiss' || state.phase === 'groups' || state.phase === 'double_elimination') && activeMatch) mode = 'active-match';
  else if (state.phase === 'swiss-ended' && archived) mode = 'swiss-summary';
  else if (state.phase === 'groups' && inPool) mode = 'round-summary';
  else if (state.phase === 'groups-ended') mode = advancedFromGroups ? 'top8-waiting' : 'final-result';
  else if (state.phase === 'top8') {
    if (!state.top8.includes(playerName)) {
      mode = 'final-result';
    } else if (hasPlayableUnfinishedTop8Match) {
      mode = 'active-match';
    } else if (hasCompletedFinal || hasCompletedBronze || lostQuarterFinal) {
      mode = 'final-result';
    } else {
      mode = 'top8-waiting';
    }
  } else if (state.phase === 'double_elimination') {
    const doubleEliminationMatches = state.matches.filter(match => match.stagePhase === 'double_elimination' && (match.p1 === playerName || match.p2 === playerName));
    const stillAlive = doubleEliminationMatches.some(match => !match.done);
    if (activeMatch) mode = 'active-match';
    else if (stillAlive) mode = 'top8-waiting';
    else mode = 'final-result';
  } else if (state.phase === 'double_elimination-ended') {
    mode = 'final-result';
  } else if (state.phase === 'done') mode = 'final-result';
  else if (state.phase === 'swiss' && inPool) mode = 'round-summary';

  const award = (state.phase === 'top8' || state.phase === 'done')
    ? getTop8AwardForPlayer(playerName, state)
    : null;

  const completion = getPlayerCompletionStatus(playerName, state);
  const liveRoomCode = activeMatch && activeMatch.liveRoomCode ? activeMatch.liveRoomCode : null;
  return {
    tournamentId: state._id,
    tournamentName: state.tournamentName,
    playerId: profile ? profile.playerId : null,
    globalProfileId: profile ? profile.globalProfileId || null : null,
    phase: state.phase,
    round: state.round,
    mode,
    playerName,
    inPool,
    record: rec,
    activeMatch,
    history,
    standings: archived,
    top8: state.top8.includes(playerName),
    award,
    reportStatus: (state.playerReports || {})[playerName] || null,
    canExportReport: !!completion.finished,
    completionReason: completion.reason || null,
    isLiveTable,
    liveRoomCode,
    top8Overview: eliminationOverview,
    stageResults: state.stageResults || {},
  };
}

module.exports = { buildPlayerView };
