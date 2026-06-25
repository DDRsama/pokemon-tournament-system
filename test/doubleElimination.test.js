const test = require('node:test');
const assert = require('node:assert/strict');
const { freshState } = require('../src/core/state');
const { applyResultToMatch } = require('../src/core/top8');
const {
  createDoubleMatch,
  enterDoubleElimination,
  advanceDoubleElimination,
  completeDoubleElimination,
  getDoubleMatches,
} = require('../src/core/doubleElimination');

function winAll(matches, picks = []) {
  matches.forEach((match, index) => {
    const pick = picks[index] || match.p1;
    applyResultToMatch(match, pick);
  });
}

function bracketRound(state, stageId, bracket, round) {
  return getDoubleMatches(state, stageId)
    .filter(match => match.bracket === bracket && Number(match.doubleEliminationRound) === round)
    .sort((a, b) => (a.table || 0) - (b.table || 0));
}

test('double elimination top4 can produce a champion', () => {
  const stage = {
    id: 'stage_double_elim_1',
    type: 'double_elimination',
    doubleElimination: { bracketSize: 4, grandFinalReset: false },
  };
  const state = freshState({
    players: ['A', 'B', 'C', 'D'],
    tournamentSettings: { stages: [stage] },
    stages: [stage],
    activeStageId: stage.id,
  });

  assert.equal(enterDoubleElimination(state, stage), true);
  assert.equal(getDoubleMatches(state, stage.id).filter(match => match.bracket === 'winners').length, 2);

  winAll(getDoubleMatches(state, stage.id).filter(match => match.bracket === 'winners' && match.doubleEliminationRound === 1), ['A', 'C']);
  assert.equal(advanceDoubleElimination(state, stage), true);
  assert.equal(getDoubleMatches(state, stage.id).some(match => match.bracket === 'losers'), true);

  winAll(getDoubleMatches(state, stage.id).filter(match => match.bracket === 'losers' && match.doubleEliminationRound === 1), ['B']);
  winAll(getDoubleMatches(state, stage.id).filter(match => match.bracket === 'winners' && match.doubleEliminationRound === 2), ['A']);
  assert.equal(advanceDoubleElimination(state, stage), true);

  winAll(getDoubleMatches(state, stage.id).filter(match => match.bracket === 'losers' && match.doubleEliminationRound === 2), ['C']);
  assert.equal(advanceDoubleElimination(state, stage), true);

  const grandFinal = getDoubleMatches(state, stage.id).find(match => match.bracket === 'grand_final');
  assert.equal(grandFinal.p1, 'A');
  assert.equal(grandFinal.p2, 'C');
  applyResultToMatch(grandFinal, 'A');
  assert.equal(advanceDoubleElimination(state, stage), true);
  assert.equal(state.doubleElimination[stage.id].champion, 'A');

  const result = completeDoubleElimination(state, stage);
  assert.equal(result.ok, true);
  assert.deepEqual(state.stageResults[stage.id].advancers, ['A']);
});

test('double elimination top8 creates full winners and losers bracket cadence', () => {
  const stage = {
    id: 'stage_double_elim_8',
    type: 'double_elimination',
    doubleElimination: { bracketSize: 8, grandFinalReset: false },
  };
  const state = freshState({
    players: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    tournamentSettings: { stages: [stage] },
    stages: [stage],
    activeStageId: stage.id,
  });

  assert.equal(enterDoubleElimination(state, stage), true);
  assert.equal(bracketRound(state, stage.id, 'winners', 1).length, 4);

  winAll(bracketRound(state, stage.id, 'winners', 1), ['A', 'D', 'B', 'C']);
  assert.equal(advanceDoubleElimination(state, stage), true);
  assert.equal(bracketRound(state, stage.id, 'winners', 2).length, 2);
  assert.equal(bracketRound(state, stage.id, 'losers', 1).length, 2);

  winAll(bracketRound(state, stage.id, 'losers', 1));
  winAll(bracketRound(state, stage.id, 'winners', 2));
  assert.equal(advanceDoubleElimination(state, stage), true);
  assert.equal(bracketRound(state, stage.id, 'winners', 3).length, 1);
  assert.equal(bracketRound(state, stage.id, 'losers', 2).length, 2);
  assert.deepEqual(
    bracketRound(state, stage.id, 'losers', 2).map(match => [match.p1, match.p2]),
    [['H', 'C'], ['G', 'D']],
  );
  assert.equal(getDoubleMatches(state, stage.id).some(match => match.bracket === 'grand_final'), false);

  winAll(bracketRound(state, stage.id, 'losers', 2));
  assert.equal(advanceDoubleElimination(state, stage), true);
  assert.equal(bracketRound(state, stage.id, 'losers', 3).length, 1);

  winAll(bracketRound(state, stage.id, 'winners', 3));
  assert.equal(advanceDoubleElimination(state, stage), false);
  assert.equal(getDoubleMatches(state, stage.id).some(match => match.bracket === 'grand_final'), false);
  winAll(bracketRound(state, stage.id, 'losers', 3));
  assert.equal(advanceDoubleElimination(state, stage), true);
  assert.equal(bracketRound(state, stage.id, 'losers', 4).length, 1);

  winAll(bracketRound(state, stage.id, 'losers', 4));
  assert.equal(advanceDoubleElimination(state, stage), true);
  const grandFinal = getDoubleMatches(state, stage.id).find(match => match.bracket === 'grand_final');
  assert.ok(grandFinal);
  assert.equal(getDoubleMatches(state, stage.id).filter(match => match.bracket === 'winners').length, 7);
  assert.equal(getDoubleMatches(state, stage.id).filter(match => match.bracket === 'losers').length, 6);

  applyResultToMatch(grandFinal, grandFinal.p1);
  assert.equal(advanceDoubleElimination(state, stage), true);
  assert.equal(state.doubleElimination[stage.id].champion, grandFinal.p1);
});

test('double elimination top8 prunes stale pending grand final before losers final is ready', () => {
  const stage = {
    id: 'stage_double_elim_stale_gf',
    type: 'double_elimination',
    doubleElimination: { bracketSize: 8, grandFinalReset: false },
  };
  const state = freshState({
    players: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    tournamentSettings: { stages: [stage] },
    stages: [stage],
    activeStageId: stage.id,
  });

  assert.equal(enterDoubleElimination(state, stage), true);
  winAll(bracketRound(state, stage.id, 'winners', 1), ['A', 'D', 'B', 'C']);
  assert.equal(advanceDoubleElimination(state, stage), true);
  winAll(bracketRound(state, stage.id, 'losers', 1));
  winAll(bracketRound(state, stage.id, 'winners', 2), ['A', 'B']);
  assert.equal(advanceDoubleElimination(state, stage), true);

  state.matches.push(createDoubleMatch({
    stageId: stage.id,
    bracket: 'grand_final',
    round: 1,
    table: 1,
    p1: 'A',
    p2: 'H',
  }));
  winAll(bracketRound(state, stage.id, 'winners', 3), ['A']);
  winAll(bracketRound(state, stage.id, 'losers', 2).slice(0, 1));

  assert.equal(advanceDoubleElimination(state, stage), true);
  assert.equal(getDoubleMatches(state, stage.id).some(match => match.bracket === 'grand_final'), false);
  assert.equal(bracketRound(state, stage.id, 'losers', 2).some(match => !match.done), true);
});

test('double elimination top8 rebuilds stale losers round pairings from old cadence', () => {
  const stage = {
    id: 'stage_double_elim_stale_losers',
    type: 'double_elimination',
    doubleElimination: { bracketSize: 8, grandFinalReset: false },
  };
  const state = freshState({
    players: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    tournamentSettings: { stages: [stage] },
    stages: [stage],
    activeStageId: stage.id,
  });

  assert.equal(enterDoubleElimination(state, stage), true);
  winAll(bracketRound(state, stage.id, 'winners', 1), ['A', 'D', 'B', 'C']);
  assert.equal(advanceDoubleElimination(state, stage), true);
  winAll(bracketRound(state, stage.id, 'losers', 1));
  winAll(bracketRound(state, stage.id, 'winners', 2), ['A', 'B']);
  assert.equal(advanceDoubleElimination(state, stage), true);

  state.matches = state.matches.filter(match => !(match.stageId === stage.id && match.bracket === 'losers' && match.doubleEliminationRound === 2));
  const staleOne = createDoubleMatch({ stageId: stage.id, bracket: 'losers', round: 2, table: 1, p1: 'H', p2: 'G' });
  const staleTwo = createDoubleMatch({ stageId: stage.id, bracket: 'losers', round: 2, table: 2, p1: 'D', p2: 'C' });
  applyResultToMatch(staleOne, 'H');
  state.matches.push(
    staleOne,
    staleTwo,
    createDoubleMatch({ stageId: stage.id, bracket: 'grand_final', round: 1, table: 1, p1: 'A', p2: 'H' }),
  );

  assert.equal(advanceDoubleElimination(state, stage), true);
  assert.deepEqual(
    bracketRound(state, stage.id, 'losers', 2).map(match => [match.p1, match.p2, match.done]),
    [['H', 'C', false], ['G', 'D', false]],
  );
  assert.equal(getDoubleMatches(state, stage.id).some(match => match.bracket === 'grand_final'), false);
  assert.deepEqual(state.doubleElimination[stage.id].eliminated, ['E', 'F']);
});
