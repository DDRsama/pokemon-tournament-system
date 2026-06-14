const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCompletedSwissMatches,
  getSwissOpponents,
  getActualCompletedSwissMatchesForPlayer,
  getPlayerWinPercentage,
  getHeadToHeadSweep,
  buildStandingEntry,
  getSortedStandings,
} = require('../src/core/standings');

test('getCompletedSwissMatches filters only finished swiss matches', () => {
  const state = {
    matches: [
      { round: 1, done: true, p1: 'A', p2: 'B' },
      { round: 1, done: false, p1: 'C', p2: 'D' },
      { phase: 'Finals', done: true, p1: 'E', p2: 'F' },
    ],
  };
  assert.equal(getCompletedSwissMatches(state).length, 1);
});

test('BYE is ignored in opponent lists and win rate calculations', () => {
  const state = {
    matches: [
      { round: 1, done: true, p1: 'A', p2: 'BYE', winner: 'A', draw: false },
      { round: 2, done: true, p1: 'A', p2: 'B', winner: 'A', draw: false },
      { round: 2, done: true, p1: 'B', p2: 'C', winner: 'B', draw: false },
    ],
  };
  assert.deepEqual(getSwissOpponents('A', state), ['B']);
  assert.equal(getPlayerWinPercentage('A', state), 1);
});

test('head-to-head sweep resolves direct tie', () => {
  const state = {
    matches: [
      { round: 1, done: true, p1: 'A', p2: 'B', winner: 'A', draw: false },
      { round: 2, done: true, p1: 'A', p2: 'C', winner: 'C', draw: false },
      { round: 2, done: true, p1: 'B', p2: 'D', winner: 'D', draw: false },
    ],
  };
  assert.equal(getHeadToHeadSweep('A', 'B', state), 1);
});

test('getSortedStandings honors points and dropped filter', () => {
  const state = {
    players: ['A', 'B', 'C', 'D'],
    matches: [
      { round: 1, done: true, p1: 'A', p2: 'C', winner: 'A', draw: false },
      { round: 1, done: true, p1: 'B', p2: 'D', winner: 'B', draw: false },
    ],
  };
  const standings = getSortedStandings(state, true, new Set(['D']));
  assert.equal(standings[0].player, 'A');
  assert.equal(buildStandingEntry('D', state, new Set(['D'])).dropped, true);
  assert.equal(getSortedStandings(state, false, new Set(['D'])).some(entry => entry.player === 'D'), false);
});
