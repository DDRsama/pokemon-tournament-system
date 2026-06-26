const { restoreByeSet } = require('./state');

const PAIRING_SEARCH_NODE_LIMIT = 800000;

function pairKey(a, b) {
  return [a, b].sort().join('\u0000');
}

function buildPlayedPairSet(matches = [], currentRound = null) {
  const playedPairs = new Set();
  for (const match of matches) {
    if (typeof match.round !== 'number') continue;
    if (currentRound !== null && match.round === currentRound) continue;
    if (!match.p1 || !match.p2 || match.p1 === 'BYE' || match.p2 === 'BYE') continue;
    playedPairs.add(pairKey(match.p1, match.p2));
  }
  return playedPairs;
}

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

function playerRank(standingMap, player) {
  return Number(standingMap.get(player)?.rank) || 9999;
}

function playerPoints(standingMap, player) {
  return Number(standingMap.get(player)?.points) || 0;
}

function compareByStanding(standingMap, a, b) {
  const rankDiff = playerRank(standingMap, a) - playerRank(standingMap, b);
  if (rankDiff !== 0) return rankDiff;
  return String(a).localeCompare(String(b), 'zh-CN');
}

function edgeInfo(a, b, standingMap, playedPairs) {
  const pointDiff = Math.abs(playerPoints(standingMap, a) - playerPoints(standingMap, b));
  const rankDiff = Math.abs(playerRank(standingMap, a) - playerRank(standingMap, b));
  return {
    player: b,
    repeat: playedPairs.has(pairKey(a, b)) ? 1 : 0,
    score: pointDiff * 1000 + rankDiff,
  };
}

function chooseSearchPivot(remaining, standingMap, playedPairs, allowRepeats) {
  let bestIndex = 0;
  let bestScore = null;
  for (let index = 0; index < remaining.length; index++) {
    const player = remaining[index];
    let legalCount = 0;
    let cleanCount = 0;
    for (let otherIndex = 0; otherIndex < remaining.length; otherIndex++) {
      if (otherIndex === index) continue;
      const repeat = playedPairs.has(pairKey(player, remaining[otherIndex]));
      if (!repeat) cleanCount++;
      if (allowRepeats || !repeat) legalCount++;
    }
    const score = [
      legalCount,
      cleanCount,
      playerRank(standingMap, player),
      String(player),
    ];
    if (!bestScore || compareScoreVector(score, bestScore) < 0) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function compareScoreVector(a, b) {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    if (typeof av === 'string' || typeof bv === 'string') {
      const result = String(av).localeCompare(String(bv), 'zh-CN');
      if (result !== 0) return result;
      continue;
    }
    if (av !== bv) return av - bv;
  }
  return 0;
}

function searchPairings(players, standingMap, playedPairs, options = {}) {
  const allowRepeats = !!options.allowRepeats;
  const stopAtFirst = !!options.stopAtFirst;
  const nodeLimit = Number(options.nodeLimit) || PAIRING_SEARCH_NODE_LIMIT;
  let best = null;
  let nodes = 0;
  let hitLimit = false;

  function visit(remaining, pairs, repeatCount, score) {
    nodes++;
    if (nodes > nodeLimit) {
      hitLimit = true;
      return;
    }
    if (best) {
      if (repeatCount > best.repeatCount) return;
      if (!stopAtFirst && repeatCount === best.repeatCount && score >= best.score) return;
    }
    if (remaining.length === 0) {
      best = {
        pairs,
        repeatCount,
        score,
      };
      return;
    }

    const pivotIndex = chooseSearchPivot(remaining, standingMap, playedPairs, allowRepeats);
    const player = remaining[pivotIndex];
    const rest = remaining.filter((_, index) => index !== pivotIndex);
    const candidates = rest
      .map(candidate => edgeInfo(player, candidate, standingMap, playedPairs))
      .filter(candidate => allowRepeats || candidate.repeat === 0)
      .sort((a, b) =>
        a.repeat - b.repeat ||
        a.score - b.score ||
        compareByStanding(standingMap, a.player, b.player),
      );

    for (const candidate of candidates) {
      const nextRepeatCount = repeatCount + candidate.repeat;
      const nextScore = score + candidate.score;
      if (best) {
        if (nextRepeatCount > best.repeatCount) continue;
        if (!stopAtFirst && nextRepeatCount === best.repeatCount && nextScore >= best.score) continue;
      }
      const nextRemaining = rest.filter(playerName => playerName !== candidate.player);
      visit(
        nextRemaining,
        [...pairs, [player, candidate.player]],
        nextRepeatCount,
        nextScore,
      );
      if ((stopAtFirst && best) || hitLimit) return;
    }
  }

  visit([...players].sort((a, b) => compareByStanding(standingMap, a, b)), [], 0, 0);
  return { best, nodes, hitLimit };
}

function greedyPairing(players, standingMap, playedPairs) {
  const pool = [...players].sort((a, b) => compareByStanding(standingMap, a, b));
  const pairs = [];
  let repeatCount = 0;
  let score = 0;

  while (pool.length > 1) {
    const player = pool.shift();
    const candidates = pool
      .map(candidate => edgeInfo(player, candidate, standingMap, playedPairs))
      .sort((a, b) =>
        a.repeat - b.repeat ||
        a.score - b.score ||
        compareByStanding(standingMap, a.player, b.player),
      );
    const partner = candidates[0];
    repeatCount += partner.repeat;
    score += partner.score;
    pairs.push([player, partner.player]);
    pool.splice(pool.indexOf(partner.player), 1);
  }

  return { pairs, repeatCount, score };
}

function findBestPairing(players, standingMap, playedPairs) {
  if (players.length === 0) return { pairs: [], repeatCount: 0, score: 0 };
  if (players.length % 2 !== 0) return null;

  const cleanSearch = searchPairings(players, standingMap, playedPairs, {
    allowRepeats: false,
    stopAtFirst: true,
  });
  if (cleanSearch.best) return cleanSearch.best;

  const fallbackSearch = searchPairings(players, standingMap, playedPairs, {
    allowRepeats: true,
    stopAtFirst: false,
  });
  return fallbackSearch.best || greedyPairing(players, standingMap, playedPairs);
}

function sortPairsForTables(pairs, standingMap) {
  return [...pairs].sort((a, b) => {
    const aIsBye = a[1] === 'BYE';
    const bIsBye = b[1] === 'BYE';
    if (aIsBye && !bIsBye) return 1;
    if (!aIsBye && bIsBye) return -1;
    const aBest = Math.min(playerRank(standingMap, a[0]), playerRank(standingMap, a[1]));
    const bBest = Math.min(playerRank(standingMap, b[0]), playerRank(standingMap, b[1]));
    if (aBest !== bBest) return aBest - bBest;
    return playerRank(standingMap, a[0]) - playerRank(standingMap, b[0]);
  });
}

function byeCandidates(players, standingMap, byeSet) {
  return [...players].sort((a, b) => {
    const aHadBye = byeSet.has(a) ? 1 : 0;
    const bHadBye = byeSet.has(b) ? 1 : 0;
    if (aHadBye !== bHadBye) return aHadBye - bHadBye;
    const rankDiff = playerRank(standingMap, b) - playerRank(standingMap, a);
    if (rankDiff !== 0) return rankDiff;
    return String(a).localeCompare(String(b), 'zh-CN');
  });
}

function byePriority(player, players, standingMap) {
  return Math.max(0, players.length - playerRank(standingMap, player));
}

function buildGlobalPairing(players, standingMap, playedPairs, byeSet) {
  if (players.length % 2 === 0) {
    const result = findBestPairing(players, standingMap, playedPairs);
    return {
      pairs: result ? result.pairs : [],
      byePlayer: null,
      repeatCount: result ? result.repeatCount : 0,
      score: result ? result.score : 0,
    };
  }

  let best = null;
  for (const byePlayer of byeCandidates(players, standingMap, byeSet)) {
    const remaining = players.filter(player => player !== byePlayer);
    const result = findBestPairing(remaining, standingMap, playedPairs);
    if (!result) continue;
    const option = {
      pairs: result.pairs,
      byePlayer,
      repeatCount: result.repeatCount,
      score: result.score,
      scoreVector: [
        result.repeatCount,
        byeSet.has(byePlayer) ? 1 : 0,
        byePriority(byePlayer, players, standingMap),
        result.score,
      ],
    };
    if (!best || compareScoreVector(option.scoreVector, best.scoreVector) < 0) best = option;
    if (best.scoreVector[0] === 0 && best.scoreVector[1] === 0 && best.scoreVector[2] === 0) break;
  }

  if (best) return best;
  const fallbackBye = byeCandidates(players, standingMap, byeSet)[0];
  return {
    pairs: greedyPairing(players.filter(player => player !== fallbackBye), standingMap, playedPairs).pairs,
    byePlayer: fallbackBye,
    repeatCount: 0,
    score: 0,
  };
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
  const activeStandings = standings
    .filter(entry => !entry.dropped)
    .filter(entry => isActiveForRound(entry.player, state.round))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const activePlayers = activeStandings.map(entry => entry.player);
  const standingMap = new Map(activeStandings.map(entry => [entry.player, entry]));
  const byeSet = restoreByeSet(state._byeSet);
  const playedPairs = buildPlayedPairSet(state.matches || [], state.round);
  const result = buildGlobalPairing(activePlayers, standingMap, playedPairs, byeSet);
  const pairs = [...result.pairs];

  if (result.byePlayer) {
    byeSet.add(result.byePlayer);
    pairs.push([result.byePlayer, 'BYE']);
  }

  return {
    pairs: sortPairsForTables(pairs, standingMap),
    byeSet,
    repeatCount: result.repeatCount,
  };
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
