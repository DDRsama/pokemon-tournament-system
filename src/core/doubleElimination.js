const { uniqueEntrants, getEntryListForStage, setStageResult } = require('./advancement');
const { buildSeedOrder, normalizeBracketSize } = require('./top8');

function getDoubleEliminationStage(state = {}) {
  const stages = Array.isArray(state.stages) && state.stages.length > 0
    ? state.stages
    : (state.tournamentSettings && Array.isArray(state.tournamentSettings.stages) ? state.tournamentSettings.stages : []);
  if (state.activeStageId) {
    const explicit = stages.find(stage => stage.id === state.activeStageId);
    if (explicit && explicit.type === 'double_elimination') return explicit;
  }
  return stages.find(stage => stage.type === 'double_elimination') || null;
}

function createDoubleMatch({ stageId, bracket, round, table, p1 = null, p2 = null, finalReset = false }) {
  const bracketKey = bracket === 'winners' ? 'wb' : bracket === 'losers' ? 'lb' : finalReset ? 'gfr' : 'gf';
  return {
    id: `${stageId}-${bracketKey}-r${round}-m${table}`,
    stageId,
    stagePhase: 'double_elimination',
    doubleEliminationRound: round,
    bracket,
    table,
    p1,
    p2,
    winner: null,
    done: false,
    draw: false,
    p1Wins: 0,
    p2Wins: 0,
    liveRoomCode: null,
    wasLive: false,
    finalReset,
  };
}

function getDoubleMatches(state = {}, stageId) {
  return (state.matches || []).filter(match => match.stageId === stageId && match.stagePhase === 'double_elimination');
}

function createInitialWinnersBracket(entrants = [], stage = {}) {
  const stageId = stage.id || 'stage_double_elimination_1';
  const size = normalizeBracketSize(stage.doubleElimination?.bracketSize || entrants.length || 8, 8);
  const order = buildSeedOrder(size);
  const seededEntrants = uniqueEntrants(entrants);
  while (seededEntrants.length < size) seededEntrants.push('BYE');
  const matches = [];
  for (let i = 0; i < order.length; i += 2) {
    const p1 = seededEntrants[order[i] - 1] || 'BYE';
    const p2 = seededEntrants[order[i + 1] - 1] || 'BYE';
    matches.push(createDoubleMatch({
      stageId,
      bracket: 'winners',
      round: 1,
      table: matches.length + 1,
      p1,
      p2,
    }));
  }
  return matches;
}

function enterDoubleElimination(state = {}, stage = null) {
  const normalizedStage = stage || getDoubleEliminationStage(state);
  if (!normalizedStage) return false;
  const entrants = getEntryListForStage(state, normalizedStage);
  if (entrants.length < 2) return false;
  state.phase = 'double_elimination';
  state.activeStageId = normalizedStage.id;
  state.currentLiveMatch = null;
  state.pendingLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = 'overview';
  state.doubleElimination = {
    ...(state.doubleElimination || {}),
    [normalizedStage.id]: {
      eliminated: [],
      champion: null,
      resetUsed: false,
    },
  };
  state.matches = (state.matches || []).filter(match => match.stageId !== normalizedStage.id);
  state.matches.push(...createInitialWinnersBracket(entrants, normalizedStage));
  autoResolveByes(state, normalizedStage);
  return true;
}

function loserOf(match) {
  if (!match || !match.done || !match.winner) return null;
  if (match.winner === match.p1) return match.p2;
  if (match.winner === match.p2) return match.p1;
  return null;
}

function getBracketRoundMatches(matches = [], bracket, round) {
  return matches
    .filter(match => match.bracket === bracket && Number(match.doubleEliminationRound) === round)
    .sort((a, b) => (a.table || 0) - (b.table || 0));
}

function roundComplete(matches = []) {
  return matches.length > 0 && matches.every(match => match.done && match.winner);
}

function hasRound(matches = [], bracket, round) {
  return matches.some(match => match.bracket === bracket && Number(match.doubleEliminationRound) === round);
}

function pushUnique(target = [], values = []) {
  for (const value of values) {
    if (!value || value === 'BYE') continue;
    if (!target.includes(value)) target.push(value);
  }
  return target;
}

function sameEntrantsInOrder(left = [], right = []) {
  const a = uniqueEntrants(left);
  const b = uniqueEntrants(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function pairKey(values = []) {
  return uniqueEntrants(values).sort().join('\u0000');
}

function roundPairKeysFromEntrants(entrants = []) {
  const names = uniqueEntrants(entrants);
  const pairs = [];
  for (let index = 0; index < names.length; index += 2) {
    pairs.push(pairKey([names[index], names[index + 1]]));
  }
  return pairs.sort();
}

function roundPairKeysFromMatches(matches = []) {
  return matches.map(match => pairKey([match.p1, match.p2])).sort();
}

function sameRoundPairings(matches = [], entrants = []) {
  const existing = roundPairKeysFromMatches(matches);
  const expected = roundPairKeysFromEntrants(entrants);
  return existing.length === expected.length && existing.every((value, index) => value === expected[index]);
}

function createNextRoundFromEntrants(stageId, bracket, round, entrants = []) {
  const names = uniqueEntrants(entrants);
  const matches = [];
  for (let i = 0; i < names.length; i += 2) {
    const p1 = names[i] || null;
    const p2 = names[i + 1] || 'BYE';
    matches.push(createDoubleMatch({
      stageId,
      bracket,
      round,
      table: matches.length + 1,
      p1,
      p2,
    }));
  }
  return matches;
}

function getDoubleEliminationRoundCounts(stage = {}, entrants = []) {
  const configuredSize = stage.doubleElimination?.bracketSize || entrants.length || 8;
  const bracketSize = normalizeBracketSize(configuredSize, 8);
  const winnersFinalRound = Math.max(1, Math.log2(bracketSize));
  return {
    bracketSize,
    winnersFinalRound,
    losersFinalRound: Math.max(1, (winnersFinalRound - 1) * 2),
  };
}

function interleaveLosersRoundEntrants(survivors = [], droppedFromWinners = []) {
  const dropped = droppedFromWinners.slice().reverse();
  const entrants = [];
  const length = Math.max(survivors.length, dropped.length);
  for (let index = 0; index < length; index += 1) {
    if (survivors[index]) entrants.push(survivors[index]);
    if (dropped[index]) entrants.push(dropped[index]);
  }
  return entrants;
}

function autoResolveByes(state = {}, stage = null) {
  const stageId = stage?.id || getDoubleEliminationStage(state)?.id;
  if (!stageId) return false;
  let changed = false;
  for (const match of getDoubleMatches(state, stageId)) {
    if (match.done) continue;
    if (match.p1 === 'BYE' && match.p2 && match.p2 !== 'BYE') {
      match.winner = match.p2;
      match.done = true;
      match.p1Wins = 0;
      match.p2Wins = 1;
      changed = true;
    } else if (match.p2 === 'BYE' && match.p1 && match.p1 !== 'BYE') {
      match.winner = match.p1;
      match.done = true;
      match.p1Wins = 1;
      match.p2Wins = 0;
      changed = true;
    }
  }
  return changed;
}

function buildDoubleEliminationStandings(state = {}, stage = null) {
  const normalizedStage = stage || getDoubleEliminationStage(state);
  if (!normalizedStage) return [];
  const meta = state.doubleElimination?.[normalizedStage.id] || {};
  const entrants = getEntryListForStage(state, normalizedStage);
  const eliminated = Array.isArray(meta.eliminated) ? meta.eliminated : [];
  const champion = meta.champion || null;
  const standings = [];
  if (champion) standings.push({ rank: 1, player: champion });
  const runnerUp = getDoubleMatches(state, normalizedStage.id)
    .filter(match => match.bracket === 'grand_final' && match.done)
    .map(loserOf)
    .filter(Boolean)
    .pop();
  if (runnerUp && runnerUp !== champion) standings.push({ rank: 2, player: runnerUp });
  eliminated.slice().reverse().forEach((player, index) => {
    if (!standings.some(entry => entry.player === player)) standings.push({ rank: standings.length + 1, player, eliminatedOrder: eliminated.length - index });
  });
  for (const entrant of entrants) {
    if (!standings.some(entry => entry.player === entrant)) standings.push({ rank: standings.length + 1, player: entrant });
  }
  return standings;
}

function completeDoubleElimination(state = {}, stage = null) {
  const normalizedStage = stage || getDoubleEliminationStage(state);
  if (!normalizedStage) return { ok: false, err: 'stage not found' };
  const meta = state.doubleElimination?.[normalizedStage.id] || {};
  if (!meta.champion) return { ok: false, err: 'stage is not complete' };
  const standings = buildDoubleEliminationStandings(state, normalizedStage);
  const result = setStageResult(state, normalizedStage.id, {
    standings,
    advancers: standings.slice(0, 1).map(entry => entry.player),
    metadata: {
      champion: meta.champion,
      eliminated: meta.eliminated || [],
    },
  });
  state.phase = 'double_elimination-ended';
  state.currentLiveMatch = null;
  state.pendingLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = 'overview';
  return { ok: true, result, standings };
}

function advanceDoubleElimination(state = {}, stage = null) {
  const normalizedStage = stage || getDoubleEliminationStage(state);
  if (!normalizedStage) return false;
  const stageId = normalizedStage.id;
  const entrants = getEntryListForStage(state, normalizedStage);
  const { bracketSize, winnersFinalRound, losersFinalRound } = getDoubleEliminationRoundCounts(normalizedStage, entrants);
  if (!state.doubleElimination) state.doubleElimination = {};
  if (!state.doubleElimination[stageId]) state.doubleElimination[stageId] = { eliminated: [], champion: null, resetUsed: false };
  const meta = state.doubleElimination[stageId];
  if (meta.champion) return false;

  autoResolveByes(state, normalizedStage);
  let changed = false;

  const getMatches = () => getDoubleMatches(state, stageId);
  const getRoundNumbers = bracket => [...new Set(getMatches()
    .filter(match => match.bracket === bracket)
    .map(match => Number(match.doubleEliminationRound) || 1))]
    .sort((a, b) => a - b);
  const createRound = (bracket, round, entrants) => {
    if (hasRound(getMatches(), bracket, round)) return false;
    const nextMatches = createNextRoundFromEntrants(stageId, bracket, round, entrants);
    if (nextMatches.length === 0) return false;
    state.matches.push(...nextMatches);
    return true;
  };

  const winnerRounds = getRoundNumbers('winners');
  for (const round of winnerRounds) {
    const roundMatches = getBracketRoundMatches(getMatches(), 'winners', round);
    if (!roundComplete(roundMatches)) continue;
    const winners = roundMatches.map(match => match.winner).filter(Boolean);

    if (round < winnersFinalRound && winners.length > 1 && createRound('winners', round + 1, winners)) changed = true;
  }

  const entrantSourceComplete = (bracket, round) => roundComplete(getBracketRoundMatches(getMatches(), bracket, round));
  const winnersOf = (bracket, round) => getBracketRoundMatches(getMatches(), bracket, round).map(match => match.winner).filter(Boolean);
  const losersOf = (bracket, round) => getBracketRoundMatches(getMatches(), bracket, round).map(loserOf).filter(player => player && player !== 'BYE');
  const expectedLosersRoundEntrants = round => {
    if (round === 1) {
      if (!entrantSourceComplete('winners', 1)) return null;
      return losersOf('winners', 1);
    }
    if (round % 2 === 0) {
      const previousLoserRound = round - 1;
      const sourceWinnerRound = (round / 2) + 1;
      if (!entrantSourceComplete('losers', previousLoserRound) || !entrantSourceComplete('winners', sourceWinnerRound)) return null;
      return interleaveLosersRoundEntrants(
        winnersOf('losers', previousLoserRound),
        losersOf('winners', sourceWinnerRound),
      );
    }
    const previousLoserRound = round - 1;
    if (!entrantSourceComplete('losers', previousLoserRound)) return null;
    return winnersOf('losers', previousLoserRound);
  };
  const pruneGeneratedLosersRoundsFrom = round => {
    state.matches = (state.matches || []).filter(match => {
      if (match.stageId !== stageId || match.stagePhase !== 'double_elimination') return true;
      if (match.bracket === 'grand_final') return false;
      if (match.bracket !== 'losers') return true;
      return Number(match.doubleEliminationRound) < round;
    });
  };
  const tryCreateLosersRound = round => {
    if (hasRound(getMatches(), 'losers', round)) return false;
    const entrants = uniqueEntrants(expectedLosersRoundEntrants(round) || []);
    if (entrants.length < 2) return false;
    return createRound('losers', round, entrants);
  };

  const maxLoserRoundToCreate = bracketSize <= 2
    ? 0
    : Math.min(losersFinalRound, Math.max(1, ((getRoundNumbers('winners').at(-1) || 1) - 1) * 2));
  for (let round = 1; round <= maxLoserRoundToCreate; round += 1) {
    const existingRound = getBracketRoundMatches(getMatches(), 'losers', round);
    if (existingRound.length === 0) continue;
    const expectedEntrants = expectedLosersRoundEntrants(round);
    if (!expectedEntrants || expectedEntrants.length < 2) continue;
    if (!sameRoundPairings(existingRound, expectedEntrants)) {
      pruneGeneratedLosersRoundsFrom(round);
      changed = true;
      break;
    }
  }
  for (let round = 1; round <= maxLoserRoundToCreate; round += 1) {
    if (tryCreateLosersRound(round)) changed = true;
  }

  const loserRounds = getRoundNumbers('losers');
  const rebuiltEliminated = [];
  for (const round of loserRounds) {
    const roundMatches = getBracketRoundMatches(getMatches(), 'losers', round);
    if (!roundComplete(roundMatches)) continue;
    const losers = roundMatches.map(loserOf).filter(player => player && player !== 'BYE');
    pushUnique(rebuiltEliminated, losers);
  }
  if (!sameEntrantsInOrder(meta.eliminated, rebuiltEliminated)) {
    meta.eliminated = rebuiltEliminated;
    changed = true;
  }

  const completeFinalRoundMatch = (bracket, round) => {
    const roundMatches = getBracketRoundMatches(getMatches(), bracket, round);
    if (!roundComplete(roundMatches) || roundMatches.length !== 1) return null;
    return roundMatches[0];
  };
  const allBracketMatchesCompleteThrough = (bracket, finalRound) => getMatches()
    .filter(match => match.bracket === bracket)
    .filter(match => Number(match.doubleEliminationRound) <= finalRound)
    .every(match => match.done && match.winner);
  const winnersFinal = completeFinalRoundMatch('winners', winnersFinalRound);
  const losersFinal = bracketSize <= 2
    ? getBracketRoundMatches(getMatches(), 'winners', winnersFinalRound)[0]
    : completeFinalRoundMatch('losers', losersFinalRound);
  const expectedGrandFinal = winnersFinal && losersFinal
    ? {
      p1: winnersFinal.winner,
      p2: bracketSize <= 2 ? loserOf(losersFinal) : losersFinal.winner,
    }
    : null;
  const invalidPendingFinalIds = getDoubleMatches(state, stageId)
    .filter(match => match.bracket === 'grand_final' && !match.done && (
      !expectedGrandFinal ||
      (!match.finalReset && (match.p1 !== expectedGrandFinal.p1 || match.p2 !== expectedGrandFinal.p2))
    ))
    .map(match => match.id);
  if (invalidPendingFinalIds.length > 0) {
    state.matches = (state.matches || []).filter(match => !invalidPendingFinalIds.includes(match.id));
    changed = true;
  }
  const current = getDoubleMatches(state, stageId);
  if (
    expectedGrandFinal &&
    allBracketMatchesCompleteThrough('winners', winnersFinalRound) &&
    (bracketSize <= 2 || allBracketMatchesCompleteThrough('losers', losersFinalRound)) &&
    !current.some(match => match.bracket === 'grand_final')
  ) {
    state.matches.push(createDoubleMatch({
      stageId,
      bracket: 'grand_final',
      round: 1,
      table: 1,
      p1: expectedGrandFinal.p1,
      p2: expectedGrandFinal.p2,
    }));
    changed = true;
  }

  const grandFinal = getDoubleMatches(state, stageId).find(match => match.bracket === 'grand_final' && !match.finalReset);
  if (grandFinal && grandFinal.done) {
    const winnersBracketChampion = grandFinal.p1;
    const resetEnabled = normalizedStage.doubleElimination?.grandFinalReset !== false;
    if (grandFinal.winner === winnersBracketChampion || !resetEnabled) {
      meta.champion = grandFinal.winner;
      changed = true;
    } else if (!meta.resetUsed && !getDoubleMatches(state, stageId).some(match => match.finalReset)) {
      meta.resetUsed = true;
      state.matches.push(createDoubleMatch({
        stageId,
        bracket: 'grand_final',
        round: 2,
        table: 1,
        p1: grandFinal.p1,
        p2: grandFinal.p2,
        finalReset: true,
      }));
      changed = true;
    }
  }

  const resetFinal = getDoubleMatches(state, stageId).find(match => match.bracket === 'grand_final' && match.finalReset);
  if (resetFinal && resetFinal.done && !meta.champion) {
    meta.champion = resetFinal.winner;
    changed = true;
  }

  return changed;
}

function isDoubleEliminationStageFinished(state = {}, stage = null) {
  const normalizedStage = stage || getDoubleEliminationStage(state);
  if (!normalizedStage) return false;
  return !!state.doubleElimination?.[normalizedStage.id]?.champion;
}

module.exports = {
  getDoubleEliminationStage,
  createDoubleMatch,
  createInitialWinnersBracket,
  getDoubleEliminationRoundCounts,
  interleaveLosersRoundEntrants,
  enterDoubleElimination,
  autoResolveByes,
  getDoubleMatches,
  advanceDoubleElimination,
  buildDoubleEliminationStandings,
  completeDoubleElimination,
  isDoubleEliminationStageFinished,
};
