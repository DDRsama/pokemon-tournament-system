const test = require('node:test');
const assert = require('node:assert/strict');
const { freshState } = require('../src/core/state');
const { applyResultToMatch } = require('../src/core/top8');
const { applyMatchWinner } = require('../src/core/matches');
const {
  distributeGroups,
  createGroupRoundRobinMatches,
  enterGroups,
  getCurrentGroupRoundMatches,
  getGroupRoundCount,
  advanceGroupRound,
  buildGroupStandings,
  completeGroups,
  normalizeGroupSchedule,
} = require('../src/core/groups');

test('groups distribute entrants with snake seeding', () => {
  const stage = {
    id: 'stage_groups_1',
    type: 'groups',
    groups: { groupCount: 2, advancePerGroup: 1, seeding: 'snake' },
  };
  const groups = distributeGroups(['A', 'B', 'C', 'D'], stage);
  assert.deepEqual(groups.map(group => group.entrants), [['A', 'D'], ['B', 'C']]);
});

test('group round robin schedules one match per entrant in each group round', () => {
  const stage = {
    id: 'stage_groups_1',
    type: 'groups',
    groups: { groupCount: 1, advancePerGroup: 1 },
  };
  const groups = [{ id: 'stage_groups_1-g1', index: 1, label: 'A组', entrants: ['A', 'B', 'C', 'D'] }];
  const matches = createGroupRoundRobinMatches(groups, stage);
  assert.equal(matches.length, 6);
  assert.equal(getGroupRoundCount(matches), 3);

  for (const groupRound of [1, 2, 3]) {
    const roundMatches = matches.filter(match => match.groupRound === groupRound);
    assert.equal(roundMatches.length, 2);
    const entrants = roundMatches.flatMap(match => [match.p1, match.p2]);
    assert.equal(new Set(entrants).size, 4);
  }
});

test('group stage advances through visible group rounds', () => {
  const stage = {
    id: 'stage_groups_1',
    type: 'groups',
    groups: { groupCount: 2, advancePerGroup: 1 },
  };
  const state = freshState({
    players: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    tournamentSettings: { stages: [stage] },
    stages: [stage],
  });
  assert.equal(enterGroups(state, stage), true);
  assert.equal(state.groupRound, 1);
  assert.equal(getCurrentGroupRoundMatches(state, stage).length, 4);

  getCurrentGroupRoundMatches(state, stage).forEach(match => applyMatchWinner(match, match.p1));
  const result = advanceGroupRound(state, stage);
  assert.equal(result.ok, true);
  assert.equal(state.groupRound, 2);
  assert.equal(getCurrentGroupRoundMatches(state, stage).length, 4);
  for (const groupRound of [2]) {
    const playersByGroup = new Map();
    getCurrentGroupRoundMatches(state, stage)
      .filter(match => match.groupRound === groupRound)
      .forEach(match => {
        const players = playersByGroup.get(match.groupId) || [];
        players.push(match.p1, match.p2);
        playersByGroup.set(match.groupId, players);
      });
    for (const entrants of playersByGroup.values()) assert.equal(new Set(entrants).size, 4);
  }
});

test('legacy group schedule with duplicate round entrants is normalized by rounds', () => {
  const stage = {
    id: 'stage_groups_1',
    type: 'groups',
    groups: { groupCount: 1, advancePerGroup: 1 },
  };
  const state = freshState({
    phase: 'groups',
    players: ['A', 'B', 'C', 'D'],
    tournamentSettings: { stages: [stage] },
    stages: [stage],
    activeStageId: stage.id,
    groupAssignments: {
      stage_groups_1: [{ id: 'stage_groups_1-g1', index: 1, label: 'A组', entrants: ['A', 'B', 'C', 'D'] }],
    },
    matches: [
      { id: 'old1', stageId: stage.id, stagePhase: 'groups', groupId: 'stage_groups_1-g1', groupIndex: 1, groupLabel: 'A组', groupRound: 1, table: 1, p1: 'A', p2: 'B', winner: 'A', done: true, p1Wins: 1, p2Wins: 0 },
      { id: 'old2', stageId: stage.id, stagePhase: 'groups', groupId: 'stage_groups_1-g1', groupIndex: 1, groupLabel: 'A组', groupRound: 1, table: 2, p1: 'A', p2: 'C', winner: null, done: false, p1Wins: 0, p2Wins: 0 },
      { id: 'old3', stageId: stage.id, stagePhase: 'groups', groupId: 'stage_groups_1-g1', groupIndex: 1, groupLabel: 'A组', groupRound: 1, table: 3, p1: 'A', p2: 'D', winner: null, done: false, p1Wins: 0, p2Wins: 0 },
      { id: 'old4', stageId: stage.id, stagePhase: 'groups', groupId: 'stage_groups_1-g1', groupIndex: 1, groupLabel: 'A组', groupRound: 1, table: 4, p1: 'B', p2: 'C', winner: null, done: false, p1Wins: 0, p2Wins: 0 },
      { id: 'old5', stageId: stage.id, stagePhase: 'groups', groupId: 'stage_groups_1-g1', groupIndex: 1, groupLabel: 'A组', groupRound: 1, table: 5, p1: 'B', p2: 'D', winner: null, done: false, p1Wins: 0, p2Wins: 0 },
      { id: 'old6', stageId: stage.id, stagePhase: 'groups', groupId: 'stage_groups_1-g1', groupIndex: 1, groupLabel: 'A组', groupRound: 1, table: 6, p1: 'C', p2: 'D', winner: null, done: false, p1Wins: 0, p2Wins: 0 },
    ],
  });

  assert.equal(normalizeGroupSchedule(state, stage), true);
  assert.equal(state.matches.length, 6);
  assert.equal(getGroupRoundCount(state.matches), 3);
  assert.equal(state.matches.find(match => match.p1 === 'A' && match.p2 === 'B').done, true);
  for (const groupRound of [1, 2, 3]) {
    const roundMatches = state.matches.filter(match => match.groupRound === groupRound);
    const entrants = roundMatches.flatMap(match => [match.p1, match.p2]);
    assert.equal(new Set(entrants).size, 4);
  }
});

function recordGroupResult(matches, a, b, winner = null) {
  const match = matches.find(item => (item.p1 === a && item.p2 === b) || (item.p1 === b && item.p2 === a));
  assert.ok(match, `match should exist: ${a} vs ${b}`);
  match.done = true;
  match.draw = !winner;
  match.winner = winner || null;
  match.p1Wins = winner ? (match.p1 === winner ? 1 : 0) : 0;
  match.p2Wins = winner ? (match.p2 === winner ? 1 : 0) : 0;
}

test('group standings use OMW and OOW tiebreakers for completed groups', () => {
  const stage = {
    id: 'stage_groups_1',
    type: 'groups',
    groups: { groupCount: 1, advancePerGroup: 2 },
    advancement: { mode: 'per_group', count: 2, targetStageId: 'stage_top_cut_1' },
  };
  const group = { id: 'stage_groups_1-g1', index: 1, label: 'A组', entrants: ['A', 'B', 'C', 'D', 'E'] };
  const matches = createGroupRoundRobinMatches([group], stage);
  const state = freshState({
    phase: 'groups',
    players: group.entrants,
    tournamentSettings: { stages: [stage] },
    stages: [stage],
    groupAssignments: { [stage.id]: [group] },
    matches,
  });

  recordGroupResult(matches, 'B', 'A', 'B');
  recordGroupResult(matches, 'A', 'C', 'A');
  recordGroupResult(matches, 'A', 'D', 'A');
  recordGroupResult(matches, 'E', 'A', 'E');
  recordGroupResult(matches, 'B', 'C', null);
  recordGroupResult(matches, 'B', 'D', null);
  recordGroupResult(matches, 'B', 'E', null);
  recordGroupResult(matches, 'C', 'D', 'C');
  recordGroupResult(matches, 'C', 'E', 'C');
  recordGroupResult(matches, 'D', 'E', 'D');

  const [view] = buildGroupStandings(state, stage);
  const a = view.standings.find(entry => entry.player === 'A');
  const b = view.standings.find(entry => entry.player === 'B');
  assert.equal(a.points, b.points);
  assert.equal(a.gameDiff < b.gameDiff, true, 'fixture should prove OMW is applied before game score diff');
  assert.equal(a.omw > b.omw, true);
  assert.equal(typeof a.oow, 'number');
  assert.equal(view.standings.findIndex(entry => entry.player === 'A') < view.standings.findIndex(entry => entry.player === 'B'), true);

  const result = completeGroups(state, stage);
  assert.equal(result.ok, true);
  assert.deepEqual(state.stageResults.stage_groups_1.advancers, ['C', 'A']);
});

test('group round robin completes and writes per group advancers', () => {
  const stage = {
    id: 'stage_groups_1',
    type: 'groups',
    groups: { groupCount: 2, advancePerGroup: 1, seeding: 'snake' },
    advancement: { mode: 'per_group', count: 1, targetStageId: 'stage_top_cut_1' },
  };
  const state = freshState({
    players: ['A', 'B', 'C', 'D'],
    tournamentSettings: { stages: [stage] },
    stages: [stage],
  });
  assert.equal(enterGroups(state, stage), true);
  assert.equal(state.phase, 'groups');
  assert.equal(state.matches.length, 2);
  applyResultToMatch(state.matches.find(match => match.p1 === 'A'), 'A');
  applyResultToMatch(state.matches.find(match => match.p1 === 'B'), 'B');

  const standings = buildGroupStandings(state, stage);
  assert.deepEqual(standings.map(group => group.standings[0].player), ['A', 'B']);
  const result = completeGroups(state, stage);
  assert.equal(result.ok, true);
  assert.deepEqual(state.stageResults.stage_groups_1.advancers, ['A', 'B']);
  assert.equal(state.groupMatchHistory.length, 2);
  assert.equal(state.groupMatchHistory.every(match => match.stagePhase === 'groups' && match.done), true);
});
