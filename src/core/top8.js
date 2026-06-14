function createTop8QuarterFinals(top8) {
  return [
    { id: 'qf1', table: 1, p1: top8[0], p2: top8[7], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    { id: 'qf2', table: 2, p1: top8[3], p2: top8[4], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    { id: 'qf3', table: 3, p1: top8[1], p2: top8[6], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    { id: 'qf4', table: 4, p1: top8[2], p2: top8[5], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
  ];
}

function enterTop8(state) {
  if (!state.pendingTop8 || state.pendingTop8.length < 8) return false;
  const top8 = state.pendingTop8;
  state.top8 = top8;
  state.pendingTop8 = null;
  state.swissRanking = [];
  state.phase = 'top8';
  state.currentLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = 'top8-bracket';
  state.matches = createTop8QuarterFinals(top8);
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
  if (!match || (winnerId !== match.p1 && winnerId !== match.p2)) return false;
  match.winner = winnerId;
  match.done = true;
  match.draw = false;
  match.p1Wins = winnerId === match.p1 ? 1 : 0;
  match.p2Wins = winnerId === match.p2 ? 1 : 0;
  return true;
}

function ensureMatch(matches, id, phase, table, bracketRound) {
  let match = matches.find(item => item.id === id);
  let changed = false;
  if (!match) {
    match = { id, table, p1: null, p2: null, winner: null, done: false, phase, bracketRound, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false };
    matches.push(match);
    changed = true;
  }
  return { match, changed };
}

function setSlot(match, slot, player) {
  if (!match || !player || match[slot] === player || match.done) return false;
  match[slot] = player;
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
  let changed = false;

  const qf1 = matches.find(match => match.id === 'qf1');
  const qf2 = matches.find(match => match.id === 'qf2');
  const qf3 = matches.find(match => match.id === 'qf3');
  const qf4 = matches.find(match => match.id === 'qf4');
  if ([qf1, qf2].some(match => match && match.done && match.winner)) {
    const result = ensureMatch(matches, 'sf1', 'Semi Finals', 1, 2);
    changed = result.changed || changed;
    changed = setSlot(result.match, 'p1', qf1 && qf1.done ? qf1.winner : null) || changed;
    changed = setSlot(result.match, 'p2', qf2 && qf2.done ? qf2.winner : null) || changed;
  }
  if ([qf3, qf4].some(match => match && match.done && match.winner)) {
    const result = ensureMatch(matches, 'sf2', 'Semi Finals', 2, 2);
    changed = result.changed || changed;
    changed = setSlot(result.match, 'p1', qf3 && qf3.done ? qf3.winner : null) || changed;
    changed = setSlot(result.match, 'p2', qf4 && qf4.done ? qf4.winner : null) || changed;
  }

  const sf1 = matches.find(match => match.id === 'sf1');
  const sf2 = matches.find(match => match.id === 'sf2');
  if ([sf1, sf2].some(match => match && match.done && match.winner)) {
    const final = ensureMatch(matches, 'final', 'Finals', 1, 3);
    const bronze = ensureMatch(matches, 'bronze', 'Bronze Match', 2, 3);
    changed = final.changed || bronze.changed || changed;
    changed = setSlot(final.match, 'p1', sf1 && sf1.done ? sf1.winner : null) || changed;
    changed = setSlot(final.match, 'p2', sf2 && sf2.done ? sf2.winner : null) || changed;
    changed = setSlot(bronze.match, 'p1', loserOf(sf1)) || changed;
    changed = setSlot(bronze.match, 'p2', loserOf(sf2)) || changed;
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
  enterTop8,
  cancelTop8Confirm,
  validateBo3Score,
  applyBo3ScoreToMatch,
  applyResultToMatch,
  advanceBracket,
  isTournamentFinished,
  getTop8AwardForPlayer,
};
