const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatMatchResult,
  formatReportPhaseLabel,
  buildTournamentReportData,
  buildPlayerReportData,
} = require('../src/core/reportsData');

test('formatMatchResult handles draw, bye and score', () => {
  assert.equal(formatMatchResult({ draw: true }), '平局');
  assert.equal(formatMatchResult({ p1: 'A', p2: 'BYE', winner: 'A' }), 'A 轮空获胜');
  assert.equal(formatMatchResult({ p1: 'A', p2: 'B', winner: 'A', p1Wins: 2, p2Wins: 1 }), 'A 获胜，2-1');
});

test('formatReportPhaseLabel hides internal bracket labels', () => {
  assert.equal(formatReportPhaseLabel('Round of 16'), '十六强赛');
  assert.equal(formatReportPhaseLabel('Quarter Finals'), '四分之一决赛');
  assert.equal(formatReportPhaseLabel('Semi Finals'), '半决赛');
  assert.equal(formatReportPhaseLabel('Bronze Match'), '季军赛');
  assert.equal(formatReportPhaseLabel('Finals'), '决赛');
  assert.equal(formatReportPhaseLabel('grand_final'), '总决赛');
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
  assert.equal(data.swissRounds[0].label, '瑞士轮第 1 轮');
  assert.equal(data.swissRounds[0].matches[0].tableLabel, '1（直播桌）');
});

test('buildTournamentReportData includes generic elimination rounds', () => {
  const state = {
    tournamentName: 'Demo',
    swissRanking: [],
    stages: [
      { id: 'stage_double_elim_1', name: '双败阶段', type: 'double_elimination', role: 'finals', matchRules: { bestOf: 3, scoreMode: 'games', allowDraw: false } },
    ],
    matches: [
      { id: 'de-gf', stageId: 'stage_double_elim_1', stagePhase: 'double_elimination', bracket: 'grand_final', table: 1, p1: 'A', p2: 'B', winner: 'A', done: true, p1Wins: 2, p2Wins: 0 },
    ],
    stageResults: {
      stage_double_elim_1: { standings: [{ rank: 1, player: 'A' }, { rank: 2, player: 'B' }] },
    },
  };
  const data = buildTournamentReportData(state, new Date('2026-01-01T00:00:00Z'));
  assert.equal(data.top8Rounds.some(round => round.label === '总决赛'), true);
  assert.equal(data.top8Rounds[0].matches[0].result, 'A 获胜，2-0');
  assert.equal(data.stages[0].name, '双败阶段');
  assert.equal(data.stageRounds[0].matches[0].phaseLabel, '总决赛');
});

test('buildTournamentReportData includes top16 round of 16 matches', () => {
  const state = {
    tournamentName: 'Demo',
    phase: 'top8',
    top8: Array.from({ length: 16 }, (_, index) => `P${index + 1}`),
    stages: [
      { id: 'stage_top_cut_1', name: '十六强淘汰赛', type: 'single_elimination', role: 'finals', matchRules: { bestOf: 3, scoreMode: 'games', allowDraw: false }, elimination: { bracketSize: 16, bronzeMatch: true } },
    ],
    activeStageId: 'stage_top_cut_1',
    matches: [
      { id: 'r16-1', stageId: 'stage_top_cut_1', phase: 'Round of 16', table: 1, p1: 'P1', p2: 'P16', winner: 'P1', done: true, p1Wins: 2, p2Wins: 0 },
      { id: 'qf-1', stageId: 'stage_top_cut_1', phase: 'Quarter Finals', table: 1, p1: 'P1', p2: 'P8', winner: null, done: false, p1Wins: 0, p2Wins: 0 },
    ],
  };
  const data = buildTournamentReportData(state, new Date('2026-01-01T00:00:00Z'));
  assert.equal(data.top8Rounds[0].label, '十六强赛');
  assert.equal(data.top8Rounds[0].matches[0].tableLabel, '1');
  assert.equal(data.top8Rounds[0].matches[0].result, 'P1 获胜，2-0');
  assert.equal(data.top8Rounds[1].label, '四分之一决赛');
});

test('buildTournamentReportData includes 3.0 settings stages and point awards', () => {
  const state = {
    tournamentName: 'Demo',
    tournamentSettings: {
      presetId: 'groups_top_cut',
      game: 'vgc',
      entrantType: 'team',
    },
    stages: [
      { id: 'stage_groups_1', name: '小组赛', type: 'groups', role: 'qualification', matchRules: { bestOf: 1, scoreMode: 'match', allowDraw: true } },
    ],
    activeStageId: 'stage_groups_1',
    matches: [
      { id: 'g1', stageId: 'stage_groups_1', groupLabel: 'A组', table: 1, p1: 'A', p2: 'B', winner: 'A', done: true },
    ],
    pointAwards: [
      { rank: 1, displayName: 'A', points: 31, participationPoints: 1, placementPoints: 30, multiplier: 1, pointsProfileId: 'points_1' },
    ],
  };
  const data = buildTournamentReportData(state, new Date('2026-01-01T00:00:00Z'));
  assert.equal(data.settings.presetId, 'groups_top_cut');
  assert.equal(data.settings.entrantType, '团队赛');
  assert.equal(data.stages[0].rules, 'BO1 / 胜负 / 允许平局');
  assert.equal(data.stageRounds[0].label, '小组赛');
  assert.equal(data.pointAwards[0].points, 31);
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

test('buildPlayerReportData includes non-swiss stage history', () => {
  const state = {
    tournamentName: 'Demo',
    swissRanking: [],
    matches: [
      { id: 'g1', stageId: 'stage_groups_1', groupLabel: 'A组', table: 1, p1: 'A', p2: 'B', winner: 'A', done: true, p1Wins: 1, p2Wins: 0 },
    ],
  };
  const data = buildPlayerReportData('A', state, {
    buildPlayerView: () => ({ record: { wins: 1, draws: 0, losses: 0, points: 3 } }),
    getPlayerCompletionStatus: () => ({ finished: true, reason: '比赛结束' }),
  });
  assert.equal(data.history.length, 1);
  assert.equal(data.history[0].stage, 'A组');
});

test('buildPlayerReportData keeps group history after elimination finishes', () => {
  const state = {
    tournamentName: 'Demo',
    phase: 'done',
    swissRanking: [],
    groupMatchHistory: [
      { id: 'g1', stageId: 'stage_groups_1', stagePhase: 'groups', groupLabel: 'A组', table: 1, p1: 'A', p2: 'B', winner: 'A', done: true, p1Wins: 1, p2Wins: 0 },
    ],
    matches: [
      { id: 'final', stageId: 'stage_top_cut_1', phase: 'Finals', table: 1, p1: 'A', p2: 'C', winner: 'A', done: true, p1Wins: 2, p2Wins: 1 },
    ],
  };
  const data = buildPlayerReportData('A', state, {
    buildPlayerView: () => ({ record: { wins: 2, draws: 0, losses: 0, points: 6 } }),
    getPlayerCompletionStatus: () => ({ finished: true, reason: '冠军', award: '冠军' }),
  });

  assert.deepEqual(data.history.map(item => item.stage), ['A组', '决赛']);
  assert.deepEqual(data.history.map(item => item.opponent), ['B', 'C']);
});
