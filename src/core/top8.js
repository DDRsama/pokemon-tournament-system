const { getEntryListForStage } = require('./advancement');
const { isMatchReady } = require('./matches');

function createTop8QuarterFinals(top8, stageId = 'stage_top_cut_1') {
  return [
    { id: 'qf1', stageId, table: 1, p1: top8[0], p2: top8[7], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    { id: 'qf2', stageId, table: 2, p1: top8[3], p2: top8[4], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    { id: 'qf3', stageId, table: 3, p1: top8[1], p2: top8[6], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    { id: 'qf4', stageId, table: 4, p1: top8[2], p2: top8[5], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
  ];
}

function isPowerOfTwo(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 2 && 2 ** Math.round(Math.log2(number)) === number;
}

function normalizeBracketSize(value, fallback = 8) {
  const number = Number(value);
  return isPowerOfTwo(number) ? number : fallback;
}

function buildSeedOrder(size) {
  const bracketSize = normalizeBracketSize(size, 8);
  if (bracketSize === 2) return [1, 2];
  const prev = buildSeedOrder(bracketSize / 2);
  const order = [];
  for (const seed of prev) {
    order.push(seed, bracketSize + 1 - seed);
  }
  return order;
}

function getEliminationRoundLabel(roundNumber, totalRounds) {
  const participants = 2 ** (totalRounds - roundNumber + 1);
  if (participants === 2) return 'Finals';
  if (participants === 4) return 'Semi Finals';
  if (participants === 8) return 'Quarter Finals';
  if (participants === 16) return 'Round of 16';
  if (participants === 32) return 'Round of 32';
  return `Round of ${participants}`;
}

function getEliminationPhaseOrder(bracketSize = 8, options = {}) {
  const size = normalizeBracketSize(bracketSize, 8);
  const totalRounds = Math.max(1, Math.log2(size));
  const phases = [];
  for (let round = 1; round <= totalRounds; round += 1) {
    phases.push(getEliminationRoundLabel(round, totalRounds));
  }
  if (options.bronzeMatch !== false && size >= 4) {
    const finalIndex = phases.indexOf('Finals');
    const insertIndex = finalIndex >= 0 ? finalIndex : phases.length;
    phases.splice(insertIndex, 0, 'Bronze Match');
  }
  return phases;
}

function getEliminationPhaseOrderForState(state = {}, stage = null) {
  const normalizedStage = stage || getSingleEliminationStage(state);
  const currentCutSize = normalizeBracketSize(Array.isArray(state.top8) ? state.top8.length : null, null);
  const pendingCutSize = normalizeBracketSize(Array.isArray(state.pendingTop8) ? state.pendingTop8.length : null, null);
  const bracketSize = currentCutSize
    || pendingCutSize
    || normalizeBracketSize(normalizedStage?.elimination?.bracketSize || state.players?.length || 8, 8);
  return getEliminationPhaseOrder(bracketSize, {
    bronzeMatch: normalizedStage?.elimination?.bronzeMatch,
  });
}

function getSingleEliminationStage(state = {}) {
  const stages = Array.isArray(state.stages) && state.stages.length > 0
    ? state.stages
    : (state.tournamentSettings && Array.isArray(state.tournamentSettings.stages) ? state.tournamentSettings.stages : []);
  if (state.activeStageId) {
    const explicit = stages.find(stage => stage.id === state.activeStageId);
    if (explicit && explicit.type === 'single_elimination') return explicit;
  }
  return stages.find(stage => stage.type === 'single_elimination') || null;
}

function getSingleEliminationEntrants(state = {}, stage = null, bracketSize = 8) {
  const size = normalizeBracketSize(bracketSize, 8);
  if (stage) {
    const stageEntrants = getEntryListForStage(state, stage);
    if (stageEntrants.length > 0) return stageEntrants.slice(0, size);
  }
  const pending = Array.isArray(state.pendingTop8) ? state.pendingTop8 : [];
  const standings = Array.isArray(state.swissRankingArchive) && state.swissRankingArchive.length > 0
    ? state.swissRankingArchive.map(entry => entry.player).filter(Boolean)
    : Array.isArray(state.swissRanking) && state.swissRanking.length > 0
      ? state.swissRanking.map(entry => entry.player).filter(Boolean)
      : [];
  const players = pending.length > 0 ? pending : (standings.length > 0 ? standings : (state.players || []));
  return players.slice(0, size);
}

function createSingleEliminationBracket(entrants = [], stage = null, options = {}) {
  const bracketSize = normalizeBracketSize(options.bracketSize || stage?.elimination?.bracketSize || entrants.length || 8, 8);
  const stageId = stage?.id || options.stageId || 'stage_single_elimination_1';
  const bronzeMatch = options.bronzeMatch ?? stage?.elimination?.bronzeMatch ?? true;
  const order = buildSeedOrder(bracketSize);
  const totalRounds = Math.max(1, Math.log2(bracketSize));
  const seededEntrants = [...entrants];
  while (seededEntrants.length < bracketSize) seededEntrants.push('BYE');

  const matches = [];
  for (let i = 0; i < order.length; i += 2) {
    const p1 = seededEntrants[order[i] - 1] || 'BYE';
    const p2 = seededEntrants[order[i + 1] - 1] || 'BYE';
    matches.push({
      id: `${stageId}-r1-m${matches.length + 1}`,
      stageId,
      table: matches.length + 1,
      bracketRound: 1,
      phase: getEliminationRoundLabel(1, totalRounds),
      p1,
      p2,
      winner: p1 === 'BYE' ? p2 : p2 === 'BYE' ? p1 : null,
      done: p1 === 'BYE' || p2 === 'BYE',
      draw: false,
      p1Wins: p2 === 'BYE' ? 1 : 0,
      p2Wins: p1 === 'BYE' ? 1 : 0,
      liveRoomCode: null,
      wasLive: false,
      bronzeMatch,
    });
  }
  return matches;
}

function expectedFirstRoundPhaseForStage(stage = null, bracketSize = 8) {
  const size = normalizeBracketSize(stage?.elimination?.bracketSize || bracketSize, 8);
  const totalRounds = Math.max(1, Math.log2(size));
  return getEliminationRoundLabel(1, totalRounds);
}

function isSingleEliminationBracketShapeValid(state = {}, stage = null) {
  const normalizedStage = stage || getSingleEliminationStage(state);
  if (!normalizedStage) return true;
  const bracketSize = normalizeBracketSize(normalizedStage.elimination?.bracketSize || state.top8?.length || state.players?.length || 8, 8);
  const stageMatches = (state.matches || []).filter(match => match.stageId === normalizedStage.id);
  if (stageMatches.length === 0) return true;
  const firstRound = stageMatches.filter(match => Number(match.bracketRound || 1) === 1);
  if (firstRound.length === 0) return false;
  const expectedCount = bracketSize / 2;
  const expectedPhase = expectedFirstRoundPhaseForStage(normalizedStage, bracketSize);
  return firstRound.length === expectedCount && firstRound.every(match => match.phase === expectedPhase);
}

function repairSingleEliminationBracketShape(state = {}, stage = null) {
  const normalizedStage = stage || getSingleEliminationStage(state);
  if (!normalizedStage || state.phase !== 'top8') return false;
  if (isSingleEliminationBracketShapeValid(state, normalizedStage)) return false;
  const bracketSize = normalizeBracketSize(normalizedStage.elimination?.bracketSize || state.top8?.length || state.players?.length || 8, 8);
  const entrants = getSingleEliminationEntrants(state, normalizedStage, bracketSize);
  if (entrants.length < 2) return false;
  const stageId = normalizedStage.id;
  const replacement = bracketSize === 8 && stageId === 'stage_top_cut_1'
    ? createTop8QuarterFinals(entrants, stageId)
    : createSingleEliminationBracket(entrants, normalizedStage, { bracketSize, stageId });
  state.top8 = entrants.slice();
  state.matches = (state.matches || []).filter(match => match.stageId !== stageId && !(stageId === 'stage_top_cut_1' && !match.stageId && match.phase));
  state.matches.push(...replacement);
  state.currentLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = bracketSize === 8 ? 'top8-bracket' : 'overview';
  return true;
}

function enterSingleElimination(state, stage = null) {
  const normalizedStage = stage || getSingleEliminationStage(state);
  if (!normalizedStage) return false;
  const bracketSize = normalizeBracketSize(normalizedStage.elimination?.bracketSize || state.pendingTop8?.length || state.top8?.length || state.players?.length || 8, 8);
  const entrants = getSingleEliminationEntrants(state, normalizedStage, bracketSize);
  if (entrants.length < 2) return false;
  state.top8 = entrants.slice();
  state.pendingTop8 = null;
  state.swissRanking = [];
  state.phase = 'top8';
  state.currentLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = bracketSize === 8 ? 'top8-bracket' : 'overview';
  state.matches = bracketSize === 8 && normalizedStage.id === 'stage_top_cut_1'
    ? createTop8QuarterFinals(entrants, normalizedStage.id)
    : createSingleEliminationBracket(entrants, normalizedStage, { bracketSize, stageId: normalizedStage.id });
  return true;
}

function advanceSingleEliminationBracket(state = {}) {
  const stage = getSingleEliminationStage(state);
  if (!stage) return false;
  const stageId = stage.id;
  const bracketSize = normalizeBracketSize(stage.elimination?.bracketSize || state.top8?.length || state.players?.length || 8, 8);
  const totalRounds = Math.max(1, Math.log2(bracketSize));
  const stageMatches = (state.matches || []).filter(match => match.stageId === stageId);
  if (stageMatches.length === 0) return false;

  const currentRound = Math.max(...stageMatches.map(match => Number(match.bracketRound) || 1));
  const currentRoundMatches = stageMatches
    .filter(match => (Number(match.bracketRound) || 1) === currentRound)
    .sort((a, b) => (a.table || 0) - (b.table || 0));
  if (currentRoundMatches.length === 0 || !currentRoundMatches.every(match => match.done && match.winner)) return false;
  if (currentRound >= totalRounds) return false;

  const nextRound = currentRound + 1;
  const bronzeMatchEnabled = stage.elimination?.bronzeMatch !== false;
  const nextMatches = [];

  if (nextRound < totalRounds) {
    for (let i = 0; i < currentRoundMatches.length; i += 2) {
      const left = currentRoundMatches[i];
      const right = currentRoundMatches[i + 1];
      if (!left || !right) break;
      nextMatches.push({
        id: `${stageId}-r${nextRound}-m${nextMatches.length + 1}`,
        stageId,
        table: nextMatches.length + 1,
        bracketRound: nextRound,
        phase: getEliminationRoundLabel(nextRound, totalRounds),
        p1: left.winner,
        p2: right.winner,
        winner: null,
        done: false,
        draw: false,
        p1Wins: 0,
        p2Wins: 0,
        liveRoomCode: null,
        wasLive: false,
        bronzeMatch: bronzeMatchEnabled,
      });
    }
  } else {
    const winners = currentRoundMatches.map(match => match.winner);
    const losers = currentRoundMatches.map(match => loserOf(match));
    nextMatches.push({
      id: `${stageId}-final`,
      stageId,
      table: 1,
      bracketRound: nextRound,
      phase: 'Finals',
      p1: winners[0] || null,
      p2: winners[1] || null,
      winner: null,
      done: false,
      draw: false,
      p1Wins: 0,
      p2Wins: 0,
      liveRoomCode: null,
      wasLive: false,
      bronzeMatch: bronzeMatchEnabled,
    });
    if (bronzeMatchEnabled && losers[0] && losers[1]) {
      nextMatches.push({
        id: `${stageId}-bronze`,
        stageId,
        table: 2,
        bracketRound: nextRound,
        phase: 'Bronze Match',
        p1: losers[0],
        p2: losers[1],
        winner: null,
        done: false,
        draw: false,
        p1Wins: 0,
        p2Wins: 0,
        liveRoomCode: null,
        wasLive: false,
        bronzeMatch: bronzeMatchEnabled,
      });
    }
  }

  state.matches = (state.matches || []).filter(match => !(match.stageId === stageId && Number(match.bracketRound) === nextRound));
  state.matches.push(...nextMatches);
  return nextMatches.length > 0;
}

function enterTop8(state) {
  if (!state.pendingTop8 || state.pendingTop8.length < 8) return false;
  const top8 = state.pendingTop8;
  const stageId = getSingleEliminationStage(state)?.id
    || (state.stages || []).find(stage => stage.type === 'single_elimination')?.id
    || 'stage_top_cut_1';
  state.top8 = top8;
  state.pendingTop8 = null;
  state.swissRanking = [];
  state.phase = 'top8';
  state.currentLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = 'top8-bracket';
  state.matches = createTop8QuarterFinals(top8, stageId);
  return true;
}

function cancelTop8Confirm(state) {
  state.phase = 'swiss';
  state.pendingTop8 = null;
  state.swissRanking = [];
  state.currentLiveMatch = null;
  state.lastResult = null;
  state.overlayState = 'overview';
  return state;
}

function normalizeBo3ScoreValue(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 2) return null;
  return number;
}

function validateBo3Score(p1Wins, p2Wins) {
  const p1 = normalizeBo3ScoreValue(p1Wins);
  const p2 = normalizeBo3ScoreValue(p2Wins);
  if (p1 === null || p2 === null) return null;
  if (p1 === 2 && p2 === 2) return null;
  return { p1Wins: p1, p2Wins: p2 };
}

function applyBo3ScoreToMatch(match, p1Wins, p2Wins) {
  if (!isMatchReady(match)) return false;
  const score = validateBo3Score(p1Wins, p2Wins);
  if (!score) return false;
  match.p1Wins = score.p1Wins;
  match.p2Wins = score.p2Wins;
  match.done = false;
  match.winner = null;
  if (score.p1Wins >= 2) {
    match.winner = match.p1;
    match.done = true;
  } else if (score.p2Wins >= 2) {
    match.winner = match.p2;
    match.done = true;
  }
  return true;
}

function applyResultToMatch(match, winnerId) {
  if (!isMatchReady(match) || (winnerId !== match.p1 && winnerId !== match.p2)) return false;
  match.winner = winnerId;
  match.done = true;
  match.draw = false;
  match.p1Wins = winnerId === match.p1 ? 1 : 0;
  match.p2Wins = winnerId === match.p2 ? 1 : 0;
  return true;
}

function ensureMatch(matches, id, phase, table, bracketRound, stageId = null) {
  let match = matches.find(item => item.id === id);
  let changed = false;
  if (!match) {
    match = { id, stageId, table, p1: null, p2: null, winner: null, done: false, phase, bracketRound, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false };
    matches.push(match);
    changed = true;
  }
  return { match, changed };
}

function clearMatchResult(match) {
  if (!match) return false;
  const hadResult = !!match.done
    || !!match.winner
    || !!match.draw
    || (match.p1Wins || 0) !== 0
    || (match.p2Wins || 0) !== 0
    || !!match.result;
  if (!hadResult) return false;
  match.winner = null;
  match.done = false;
  match.draw = false;
  match.p1Wins = 0;
  match.p2Wins = 0;
  delete match.result;
  return true;
}

function syncSlot(match, slot, player) {
  if (!match) return false;
  const nextPlayer = player || null;
  if (!nextPlayer) return false;
  if (match[slot] === nextPlayer) return false;
  clearMatchResult(match);
  match[slot] = nextPlayer;
  return true;
}

function loserOf(match) {
  if (!match || !match.done || !match.winner) return null;
  if (match.winner === match.p1) return match.p2;
  if (match.winner === match.p2) return match.p1;
  return null;
}

function advanceBracket(state) {
  if (state.phase !== 'top8') return false;
  const matches = state.matches || [];
  const stageId = getSingleEliminationStage(state)?.id || 'stage_top_cut_1';
  let changed = false;

  const runSyncPass = () => {
    let passChanged = false;
    const qf1 = matches.find(match => match.id === 'qf1');
    const qf2 = matches.find(match => match.id === 'qf2');
    const qf3 = matches.find(match => match.id === 'qf3');
    const qf4 = matches.find(match => match.id === 'qf4');
    if ([qf1, qf2].some(match => match && match.done && match.winner)) {
      const result = ensureMatch(matches, 'sf1', 'Semi Finals', 1, 2, stageId);
      passChanged = result.changed || passChanged;
      passChanged = syncSlot(result.match, 'p1', qf1 && qf1.done ? qf1.winner : null) || passChanged;
      passChanged = syncSlot(result.match, 'p2', qf2 && qf2.done ? qf2.winner : null) || passChanged;
    }
    if ([qf3, qf4].some(match => match && match.done && match.winner)) {
      const result = ensureMatch(matches, 'sf2', 'Semi Finals', 2, 2, stageId);
      passChanged = result.changed || passChanged;
      passChanged = syncSlot(result.match, 'p1', qf3 && qf3.done ? qf3.winner : null) || passChanged;
      passChanged = syncSlot(result.match, 'p2', qf4 && qf4.done ? qf4.winner : null) || passChanged;
    }

    const sf1 = matches.find(match => match.id === 'sf1');
    const sf2 = matches.find(match => match.id === 'sf2');
    if ([sf1, sf2].some(match => match && match.done && match.winner)) {
      const final = ensureMatch(matches, 'final', 'Finals', 1, 3, stageId);
      const bronze = ensureMatch(matches, 'bronze', 'Bronze Match', 2, 3, stageId);
      passChanged = final.changed || bronze.changed || passChanged;
      passChanged = syncSlot(final.match, 'p1', sf1 && sf1.done ? sf1.winner : null) || passChanged;
      passChanged = syncSlot(final.match, 'p2', sf2 && sf2.done ? sf2.winner : null) || passChanged;
      passChanged = syncSlot(bronze.match, 'p1', loserOf(sf1)) || passChanged;
      passChanged = syncSlot(bronze.match, 'p2', loserOf(sf2)) || passChanged;
    }
    return passChanged;
  };

  for (let pass = 0; pass < 4; pass += 1) {
    const passChanged = runSyncPass();
    changed = passChanged || changed;
    if (!passChanged) break;
  }

  return changed;
}

function isTournamentFinished(state = {}) {
  if (state.phase === 'done') return true;
  const matches = state.matches || [];
  const finalsDone = matches.some(match => match.phase === 'Finals' && match.done);
  const bronzeDone = matches.some(match => match.phase === 'Bronze Match' && match.done);
  return finalsDone && bronzeDone;
}

function getSingleEliminationStageMatches(state = {}, stage = null) {
  const normalizedStage = stage || getSingleEliminationStage(state);
  if (!normalizedStage) return [];
  const matches = state.matches || [];
  if (normalizedStage.id === 'stage_top_cut_1') {
    return matches.filter(match => match.stageId === normalizedStage.id || (!match.stageId && !!match.phase));
  }
  const explicitMatches = matches.filter(match => match.stageId === normalizedStage.id);
  if (explicitMatches.length > 0) return explicitMatches;
  return [];
}

function isSingleEliminationStageFinished(state = {}, stage = null) {
  if (state.phase === 'done') return true;
  const normalizedStage = stage || getSingleEliminationStage(state);
  if (!normalizedStage) return false;
  const matches = getSingleEliminationStageMatches(state, normalizedStage);
  if (matches.length === 0) return false;

  const final = matches.find(match => match.phase === 'Finals');
  if (!final || !final.done || !final.winner) return false;

  const bracketSize = normalizeBracketSize(
    state.top8?.length || normalizedStage.elimination?.bracketSize || state.players?.length || 8,
    8,
  );
  const needsBronze = normalizedStage.elimination?.bronzeMatch !== false && bracketSize >= 4;
  if (!needsBronze) return true;

  const bronze = matches.find(match => match.phase === 'Bronze Match');
  return !!(bronze && bronze.done && bronze.winner);
}

function getTop8AwardForPlayer(playerName, state = {}) {
  const matches = state.matches || [];
  const final = matches.find(match => match.phase === 'Finals');
  const bronze = matches.find(match => match.phase === 'Bronze Match');
  if (final && final.done) {
    if (final.winner === playerName) return 'champion';
    if (final.p1 === playerName || final.p2 === playerName) return 'runner-up';
  }
  if (bronze && bronze.done) {
    if (bronze.winner === playerName) return 'third-place';
    if (bronze.p1 === playerName || bronze.p2 === playerName) return 'fourth-place';
  }
  const qfLoss = matches.some(match => match.phase === 'Quarter Finals' && match.done && (match.p1 === playerName || match.p2 === playerName) && match.winner !== playerName);
  if (qfLoss) return 'top8';
  return null;
}

module.exports = {
  createTop8QuarterFinals,
  isPowerOfTwo,
  normalizeBracketSize,
  buildSeedOrder,
  getEliminationRoundLabel,
  getEliminationPhaseOrder,
  getEliminationPhaseOrderForState,
  getSingleEliminationStage,
  getSingleEliminationEntrants,
  createSingleEliminationBracket,
  expectedFirstRoundPhaseForStage,
  isSingleEliminationBracketShapeValid,
  repairSingleEliminationBracketShape,
  enterSingleElimination,
  advanceSingleEliminationBracket,
  enterTop8,
  cancelTop8Confirm,
  validateBo3Score,
  applyBo3ScoreToMatch,
  applyResultToMatch,
  advanceBracket,
  isTournamentFinished,
  getSingleEliminationStageMatches,
  isSingleEliminationStageFinished,
  getTop8AwardForPlayer,
};
