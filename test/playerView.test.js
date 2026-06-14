const test = require('node:test');
const assert = require('node:assert/strict');
const { freshState } = require('../src/core/state');
const { buildPlayerView } = require('../src/core/playerView');

function build(state, playerNameOrId = 'A') {
  return buildPlayerView({
    playerNameOrId,
    state,
    getPlayerNameById: id => id === 'pl_a' ? 'A' : null,
    getPlayerProfileByName: name => name === 'A' ? { playerId: 'pl_a', name: 'A' } : null,
    getPlayerCompletionStatus: () => ({ finished: false }),
    getTop8AwardForPlayer: () => null,
  });
}

test('player view shows registration mode during setup', () => {
  const state = freshState({ players: [] });
  const view = build(state);
  assert.equal(view.mode, 'registration');
  assert.equal(view.inPool, false);
});

test('player view resolves player id and active swiss match', () => {
  const state = freshState({
    phase: 'swiss',
    round: 1,
    players: ['A', 'B'],
    matches: [{ id: 'm1', round: 1, table: 1, p1: 'A', p2: 'B', done: false }],
    currentLiveMatch: { id: 'm1' },
  });
  const view = build(state, 'pl_a');
  assert.equal(view.playerName, 'A');
  assert.equal(view.mode, 'active-match');
  assert.equal(view.activeMatch.isLiveTable, true);
});

test('player view includes top8 overview', () => {
  const state = freshState({
    phase: 'top8',
    players: ['A'],
    top8: ['A'],
    matches: [{ id: 'qf1', table: 1, phase: 'Quarter Finals', p1: 'A', p2: 'B', done: false }],
  });
  const view = build(state);
  assert.equal(view.top8, true);
  assert.equal(view.top8Overview.stages[0].matches[0].id, 'qf1');
});
