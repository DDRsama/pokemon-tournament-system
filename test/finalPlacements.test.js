const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFinalPlacements, finalPlacementForPlayer } = require('../src/core/finalPlacements');

test('swiss plus top cut keeps non-qualifiers ranked by final swiss standings', () => {
  const state = {
    phase: 'done',
    players: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    top8: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    swissRankingArchive: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((player, index) => ({
      rank: index + 1,
      player,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
    })),
    stages: [
      { id: 'stage_swiss_1', type: 'swiss' },
      { id: 'stage_top_cut_1', type: 'single_elimination', elimination: { bracketSize: 8, bronzeMatch: true } },
    ],
    stageResults: {
      stage_top_cut_1: {
        standings: [
          { rank: 1, player: 'A' },
          { rank: 2, player: 'B' },
          { rank: 3, player: 'C' },
          { rank: 4, player: 'D' },
        ],
      },
    },
    matches: [
      { id: 'qf1', stageId: 'stage_top_cut_1', phase: 'Quarter Finals', p1: 'A', p2: 'H', winner: 'A', done: true },
      { id: 'qf2', stageId: 'stage_top_cut_1', phase: 'Quarter Finals', p1: 'D', p2: 'E', winner: 'D', done: true },
      { id: 'qf3', stageId: 'stage_top_cut_1', phase: 'Quarter Finals', p1: 'B', p2: 'G', winner: 'B', done: true },
      { id: 'qf4', stageId: 'stage_top_cut_1', phase: 'Quarter Finals', p1: 'C', p2: 'F', winner: 'C', done: true },
      { id: 'sf1', stageId: 'stage_top_cut_1', phase: 'Semi Finals', p1: 'A', p2: 'D', winner: 'A', done: true },
      { id: 'sf2', stageId: 'stage_top_cut_1', phase: 'Semi Finals', p1: 'B', p2: 'C', winner: 'B', done: true },
      { id: 'bronze', stageId: 'stage_top_cut_1', phase: 'Bronze Match', p1: 'D', p2: 'C', winner: 'C', done: true },
      { id: 'final', stageId: 'stage_top_cut_1', phase: 'Finals', p1: 'A', p2: 'B', winner: 'A', done: true },
    ],
  };

  const placements = buildFinalPlacements(state);
  assert.deepEqual(placements.slice(0, 4).map(entry => [entry.player, entry.resultLabel]), [
    ['A', '冠军'],
    ['B', '亚军'],
    ['C', '季军'],
    ['D', '殿军'],
  ]);
  assert.deepEqual(['E', 'F', 'G', 'H'].map(player => finalPlacementForPlayer(state, player).resultLabel), ['八强', '八强', '八强', '八强']);
  assert.equal(finalPlacementForPlayer(state, 'I').resultLabel, '瑞士轮第 9');
  assert.equal(finalPlacementForPlayer(state, 'I').rank, 9);
});

test('pure top4 elimination reports semifinal losers as top 4 when no bronze match exists', () => {
  const state = {
    phase: 'done',
    players: ['A', 'B', 'C', 'D'],
    top8: ['A', 'B', 'C', 'D'],
    stages: [{ id: 'stage_top_cut_1', type: 'single_elimination', elimination: { bracketSize: 4, bronzeMatch: false } }],
    stageResults: {
      stage_top_cut_1: { standings: [{ rank: 1, player: 'A' }, { rank: 2, player: 'B' }] },
    },
    matches: [
      { id: 'sf1', stageId: 'stage_top_cut_1', phase: 'Semi Finals', p1: 'A', p2: 'C', winner: 'A', done: true },
      { id: 'sf2', stageId: 'stage_top_cut_1', phase: 'Semi Finals', p1: 'B', p2: 'D', winner: 'B', done: true },
      { id: 'final', stageId: 'stage_top_cut_1', phase: 'Finals', p1: 'A', p2: 'B', winner: 'A', done: true },
    ],
  };

  assert.deepEqual(buildFinalPlacements(state).map(entry => entry.player), ['A', 'B', 'C', 'D']);
  assert.equal(finalPlacementForPlayer(state, 'C').resultLabel, '四强');
  assert.equal(finalPlacementForPlayer(state, 'D').resultLabel, '四强');
});

test('group-stage non-advancers keep group placement labels', () => {
  const state = {
    phase: 'groups-ended',
    players: ['A', 'B', 'C', 'D'],
    stages: [{ id: 'stage_groups_1', type: 'groups' }],
    groupAssignments: {
      stage_groups_1: [{ id: 'g1', index: 1, label: 'A组', entrants: ['A', 'B', 'C', 'D'] }],
    },
    stageResults: {
      stage_groups_1: {
        advancers: ['A', 'B'],
        standings: [
          { rank: 1, player: 'A' },
          { rank: 2, player: 'B' },
          { rank: 3, player: 'C' },
          { rank: 4, player: 'D' },
        ],
      },
    },
  };

  assert.equal(finalPlacementForPlayer(state, 'A').rankLabel, '小组出线');
  assert.equal(finalPlacementForPlayer(state, 'C').resultLabel, 'A组第 3');
});
