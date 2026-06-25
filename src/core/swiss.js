const { restoreByeSet } = require('./state');

function hasPlayedEachOther(matches = [], a, b) {
  return matches.some(
    match =>
      typeof match.round === 'number' &&
      ((match.p1 === a && match.p2 === b) || (match.p1 === b && match.p2 === a)),
  );
}

function pairPlayersWithinGroup(players = [], matches = []) {
  const pool = [...players];
  const pairs = [];
  while (pool.length > 1) {
    const a = pool.shift();
    let partnerIndex = pool.findIndex(b => !hasPlayedEachOther(matches, a, b));
    if (partnerIndex === -1) partnerIndex = 0;
    const [b] = pool.splice(partnerIndex, 1);
    pairs.push([a, b]);
  }
  return { pairs, leftover: pool[0] || null };
}

function defaultIsActiveForRound(state, player, roundNumber) {
  if (!player || player === 'BYE') return false;
  const table = state._dropAfterRound || {};
  const value = table[player];
  const dropAfterRound = typeof value === 'number' ? value : null;
  return dropAfterRound === null || dropAfterRound >= roundNumber;
}

function buildRoundPairings(state, standings, options = {}) {
  const isActiveForRound = options.isActiveForRound || ((player, roundNumber) => defaultIsActiveForRound(state, player, roundNumber));
  const activeStandings = standings.filter(entry => !entry.dropped);
  const activePlayers = activeStandings
    .map(entry => entry.player)
    .filter(player => isActiveForRound(player, state.round));
  const byeSet = restoreByeSet(state._byeSet);
  const pairs = [];
  let availablePlayers = [...activePlayers];

  if (availablePlayers.length % 2 !== 0) {
    const byePlayer = [...availablePlayers].reverse().find(player => !byeSet.has(player)) || availablePlayers[availablePlayers.length - 1];
    byeSet.add(byePlayer);
    pairs.push([byePlayer, 'BYE']);
    availablePlayers = availablePlayers.filter(player => player !== byePlayer);
  }

  const pointGroups = new Map();
  for (const entry of activeStandings) {
    if (!availablePlayers.includes(entry.player)) continue;
    if (!pointGroups.has(entry.points)) pointGroups.set(entry.points, []);
    pointGroups.get(entry.points).push(entry.player);
  }

  let carry = null;
  const sortedPointKeys = [...pointGroups.keys()].sort((a, b) => b - a);
  for (const points of sortedPointKeys) {
    let group = [...pointGroups.get(points)];
    if (carry) {
      group = [carry, ...group];
      carry = null;
    }
    const result = pairPlayersWithinGroup(group, state.matches || []);
    pairs.push(...result.pairs);
    carry = result.leftover;
  }

  if (carry) {
    const fallbackPlayers = activePlayers.filter(player => player !== carry && !pairs.some(pair => pair.includes(player)));
    if (fallbackPlayers.length > 0) {
      pairs.push([carry, fallbackPlayers[0]]);
    } else {
      pairs.push([carry, 'BYE']);
      byeSet.add(carry);
    }
  }

  const rankMap = new Map(activeStandings.map((entry, index) => [entry.player, index + 1]));
  pairs.sort((a, b) => {
    const aIsBye = a[1] === 'BYE';
    const bIsBye = b[1] === 'BYE';
    if (aIsBye && !bIsBye) return 1;
    if (!aIsBye && bIsBye) return -1;
    const aBest = Math.min(rankMap.get(a[0]) || 9999, rankMap.get(a[1]) || 9999);
    const bBest = Math.min(rankMap.get(b[0]) || 9999, rankMap.get(b[1]) || 9999);
    if (aBest !== bBest) return aBest - bBest;
    return (rankMap.get(a[0]) || 9999) - (rankMap.get(b[0]) || 9999);
  });

  return { pairs, byeSet };
}

function createRoundMatches(state, standings, options = {}) {
  const stageId = options.stageId || 'stage_swiss_1';
  const { pairs, byeSet } = buildRoundPairings(state, standings, options);
  const matches = pairs.map(([p1, p2], index) => ({
    id: `r${state.round}-m${index + 1}`,
    stageId,
    table: index + 1,
    round: state.round,
    p1,
    p2,
    winner: p2 === 'BYE' ? p1 : null,
    done: p2 === 'BYE',
    draw: false,
    p1Wins: p2 === 'BYE' ? 1 : 0,
    p2Wins: 0,
    liveRoomCode: null,
    wasLive: false,
  }));
  return { matches, byeSet };
}

function replaceRoundMatches(state, matches, byeSet) {
  state._byeSet = byeSet;
  state.matches = (state.matches || []).filter(match => match.round !== state.round);
  state.matches.push(...matches);
  state.playerReports = {};
  return state;
}

function recommendedSwissRoundsForPlayerCount(playerCount) {
  const count = Number(playerCount);
  if (!Number.isInteger(count) || count < 2) return 0;
  if (count <= 2) return 1;
  if (count <= 8) return 3;
  if (count <= 16) return 4;
  if (count <= 32) return 5;
  if (count <= 64) return 6;
  if (count <= 128) return 7;
  if (count <= 226) return 8;
  if (count <= 409) return 9;
  return 10;
}

function startSwiss(state, rounds, standings, options = {}) {
  const isActiveForRound = options.isActiveForRound || ((player, roundNumber) => defaultIsActiveForRound(state, player, roundNumber));
  const activePlayers = (state.players || []).filter(player => isActiveForRound(player, 1));
  if (activePlayers.length < 2) return false;
  const stageId = options.stageId || 'stage_swiss_1';
  state.phase = 'swiss';
  state.round = 1;
  state.swissRounds = recommendedSwissRoundsForPlayerCount(activePlayers.length);
  state.matches = [];
  state.top8 = [];
  state.pendingTop8 = null;
  state.swissRanking = [];
  state.currentLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = 'overview';
  state._byeSet = new Set();
  state.swissRollbackSnapshots = [];
  state.playerReports = {};
  const result = createRoundMatches(state, standings, { ...options, stageId });
  replaceRoundMatches(state, result.matches, result.byeSet);
  return true;
}

function canAdvanceRound(state) {
  if (state.phase !== 'swiss') return { ok: false, err: 'not in swiss phase' };
  const roundMatches = (state.matches || []).filter(match => match.round === state.round);
  if (roundMatches.length === 0 || !roundMatches.every(match => match.done)) {
    return { ok: false, err: 'current round is not complete' };
  }
  return { ok: true };
}

function buildSwissRanking(standings) {
  return standings.map((entry, index) => ({
    rank: index + 1,
    player: entry.player,
    wins: entry.wins,
    draws: entry.draws,
    losses: entry.losses,
    points: entry.points,
    latePenalty: entry.latePenalty,
    omw: entry.omw,
    oow: entry.oow,
    dropped: entry.dropped,
  }));
}

function endSwiss(state, standings) {
  state.swissRanking = buildSwissRanking(standings);
  state.pendingTop8 = standings.filter(entry => !entry.dropped).slice(0, 8).map(entry => entry.player);
  state.swissRankingArchive = state.swissRanking.map(entry => ({ ...entry }));
  state.swissRollbackSnapshots = [];
  state.phase = 'swiss-ended';
  state.currentLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = 'swiss-ended';
  return state;
}

module.exports = {
  hasPlayedEachOther,
  pairPlayersWithinGroup,
  buildRoundPairings,
  createRoundMatches,
  replaceRoundMatches,
  recommendedSwissRoundsForPlayerCount,
  startSwiss,
  canAdvanceRound,
  buildSwissRanking,
  endSwiss,
};
