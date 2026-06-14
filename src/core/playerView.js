const { emptyRecord, getRecord } = require('./records');

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
  const rawActiveMatch = state.matches.find(match => !match.done && (match.p1 === playerName || match.p2 === playerName)) || null;
  const isLiveTable = !!(rawActiveMatch && state.currentLiveMatch && state.currentLiveMatch.id === rawActiveMatch.id);
  const activeMatch = rawActiveMatch ? { ...rawActiveMatch, isLiveTable } : null;
  const swissSource = (state.swissMatchesArchive && state.swissMatchesArchive.length > 0)
    ? state.swissMatchesArchive
    : state.matches.filter(match => typeof match.round === 'number');
  const swissHistory = swissSource.filter(match => match.done && (match.p1 === playerName || match.p2 === playerName)).map(match => ({
    id: match.id,
    round: match.round || null,
    phase: null,
    table: match.table || null,
    opponent: match.p1 === playerName ? match.p2 : match.p1,
    result: match.draw ? 'draw' : match.winner === playerName ? 'win' : 'loss',
    p1: match.p1,
    p2: match.p2,
    winner: match.winner,
    draw: !!match.draw,
    wasLive: !!match.wasLive,
  }));
  const top8History = state.matches
    .filter(match => match.phase && match.done && (match.p1 === playerName || match.p2 === playerName))
    .map(match => ({
      id: match.id,
      round: null,
      phase: match.phase || null,
      table: match.table || null,
      opponent: match.p1 === playerName ? match.p2 : match.p1,
      result: match.draw ? 'draw' : match.winner === playerName ? 'win' : 'loss',
      p1: match.p1,
      p2: match.p2,
      winner: match.winner,
      draw: !!match.draw,
      wasLive: !!match.wasLive,
    }));
  const history = [...swissHistory, ...top8History];
  const rec = archived
    ? { wins: archived.wins, draws: archived.draws, losses: archived.losses, points: archived.points }
    : inPool ? getRecord(playerName, state) : emptyRecord();
  const top8Overview = state.phase === 'top8'
    ? {
        stages: ['Quarter Finals', 'Semi Finals', 'Bronze Match', 'Finals'].map(phase => ({
          phase,
          matches: state.matches
            .filter(match => match.phase === phase)
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
  const hasUnfinishedTop8Match = playerTop8Matches.some(match => !match.done);
  const hasCompletedFinal = playerTop8Matches.some(match => match.done && match.phase === 'Finals');
  const hasCompletedBronze = playerTop8Matches.some(match => match.done && match.phase === 'Bronze Match');
  const lostQuarterFinal = playerTop8Matches.some(match => match.done && match.phase === 'Quarter Finals' && match.winner !== playerName);
  let mode = 'waiting';
  if (state.phase === 'setup') mode = inPool ? 'registered' : 'registration';
  else if (state.phase === 'swiss' && activeMatch) mode = 'active-match';
  else if (state.phase === 'swiss-ended' && archived) mode = 'swiss-summary';
  else if (state.phase === 'top8') {
    if (!state.top8.includes(playerName)) {
      mode = 'final-result';
    } else if (hasUnfinishedTop8Match) {
      mode = 'active-match';
    } else if (hasCompletedFinal || hasCompletedBronze || lostQuarterFinal) {
      mode = 'final-result';
    } else {
      mode = 'top8-waiting';
    }
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
    top8Overview,
  };
}

module.exports = { buildPlayerView };
