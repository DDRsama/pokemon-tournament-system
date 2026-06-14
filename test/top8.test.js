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
  isTournamentFinished,
  getTop8AwardForPlayer,
} = require('../src/core/top8');

test('createTop8QuarterFinals uses expected seeding', () => {
  const matches = createTop8QuarterFinals(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
  assert.deepEqual(matches.map(match => [match.p1, match.p2]), [
    ['P1', 'P8'],
    ['P4', 'P5'],
    ['P2', 'P7'],
    ['P3', 'P6'],
  ]);
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

test('applyResultToMatch only accepts match players', () => {
  const match = { p1: 'A', p2: 'B' };
  assert.equal(applyResultToMatch(match, 'C'), false);
  assert.equal(match.done, undefined);
  assert.equal(applyResultToMatch(match, 'B'), true);
  assert.equal(match.winner, 'B');
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
