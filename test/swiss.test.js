const test = require('node:test');
const assert = require('node:assert/strict');
const { freshState } = require('../src/core/state');
const {
  hasPlayedEachOther,
  pairPlayersWithinGroup,
  createRoundMatches,
  startSwiss,
  canAdvanceRound,
  endSwiss,
} = require('../src/core/swiss');

function standings(players) {
  return players.map((player, index) => ({
    player,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    latePenalty: 0,
    omw: 0,
    oow: 0,
    dropped: false,
    rank: index + 1,
  }));
}

test('hasPlayedEachOther detects previous swiss matches', () => {
  const matches = [{ round: 1, p1: 'A', p2: 'B' }];
  assert.equal(hasPlayedEachOther(matches, 'A', 'B'), true);
  assert.equal(hasPlayedEachOther(matches, 'A', 'C'), false);
});

test('pairPlayersWithinGroup avoids repeated pairings when possible', () => {
  const matches = [{ round: 1, p1: 'A', p2: 'B' }];
  const result = pairPlayersWithinGroup(['A', 'B', 'C', 'D'], matches);
  assert.deepEqual(result.pairs[0], ['A', 'C']);
});

test('createRoundMatches pairs even player count', () => {
  const state = freshState({ round: 1, players: ['A', 'B', 'C', 'D'] });
  const result = createRoundMatches(state, standings(state.players));
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches.every(match => match.p2 !== 'BYE'), true);
});

test('createRoundMatches assigns BYE for odd player count and avoids repeat BYE', () => {
  const state = freshState({ round: 1, players: ['A', 'B', 'C'], _byeSet: new Set(['C']) });
  const result = createRoundMatches(state, standings(state.players));
  const byeMatch = result.matches.find(match => match.p2 === 'BYE');
  assert.ok(byeMatch);
  assert.notEqual(byeMatch.p1, 'C');
  assert.equal(byeMatch.done, true);
});

test('startSwiss initializes state and first round', () => {
  const state = freshState({ players: ['A', 'B', 'C', 'D'] });
  const ok = startSwiss(state, 3, standings(state.players));
  assert.equal(ok, true);
  assert.equal(state.phase, 'swiss');
  assert.equal(state.round, 1);
  assert.equal(state.swissRounds, 3);
  assert.equal(state.matches.length, 2);
});

test('canAdvanceRound blocks incomplete current round', () => {
  const state = freshState({
    phase: 'swiss',
    round: 1,
    swissRounds: 3,
    matches: [{ round: 1, done: false }],
  });
  assert.equal(canAdvanceRound(state).ok, false);
});

test('canAdvanceRound allows completed current round', () => {
  const state = freshState({
    phase: 'swiss',
    round: 1,
    swissRounds: 3,
    matches: [{ round: 1, done: true }],
  });
  assert.equal(canAdvanceRound(state).ok, true);
});

test('endSwiss writes ranking and pending top8', () => {
  const state = freshState({ phase: 'swiss' });
  endSwiss(state, standings(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']));
  assert.equal(state.phase, 'swiss-ended');
  assert.equal(state.pendingTop8.length, 8);
  assert.equal(state.swissRanking[0].rank, 1);
});
