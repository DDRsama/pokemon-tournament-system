const test = require('node:test');
const assert = require('node:assert/strict');
const { emptyRecord, getRecordBeforeRound, getRecord, formatRecordLine } = require('../src/core/records');

test('emptyRecord returns zeroed record', () => {
  assert.deepEqual(emptyRecord(), { wins: 0, draws: 0, losses: 0, points: 0 });
});

test('getRecord counts wins draws losses and BYE', () => {
  const state = {
    matches: [
      { done: true, p1: 'A', p2: 'B', winner: 'A', draw: false },
      { done: true, p1: 'A', p2: 'C', winner: null, draw: true },
      { done: true, p1: 'D', p2: 'A', winner: 'D', draw: false },
      { done: true, p1: 'A', p2: 'BYE', winner: 'A', draw: false },
    ],
  };
  assert.deepEqual(getRecord('A', state), { wins: 2, draws: 1, losses: 1, points: 7 });
});

test('getRecordBeforeRound ignores current and future rounds', () => {
  const state = {
    matches: [
      { round: 1, done: true, p1: 'A', p2: 'B', winner: 'A', draw: false },
      { round: 2, done: true, p1: 'A', p2: 'C', winner: 'C', draw: false },
      { round: 2, done: false, p1: 'A', p2: 'D', winner: null, draw: false },
    ],
  };
  assert.deepEqual(getRecordBeforeRound('A', 2, state), { wins: 1, draws: 0, losses: 0, points: 3 });
});

test('formatRecordLine renders compact W-D-L', () => {
  assert.equal(formatRecordLine({ wins: 3, draws: 1, losses: 2 }), '3-1-2');
});
