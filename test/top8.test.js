const test = require('node:test');
const assert = require('node:assert/strict');
const { freshState } = require('../src/core/state');
const {
  createTop8QuarterFinals,
  enterTop8,
  validateBo3Score,
  applyBo3ScoreToMatch,
  applyResultToMatch,
  advanceBracket,
  createSingleEliminationBracket,
  enterSingleElimination,
  advanceSingleEliminationBracket,
  isTournamentFinished,
  isSingleEliminationStageFinished,
  isSingleEliminationBracketShapeValid,
  repairSingleEliminationBracketShape,
  getEliminationPhaseOrderForState,
  getTop8AwardForPlayer,
} = require('../src/core/top8');

test('createTop8QuarterFinals uses expected seeding', () => {
  const matches = createTop8QuarterFinals(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], 'stage_top_cut_1');
  assert.deepEqual(matches.map(match => [match.p1, match.p2]), [
    ['P1', 'P8'],
    ['P4', 'P5'],
    ['P2', 'P7'],
    ['P3', 'P6'],
  ]);
  assert.equal(matches.every(match => match.stageId === 'stage_top_cut_1'), true);
});

test('enterTop8 initializes top8 state', () => {
  const state = freshState({ pendingTop8: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] });
  assert.equal(enterTop8(state), true);
  assert.equal(state.phase, 'top8');
  assert.equal(state.matches.length, 4);
  assert.equal(state.overlayState, 'top8-bracket');
});

test('advanceBracket creates semifinals after quarterfinal winners', () => {
  const state = freshState({ phase: 'top8', pendingTop8: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] });
  enterTop8(state);
  applyBo3ScoreToMatch(state.matches.find(match => match.id === 'qf1'), 2, 0);
  applyBo3ScoreToMatch(state.matches.find(match => match.id === 'qf2'), 0, 2);
  assert.equal(advanceBracket(state), true);
  const sf1 = state.matches.find(match => match.id === 'sf1');
  assert.equal(sf1.p1, 'P1');
  assert.equal(sf1.p2, 'P5');
  assert.equal(sf1.stageId, 'stage_top_cut_1');
});

test('advanceBracket creates final and bronze after semifinals', () => {
  const state = freshState({ phase: 'top8', matches: [
    { id: 'sf1', p1: 'A', p2: 'B', phase: 'Semi Finals', done: true, winner: 'A' },
    { id: 'sf2', p1: 'C', p2: 'D', phase: 'Semi Finals', done: true, winner: 'D' },
  ] });
  assert.equal(advanceBracket(state), true);
  const final = state.matches.find(match => match.id === 'final');
  const bronze = state.matches.find(match => match.id === 'bronze');
  assert.equal(final.p1, 'A');
  assert.equal(final.p2, 'D');
  assert.equal(bronze.p1, 'B');
  assert.equal(bronze.p2, 'C');
  assert.equal(final.stageId, 'stage_top_cut_1');
  assert.equal(bronze.stageId, 'stage_top_cut_1');
});

test('generic single elimination supports top4 stage', () => {
  const stage = {
    id: 'stage_top4_1',
    type: 'single_elimination',
    elimination: { bracketSize: 4, bronzeMatch: true },
  };
  const bracket = createSingleEliminationBracket(['P1', 'P2', 'P3', 'P4'], stage);
  assert.equal(bracket.length, 2);
  assert.equal(bracket.every(match => match.stageId === 'stage_top4_1'), true);
  assert.equal(bracket[0].phase, 'Semi Finals');

  const state = freshState({
    players: ['P1', 'P2', 'P3', 'P4'],
    activeStageId: 'stage_top4_1',
    tournamentSettings: { stages: [stage] },
  });
  assert.equal(enterSingleElimination(state, stage), true);
  assert.equal(state.matches.length, 2);
  applyResultToMatch(state.matches[0], state.matches[0].p1);
  applyResultToMatch(state.matches[1], state.matches[1].p2);
  assert.equal(advanceSingleEliminationBracket(state), true);
  assert.equal(state.matches.some(match => match.phase === 'Finals'), true);
  assert.equal(state.matches.some(match => match.phase === 'Bronze Match'), true);
});

test('stage_top_cut_1 supports top4 without falling back to legacy top8 bracket', () => {
  const stage = {
    id: 'stage_top_cut_1',
    type: 'single_elimination',
    elimination: { bracketSize: 4, bronzeMatch: true },
  };
  const state = freshState({
    pendingTop8: ['P1', 'P2', 'P3', 'P4'],
    activeStageId: stage.id,
    tournamentSettings: { stages: [stage] },
    stages: [stage],
  });

  assert.equal(enterSingleElimination(state, stage), true);
  assert.equal(state.matches.length, 2);
  assert.equal(state.matches.every(match => match.phase === 'Semi Finals'), true);
  assert.deepEqual(state.matches.map(match => [match.p1, match.p2]), [['P1', 'P4'], ['P2', 'P3']]);
  assert.equal(state.matches.some(match => String(match.id).startsWith('qf')), false);
});

test('stage_top_cut_1 supports top16 first round and advances to quarterfinals', () => {
  const stage = {
    id: 'stage_top_cut_1',
    type: 'single_elimination',
    elimination: { bracketSize: 16, bronzeMatch: true },
  };
  const entrants = Array.from({ length: 16 }, (_, index) => `P${index + 1}`);
  const state = freshState({
    pendingTop8: entrants,
    activeStageId: stage.id,
    tournamentSettings: { stages: [stage] },
    stages: [stage],
  });

  assert.equal(enterSingleElimination(state, stage), true);
  assert.equal(state.overlayState, 'overview');
  assert.equal(state.matches.length, 8);
  assert.equal(state.matches.every(match => match.phase === 'Round of 16'), true);
  assert.equal(state.matches.every(match => match.stageId === 'stage_top_cut_1'), true);
  assert.equal(state.matches.some(match => String(match.id).startsWith('qf')), false);

  state.matches.forEach(match => applyResultToMatch(match, match.p1));
  assert.equal(advanceSingleEliminationBracket(state), true);
  const quarterfinals = state.matches.filter(match => match.phase === 'Quarter Finals');
  assert.equal(quarterfinals.length, 4);
  assert.deepEqual(quarterfinals.map(match => [match.p1, match.p2]), [
    ['P1', 'P8'],
    ['P4', 'P5'],
    ['P2', 'P7'],
    ['P3', 'P6'],
  ]);
});

test('single elimination repair rebuilds stale top4 quarterfinal shell', () => {
  const stage = {
    id: 'stage_top_cut_1',
    type: 'single_elimination',
    entrySource: { type: 'previous_stage_advancers', fromStageId: 'stage_swiss_1' },
    elimination: { bracketSize: 4, bronzeMatch: true },
  };
  const state = freshState({
    phase: 'top8',
    top8: ['P1', 'P2', 'P3', 'P4'],
    activeStageId: stage.id,
    stages: [stage],
    tournamentSettings: { stages: [stage] },
    stageResults: {
      stage_swiss_1: { advancers: ['P1', 'P2', 'P3', 'P4'] },
    },
    matches: [
      { id: 'qf1', stageId: stage.id, table: 1, phase: 'Quarter Finals', bracketRound: 1, p1: 'P1', p2: null, done: true, winner: 'P1', p1Wins: 2, p2Wins: 0 },
      { id: 'qf2', stageId: stage.id, table: 2, phase: 'Quarter Finals', bracketRound: 1, p1: 'P4', p2: null, done: false, winner: null, p1Wins: 0, p2Wins: 0 },
      { id: 'qf3', stageId: stage.id, table: 3, phase: 'Quarter Finals', bracketRound: 1, p1: 'P2', p2: null, done: false, winner: null, p1Wins: 0, p2Wins: 0 },
      { id: 'qf4', stageId: stage.id, table: 4, phase: 'Quarter Finals', bracketRound: 1, p1: 'P3', p2: null, done: false, winner: null, p1Wins: 0, p2Wins: 0 },
      { id: 'sf1', stageId: stage.id, table: 1, phase: 'Semi Finals', bracketRound: 2, p1: 'P1', p2: null, done: false, winner: null, p1Wins: 0, p2Wins: 0 },
    ],
    currentLiveMatch: { id: 'qf2' },
    lastResult: { winner: 'P1' },
    overlayState: 'top8-bracket',
  });

  assert.equal(isSingleEliminationBracketShapeValid(state, stage), false);
  assert.equal(repairSingleEliminationBracketShape(state, stage), true);
  assert.equal(isSingleEliminationBracketShapeValid(state, stage), true);
  assert.equal(state.matches.length, 2);
  assert.equal(state.matches.every(match => match.phase === 'Semi Finals'), true);
  assert.deepEqual(state.matches.map(match => [match.p1, match.p2]), [['P1', 'P4'], ['P2', 'P3']]);
  assert.equal(state.currentLiveMatch, null);
  assert.equal(state.lastResult, null);
  assert.equal(state.overlayState, 'overview');
});

test('elimination phase order prefers actual cut size over stale default stage config', () => {
  const state = freshState({
    phase: 'top8',
    top8: ['P1', 'P2', 'P3', 'P4'],
    activeStageId: 'stage_top_cut_1',
  });
  assert.deepEqual(getEliminationPhaseOrderForState(state), ['Semi Finals', 'Bronze Match', 'Finals']);
});

test('single elimination completion follows bronze setting', () => {
  const stage = {
    id: 'stage_top4_1',
    type: 'single_elimination',
    elimination: { bracketSize: 4, bronzeMatch: false },
  };
  const state = freshState({
    players: ['P1', 'P2', 'P3', 'P4'],
    activeStageId: stage.id,
    tournamentSettings: { stages: [stage] },
  });
  assert.equal(enterSingleElimination(state, stage), true);
  state.matches.forEach(match => applyResultToMatch(match, match.p1));
  assert.equal(advanceSingleEliminationBracket(state), true);
  const final = state.matches.find(match => match.phase === 'Finals');
  applyResultToMatch(final, final.p1);
  assert.equal(isSingleEliminationStageFinished(state, stage), true);
});

test('BO3 score validation rejects illegal scores', () => {
  assert.deepEqual(validateBo3Score(1, 0), { p1Wins: 1, p2Wins: 0 });
  assert.deepEqual(validateBo3Score(2, 1), { p1Wins: 2, p2Wins: 1 });
  assert.equal(validateBo3Score(2, 2), null);
  assert.equal(validateBo3Score(3, 0), null);
  assert.equal(validateBo3Score(-1, 0), null);
  assert.equal(validateBo3Score(Number.NaN, 0), null);
});

test('BO3 1-0 does not finish, 2-0 and 2-1 finish', () => {
  const match = { p1: 'A', p2: 'B' };
  assert.equal(applyBo3ScoreToMatch(match, 1, 0), true);
  assert.equal(match.done, false);
  assert.equal(applyBo3ScoreToMatch(match, 2, 0), true);
  assert.equal(match.done, true);
  assert.equal(match.winner, 'A');

  const match2 = { p1: 'A', p2: 'B' };
  assert.equal(applyBo3ScoreToMatch(match2, 1, 2), true);
  assert.equal(match2.done, true);
  assert.equal(match2.winner, 'B');
});

test('illegal BO3 score does not mutate match', () => {
  const match = { p1: 'A', p2: 'B', p1Wins: 1, p2Wins: 0, done: false };
  assert.equal(applyBo3ScoreToMatch(match, 2, 2), false);
  assert.equal(match.p1Wins, 1);
  assert.equal(match.p2Wins, 0);
});

test('BO3 score rejects matches waiting for an opponent', () => {
  const match = { p1: 'A', p2: null, p1Wins: 0, p2Wins: 0, done: false };
  assert.equal(applyBo3ScoreToMatch(match, 2, 0), false);
  assert.equal(match.done, false);
  assert.equal(match.winner, undefined);
});

test('applyResultToMatch only accepts match players', () => {
  const match = { p1: 'A', p2: 'B' };
  assert.equal(applyResultToMatch(match, 'C'), false);
  assert.equal(match.done, undefined);
  assert.equal(applyResultToMatch(match, 'B'), true);
  assert.equal(match.winner, 'B');
});

test('applyResultToMatch rejects matches waiting for an opponent', () => {
  const match = { p1: 'A', p2: null };
  assert.equal(applyResultToMatch(match, 'A'), false);
  assert.equal(match.done, undefined);
});

test('advanceBracket repairs pending-opponent results before syncing slots', () => {
  const state = freshState({ phase: 'top8', matches: [
    { id: 'qf1', p1: 'A', p2: 'H', phase: 'Quarter Finals', done: true, winner: 'A', p1Wins: 2, p2Wins: 0 },
    { id: 'qf2', p1: 'D', p2: 'E', phase: 'Quarter Finals', done: true, winner: 'D', p1Wins: 2, p2Wins: 0 },
    { id: 'qf3', p1: 'B', p2: 'G', phase: 'Quarter Finals', done: true, winner: 'B', p1Wins: 2, p2Wins: 0 },
    { id: 'qf4', p1: 'C', p2: 'F', phase: 'Quarter Finals', done: true, winner: 'C', p1Wins: 2, p2Wins: 0 },
    { id: 'sf1', p1: 'A', p2: null, phase: 'Semi Finals', done: true, winner: 'A', p1Wins: 2, p2Wins: 0 },
    { id: 'sf2', p1: 'B', p2: 'C', phase: 'Semi Finals', done: true, winner: 'B', p1Wins: 2, p2Wins: 0 },
    { id: 'final', p1: 'A', p2: null, phase: 'Finals', done: true, winner: 'A', p1Wins: 2, p2Wins: 0 },
  ] });

  assert.equal(advanceBracket(state), true);
  const sf1 = state.matches.find(match => match.id === 'sf1');
  const final = state.matches.find(match => match.id === 'final');
  assert.deepEqual({ p1: sf1.p1, p2: sf1.p2, done: sf1.done, winner: sf1.winner, p1Wins: sf1.p1Wins }, {
    p1: 'A',
    p2: 'D',
    done: false,
    winner: null,
    p1Wins: 0,
  });
  assert.deepEqual({ p1: final.p1, p2: final.p2, done: final.done, winner: final.winner, p1Wins: final.p1Wins }, {
    p1: 'A',
    p2: 'B',
    done: false,
    winner: null,
    p1Wins: 0,
  });
});

test('final plus bronze completion finishes tournament and awards players', () => {
  const state = freshState({ phase: 'top8', matches: [
    { phase: 'Finals', p1: 'A', p2: 'B', winner: 'A', done: true },
    { phase: 'Bronze Match', p1: 'C', p2: 'D', winner: 'C', done: true },
  ] });
  assert.equal(isTournamentFinished(state), true);
  assert.equal(getTop8AwardForPlayer('A', state), 'champion');
  assert.equal(getTop8AwardForPlayer('B', state), 'runner-up');
  assert.equal(getTop8AwardForPlayer('C', state), 'third-place');
  assert.equal(getTop8AwardForPlayer('D', state), 'fourth-place');
});
