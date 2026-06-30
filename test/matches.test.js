const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyDrawToMatch,
  applyGameScoreToMatch,
  applyMatchWinner,
  applySharedLiveRoomCodeToTopCut,
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

test('top4 and top8 current round share live room code without marking every table live', () => {
  const stage = { id: 'stage_top_cut_1', type: 'single_elimination', elimination: { bracketSize: 8 } };
  const state = {
    phase: 'top8',
    liveRoomCode: 'ROOM42',
    activeStageId: stage.id,
    stages: [stage],
    matches: [
      { id: 'qf1', stageId: stage.id, bracketRound: 1, p1: 'A', p2: 'H', done: false, wasLive: true },
      { id: 'qf2', stageId: stage.id, bracketRound: 1, p1: 'D', p2: 'E', done: false, wasLive: false },
      { id: 'qf3', stageId: stage.id, bracketRound: 1, p1: 'B', p2: 'G', done: true, winner: 'B', wasLive: false },
      { id: 'sf1', stageId: stage.id, bracketRound: 2, p1: 'A', p2: 'D', done: false, wasLive: false },
    ],
  };

  const shared = applySharedLiveRoomCodeToTopCut(state, state.matches[0]);

  assert.deepEqual(shared.map(match => match.id), ['qf1', 'qf2']);
  assert.equal(state.matches.find(match => match.id === 'qf1').liveRoomCode, 'ROOM42');
  assert.equal(state.matches.find(match => match.id === 'qf2').liveRoomCode, 'ROOM42');
  assert.equal(state.matches.find(match => match.id === 'qf2').wasLive, false);
  assert.equal(state.matches.find(match => match.id === 'qf3').liveRoomCode, undefined);
  assert.equal(state.matches.find(match => match.id === 'sf1').liveRoomCode, undefined);
});
