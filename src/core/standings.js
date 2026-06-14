const { getRecord } = require('./records');

function getCompletedSwissMatches(state = {}) {
  return (state.matches || []).filter(m => typeof m.round === 'number' && m.done);
}

function getSwissOpponents(player, state = {}) {
  return getCompletedSwissMatches(state)
    .filter(m => m.p1 === player || m.p2 === player)
    .map(m => (m.p1 === player ? m.p2 : m.p1))
    .filter(opponent => opponent && opponent !== 'BYE');
}

function getActualCompletedSwissMatchesForPlayer(player, state = {}) {
  return getCompletedSwissMatches(state).filter(
    m =>
      (m.p1 === player || m.p2 === player) &&
      m.p1 !== 'BYE' &&
      m.p2 !== 'BYE' &&
      m.preMatchDroppedPlayer !== player,
  );
}

function getPlayerWinPercentage(player, state = {}) {
  const matches = getActualCompletedSwissMatchesForPlayer(player, state);
  const total = matches.length;
  if (total <= 0) return 0;
  let wins = 0;
  let draws = 0;
  for (const m of matches) {
    if (m.draw) draws++;
    else if (m.winner === player) wins++;
  }
  const raw = (wins + draws * 0.5) / total;
  return Math.max(0.25, raw);
}

function getHeadToHeadSweep(a, b, state = {}) {
  const matches = getCompletedSwissMatches(state).filter(
    m =>
      !m.draw &&
      ((m.p1 === a && m.p2 === b) || (m.p1 === b && m.p2 === a)),
  );
  if (matches.length === 0) return 0;
  const aWins = matches.filter(m => m.winner === a).length;
  const bWins = matches.filter(m => m.winner === b).length;
  if (aWins > 0 && bWins === 0) return 1;
  if (bWins > 0 && aWins === 0) return -1;
  return 0;
}

function buildStandingEntry(player, state = {}, droppedSet = new Set(state._dropped || [])) {
  const rec = getRecord(player, state);
  const opponents = getSwissOpponents(player, state).filter(opponent => opponent !== 'BYE');
  const opponentWinRates = opponents.map(opponent => getPlayerWinPercentage(opponent, state));
  const omw = opponentWinRates.length
    ? opponentWinRates.reduce((sum, value) => sum + value, 0) / opponentWinRates.length
    : 0;
  const oow = opponents.length
    ? opponents
        .map(opponent => getSwissOpponents(opponent, state))
        .map(opponentsOpponents => {
          const rates = opponentsOpponents
            .flat()
            .filter(opponent => opponent && opponent !== 'BYE')
            .map(opponent => getPlayerWinPercentage(opponent, state));
          return rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : 0;
        })
        .reduce((sum, value) => sum + value, 0) / opponents.length
    : 0;

  return {
    player,
    wins: rec.wins,
    draws: rec.draws,
    losses: rec.losses,
    points: rec.points,
    latePenalty: 0,
    omw,
    oow,
    dropped: droppedSet.has(player),
  };
}

function getSortedStandings(state = {}, includeDropped = true, droppedSet = new Set(state._dropped || [])) {
  const players = (state.players || []).filter(player => player !== 'BYE');
  const standings = players.map(player => buildStandingEntry(player, state, droppedSet));
  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.latePenalty !== b.latePenalty) return a.latePenalty - b.latePenalty;
    if (b.omw !== a.omw) return b.omw - a.omw;
    if (b.oow !== a.oow) return b.oow - a.oow;
    const h2h = getHeadToHeadSweep(a.player, b.player, state);
    if (h2h !== 0) return -h2h;
    return a.player.localeCompare(b.player, 'zh-CN');
  });
  if (!includeDropped) return standings.filter(entry => !entry.dropped);
  return standings;
}

module.exports = {
  getCompletedSwissMatches,
  getSwissOpponents,
  getActualCompletedSwissMatchesForPlayer,
  getPlayerWinPercentage,
  getHeadToHeadSweep,
  buildStandingEntry,
  getSortedStandings,
};
