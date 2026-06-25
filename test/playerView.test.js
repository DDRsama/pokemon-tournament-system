const test = require('node:test');
const assert = require('node:assert/strict');
const { freshState } = require('../src/core/state');
const { buildPlayerView } = require('../src/core/playerView');

function build(state, playerNameOrId = 'A') {
  return buildPlayerView({
    playerNameOrId,
    state,
    getPlayerNameById: id => id === 'pl_a' ? 'A' : null,
    getPlayerProfileByName: name => name === 'A' ? { playerId: 'pl_a', name: 'A', globalProfileId: 'global_a' } : null,
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
  assert.equal(view.globalProfileId, 'global_a');
});

test('player view exposes game-score metadata for BO3 swiss match', () => {
  const state = freshState({
    phase: 'swiss',
    round: 1,
    players: ['A', 'B'],
    tournamentSettings: {
      stages: [{ id: 'stage_swiss_1', type: 'swiss', matchRules: { bestOf: 3, scoreMode: 'match', allowDraw: true } }],
    },
    matches: [{ id: 'm1', stageId: 'stage_swiss_1', round: 1, table: 1, p1: 'A', p2: 'B', done: false }],
  });
  const view = build(state);
  assert.equal(view.mode, 'active-match');
  assert.equal(view.activeMatch.usesGameScore, true);
  assert.equal(view.activeMatch.bestOf, 3);
  assert.equal(view.activeMatch.winsRequired, 2);
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

test('player view includes top16 round of 16 in elimination overview', () => {
  const state = freshState({
    phase: 'top8',
    players: ['A'],
    top8: ['A', ...Array.from({ length: 15 }, (_, index) => `P${index + 2}`)],
    activeStageId: 'stage_top_cut_1',
    stages: [
      { id: 'stage_top_cut_1', type: 'single_elimination', elimination: { bracketSize: 16, bronzeMatch: true } },
    ],
    matches: [
      { id: 'r16-1', stageId: 'stage_top_cut_1', table: 1, phase: 'Round of 16', p1: 'A', p2: 'B', done: false },
      { id: 'qf-1', stageId: 'stage_top_cut_1', table: 1, phase: 'Quarter Finals', p1: 'C', p2: 'D', done: false },
    ],
  });
  const view = build(state);
  assert.equal(view.top8Overview.stages[0].phase, 'Round of 16');
  assert.equal(view.top8Overview.stages[0].matches[0].id, 'r16-1');
  assert.equal(view.top8Overview.stages[1].phase, 'Quarter Finals');
});

test('player view waits instead of exposing pending-opponent elimination match', () => {
  const state = freshState({
    phase: 'top8',
    players: ['A'],
    top8: ['A'],
    matches: [{ id: 'sf1', table: 1, phase: 'Semi Finals', p1: 'A', p2: null, done: false }],
  });
  const view = build(state);
  assert.equal(view.mode, 'top8-waiting');
  assert.equal(view.activeMatch, null);
});

test('player view ignores future group round matches', () => {
  const state = freshState({
    phase: 'groups',
    groupRound: 1,
    groupStageRounds: { stage_groups_1: 1 },
    activeStageId: 'stage_groups_1',
    players: ['A', 'B', 'C', 'D'],
    stages: [{ id: 'stage_groups_1', type: 'groups', groups: { groupCount: 1, advancePerGroup: 1 } }],
    matches: [
      { id: 'r1', stageId: 'stage_groups_1', stagePhase: 'groups', groupRound: 1, table: 1, p1: 'C', p2: 'D', done: false },
      { id: 'r2', stageId: 'stage_groups_1', stagePhase: 'groups', groupRound: 2, table: 1, p1: 'A', p2: 'B', done: false },
    ],
  });
  const view = build(state);
  assert.equal(view.mode, 'round-summary');
  assert.equal(view.activeMatch, null);
});

test('player view keeps group history and only ends non-advancers after groups complete', () => {
  const groupResult = {
    standings: [
      { player: 'A', rank: 1 },
      { player: 'B', rank: 2 },
      { player: 'C', rank: 3 },
      { player: 'D', rank: 4 },
    ],
    advancers: ['A'],
  };
  const state = freshState({
    phase: 'groups-ended',
    players: ['A', 'B', 'C', 'D'],
    stageResults: { stage_groups_1: groupResult },
    groupMatchHistory: [
      { id: 'g1', stageId: 'stage_groups_1', stagePhase: 'groups', groupLabel: 'A组', groupRound: 1, table: 1, p1: 'A', p2: 'B', winner: 'A', done: true, p1Wins: 1, p2Wins: 0 },
      { id: 'g2', stageId: 'stage_groups_1', stagePhase: 'groups', groupLabel: 'A组', groupRound: 1, table: 2, p1: 'C', p2: 'D', winner: 'C', done: true, p1Wins: 1, p2Wins: 0 },
    ],
    matches: [],
  });

  const advancerView = build(state, 'A');
  assert.equal(advancerView.mode, 'top8-waiting');
  assert.equal(advancerView.history.length, 1);
  assert.equal(advancerView.history[0].phase, 'A组');

  const eliminatedView = buildPlayerView({
    playerNameOrId: 'B',
    state,
    getPlayerNameById: () => null,
    getPlayerProfileByName: () => null,
    getPlayerCompletionStatus: () => ({ finished: true, reason: '止步小组赛' }),
    getTop8AwardForPlayer: () => null,
  });
  assert.equal(eliminatedView.mode, 'final-result');
  assert.equal(eliminatedView.history.length, 1);
  assert.equal(eliminatedView.history[0].opponent, 'A');
});

test('player view keeps group history after elimination finishes', () => {
  const state = freshState({
    phase: 'done',
    players: ['A', 'B', 'C'],
    top8: ['A', 'C'],
    groupMatchHistory: [
      { id: 'g1', stageId: 'stage_groups_1', stagePhase: 'groups', groupLabel: 'A组', groupRound: 1, table: 1, p1: 'A', p2: 'B', winner: 'A', done: true, p1Wins: 1, p2Wins: 0 },
    ],
    matches: [
      { id: 'final', stageId: 'stage_top_cut_1', phase: 'Finals', table: 1, p1: 'A', p2: 'C', winner: 'A', done: true, p1Wins: 2, p2Wins: 0 },
    ],
  });
  const view = build(state);
  assert.deepEqual(view.history.map(item => item.phase), ['A组', 'Finals']);
  assert.deepEqual(view.history.map(item => item.opponent), ['B', 'C']);
});
