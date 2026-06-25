const test = require('node:test');
const assert = require('node:assert/strict');
const {
  freshState,
  restoreByeSet,
  restoreState,
  serializeState,
  normalizeTop8MatchTables,
  isTerminalSwissSummary,
  isTournamentFinished,
  displayPhaseForTournament,
} = require('../src/core/state');

test('freshState creates expected defaults', () => {
  const state = freshState();
  assert.equal(state.phase, 'setup');
  assert.equal(state.overlayState, 'idle');
  assert.deepEqual(state.players, []);
  assert.ok(state._byeSet instanceof Set);
});

test('restoreByeSet accepts array, set and object forms', () => {
  assert.deepEqual([...restoreByeSet(['a', 'b'])], ['a', 'b']);
  assert.deepEqual([...restoreByeSet(new Set(['x']))], ['x']);
  assert.deepEqual([...restoreByeSet({ y: true, z: true })].sort(), ['y', 'z']);
});

test('restoreState restores nested fields', () => {
  const raw = {
    tournamentName: 'Demo',
    _byeSet: ['a'],
    swissMatchesArchive: null,
    playerProfiles: null,
  };
  const state = restoreState(raw);
  assert.equal(state.tournamentName, 'Demo');
  assert.deepEqual([...state._byeSet], ['a']);
  assert.deepEqual(state.swissMatchesArchive, []);
  assert.deepEqual(state.playerProfiles, {});
});

test('normalizeTop8MatchTables writes stable tables', () => {
  const state = freshState({
    matches: [
      { id: 'sf2', phase: 'Semi Finals', bracketRound: 2 },
      { id: 'bronze', phase: 'Bronze Match', bracketRound: 3 },
      { id: 'qf4', phase: 'Quarter Finals', bracketRound: 1 },
      { id: 'qf1', phase: 'Quarter Finals', bracketRound: 1 },
    ],
  });
  normalizeTop8MatchTables(state);
  assert.equal(state.matches.find(m => m.id === 'qf1').table, 1);
  assert.equal(state.matches.find(m => m.id === 'qf4').table, 4);
  assert.equal(state.matches.find(m => m.id === 'sf2').table, 2);
  assert.equal(state.matches.find(m => m.id === 'bronze').table, 2);
});

test('serializeState converts bye set to array', () => {
  const state = freshState({ _byeSet: new Set(['a']) });
  const serialized = serializeState(state);
  assert.deepEqual(serialized._byeSet, ['a']);
});

test('restore and serialize preserve 3.0 stage results and point awards', () => {
  const state = restoreState({
    stageResults: {
      stage_groups_1: { stageId: 'stage_groups_1', advancers: ['A'], standings: [{ rank: 1, player: 'A' }] },
    },
    pointAwards: [{ profileId: 'pl_a', points: 10 }],
  });
  assert.equal(state.stageResults.stage_groups_1.advancers[0], 'A');
  assert.equal(state.pointAwards[0].points, 10);
  const serialized = serializeState(state);
  assert.equal(serialized.stageResults.stage_groups_1.standings[0].player, 'A');
  assert.equal(serialized.pointAwards[0].profileId, 'pl_a');
});

test('tournament phase display respects final state', () => {
  const doneState = freshState({ phase: 'top8', matches: [{ phase: 'Finals', done: true }, { phase: 'Bronze Match', done: true }] });
  assert.equal(isTournamentFinished(doneState), true);
  assert.equal(displayPhaseForTournament(doneState), 'done');
});

test('terminal swiss summary counts as a finished tournament', () => {
  const state = restoreState({
    phase: 'swiss-ended',
    activeStageId: 'stage_swiss_1',
    tournamentSettings: {
      presetId: 'custom_structure',
      stages: [
        {
          id: 'stage_swiss_1',
          type: 'swiss',
          advancement: { mode: 'none', count: 0, targetStageId: null },
        },
      ],
    },
    stages: [
      {
        id: 'stage_swiss_1',
        type: 'swiss',
        advancement: { mode: 'none', count: 0, targetStageId: null },
      },
    ],
    swissRanking: [{ rank: 1, player: 'A' }],
    stageResults: {
      stage_swiss_1: {
        standings: [{ rank: 1, player: 'A' }],
        advancers: ['A'],
        metadata: { advancementMode: 'top_cut' },
      },
    },
  });
  assert.equal(state.phase, 'done');
  assert.equal(state.pendingTop8, null);
  assert.deepEqual(state.stageResults.stage_swiss_1.advancers, []);
  assert.equal(state.stageResults.stage_swiss_1.metadata.advancementMode, 'none');
  assert.equal(isTerminalSwissSummary({ ...state, phase: 'swiss-ended' }), true);
  assert.equal(isTournamentFinished(state), true);
  assert.equal(displayPhaseForTournament(state), 'done');
});
