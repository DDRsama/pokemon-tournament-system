const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatMatchResult,
  buildTournamentReportData,
  buildPlayerReportData,
} = require('../src/core/reportsData');

test('formatMatchResult handles draw, bye and score', () => {
  assert.equal(formatMatchResult({ draw: true }), '平局');
  assert.equal(formatMatchResult({ p1: 'A', p2: 'BYE', winner: 'A' }), 'A 轮空获胜');
  assert.equal(formatMatchResult({ p1: 'A', p2: 'B', winner: 'A', p1Wins: 2, p2Wins: 1 }), 'A 获胜，2-1');
});

test('buildTournamentReportData includes ranking and live table mark', () => {
  const state = {
    tournamentName: 'Demo',
    swissRanking: [{ rank: 1, player: 'A', wins: 1, draws: 0, losses: 0, points: 3, omw: 0.5, oow: 0.25 }],
    swissMatchHistory: [
      { round: 1, table: 1, p1: 'A', p2: 'B', winner: 'A', done: true, p1RecordBefore: { wins: 0, draws: 0, losses: 0 }, p2RecordBefore: { wins: 0, draws: 0, losses: 0 }, p1Wins: 1, p2Wins: 0, wasLive: true },
    ],
    matches: [],
  };
  const data = buildTournamentReportData(state, new Date('2026-01-01T00:00:00Z'));
  assert.equal(data.tournamentName, 'Demo');
  assert.equal(data.ranking[0].record, '1-0-0');
  assert.equal(data.swissRounds[0].matches[0].tableLabel, '1（直播桌）');
});

test('buildPlayerReportData uses injected player helpers', () => {
  const state = {
    tournamentName: 'Demo',
    swissRanking: [{ rank: 1, player: 'A', wins: 1, draws: 0, losses: 0, points: 3, omw: 0.5, oow: 0.25 }],
    swissMatchHistory: [{ round: 1, table: 1, p1: 'A', p2: 'B', winner: 'A', done: true, p1RecordBefore: { wins: 0, draws: 0, losses: 0 }, p2RecordBefore: { wins: 0, draws: 0, losses: 0 } }],
    matches: [],
  };
  const data = buildPlayerReportData('A', state, {
    buildPlayerView: () => ({ record: { wins: 1, draws: 0, losses: 0, points: 3 } }),
    getPlayerCompletionStatus: () => ({ finished: true, reason: '比赛结束' }),
  });
  assert.equal(data.playerName, 'A');
  assert.equal(data.history.length, 1);
  assert.equal(data.history[0].result, '胜');
});
