const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyDrawToMatch,
  applyGameScoreToMatch,
  applyMatchWinner,
  isMatchReady,
} = require('../src/core/matches');

test('match readiness requires two playable entrants', () => {
  assert.equal(isMatchReady({ p1: 'A', p2: 'B' }), true);
  assert.equal(isMatchReady({ p1: 'A', p2: null }), false);
  assert.equal(isMatchReady({ p1: 'A', p2: 'TBD' }), false);
  assert.equal(isMatchReady({ p1: 'A', p2: 'BYE' }), false);
});

test('result helpers reject matches waiting for an opponent', () => {
  const match = { id: 'm1', p1: 'A', p2: null, p1Wins: 0, p2Wins: 0, done: false };

  assert.equal(applyMatchWinner(match, 'A'), false);
  assert.equal(applyGameScoreToMatch(match, 2, 0, { bestOf: 3 }), false);
  assert.equal(applyDrawToMatch(match), false);
  assert.deepEqual(match, { id: 'm1', p1: 'A', p2: null, p1Wins: 0, p2Wins: 0, done: false });
});

test('BO5 game score requires three wins before finishing', () => {
  const match = { id: 'm1', p1: 'A', p2: 'B', p1Wins: 0, p2Wins: 0, done: false };

  assert.equal(applyGameScoreToMatch(match, 2, 0, { bestOf: 5 }), true);
  assert.equal(match.done, false);
  assert.equal(match.winner, null);
  assert.equal(match.p1Wins, 2);
  assert.equal(match.p2Wins, 0);

  assert.equal(applyGameScoreToMatch(match, 3, 1, { bestOf: 5 }), true);
  assert.equal(match.done, true);
  assert.equal(match.winner, 'A');
});
