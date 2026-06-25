const { normalizeBestOf, winsRequired } = require('./rules');

function normalizeScoreValue(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function validateGameScore(bestOf, aWins, bWins) {
  const safeBestOf = normalizeBestOf(bestOf, 1);
  const needed = winsRequired(safeBestOf);
  const a = normalizeScoreValue(aWins);
  const b = normalizeScoreValue(bWins);
  if (a === null || b === null) return null;
  if (a > needed || b > needed) return null;
  if (a === needed && b === needed) return null;
  return {
    bestOf: safeBestOf,
    winsRequired: needed,
    aWins: a,
    bWins: b,
    done: a >= needed || b >= needed,
    winnerSlot: a >= needed ? 'a' : b >= needed ? 'b' : null,
  };
}

function getMatchEntrant(match, slot) {
  if (slot === 'a') return match.entrantA || match.p1 || null;
  if (slot === 'b') return match.entrantB || match.p2 || null;
  return null;
}

function normalizeEntrantToken(value) {
  return String(value || '').trim().toUpperCase();
}

function isPlaceholderEntrant(value) {
  const token = normalizeEntrantToken(value);
  return !token || token === 'TBD' || token === '待定';
}

function isByeEntrant(value) {
  return normalizeEntrantToken(value) === 'BYE';
}

function isMatchReady(match) {
  if (!match) return false;
  const a = getMatchEntrant(match, 'a');
  const b = getMatchEntrant(match, 'b');
  return !isPlaceholderEntrant(a)
    && !isPlaceholderEntrant(b)
    && !isByeEntrant(a)
    && !isByeEntrant(b);
}

function applyGameScoreToMatch(match, aWins, bWins, options = {}) {
  if (!match) return false;
  const score = validateGameScore(options.bestOf || match.bestOf || options.matchRules?.bestOf || 1, aWins, bWins);
  if (!score || !isMatchReady(match)) return false;
  match.bestOf = score.bestOf;
  match.p1Wins = score.aWins;
  match.p2Wins = score.bWins;
  match.done = score.done;
  match.draw = false;
  match.winner = score.winnerSlot ? getMatchEntrant(match, score.winnerSlot) : null;
  match.result = {
    type: 'normal',
    winner: match.winner,
    draw: false,
    aGameWins: score.aWins,
    bGameWins: score.bWins,
  };
  return true;
}

function applyMatchWinner(match, winnerId) {
  if (!isMatchReady(match) || (winnerId !== getMatchEntrant(match, 'a') && winnerId !== getMatchEntrant(match, 'b'))) return false;
  match.winner = winnerId;
  match.done = true;
  match.draw = false;
  match.p1Wins = winnerId === getMatchEntrant(match, 'a') ? 1 : 0;
  match.p2Wins = winnerId === getMatchEntrant(match, 'b') ? 1 : 0;
  match.result = {
    type: 'normal',
    winner: winnerId,
    draw: false,
    aGameWins: match.p1Wins,
    bGameWins: match.p2Wins,
  };
  return true;
}

function applyDrawToMatch(match) {
  if (!isMatchReady(match)) return false;
  match.winner = null;
  match.done = true;
  match.draw = true;
  match.p1Wins = 0;
  match.p2Wins = 0;
  match.result = {
    type: 'draw',
    winner: null,
    draw: true,
    aGameWins: 0,
    bGameWins: 0,
  };
  return true;
}

module.exports = {
  validateGameScore,
  getMatchEntrant,
  isPlaceholderEntrant,
  isByeEntrant,
  isMatchReady,
  applyGameScoreToMatch,
  applyMatchWinner,
  applyDrawToMatch,
};
