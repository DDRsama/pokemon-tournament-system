const test = require('node:test');
const assert = require('node:assert/strict');
const {
  freshState,
  restoreByeSet,
  restoreState,
  serializeState,
  normalizeTop8MatchTables,
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

test('tournament phase display respects final state', () => {
  const doneState = freshState({ phase: 'top8', matches: [{ phase: 'Finals', done: true }, { phase: 'Bronze Match', done: true }] });
  assert.equal(isTournamentFinished(doneState), true);
  assert.equal(displayPhaseForTournament(doneState), 'done');
});
