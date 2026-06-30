const { emptyRecord, formatRecordLine } = require('./records');
const { usesGameScore } = require('./rules');
const { getEliminationPhaseOrderForState } = require('./top8');

function formatBeijingDateTime(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function getSwissHistoryForReport(state = {}) {
  const swissMatches = (state.swissMatchHistory && state.swissMatchHistory.length > 0)
    ? state.swissMatchHistory
    : (state.matches || []).filter(match => typeof match.round === 'number');
  const rounds = [...new Set(swissMatches.map(match => match.round))].sort((a, b) => a - b);
  return rounds.map(round => ({
    kind: 'swiss',
    label: `瑞士轮第 ${round} 轮`,
    matches: swissMatches.filter(match => match.round === round).sort((a, b) => (a.table || 0) - (b.table || 0)),
  }));
}

function formatReportPhaseLabel(value) {
  const label = String(value || '').trim();
  if (!label) return '';
  const fixed = {
    winners: '胜者组',
    losers: '败者组',
    grand_final: '总决赛',
    grand_final_reset: '总决赛重置局',
    'Round of 32': '三十二强赛',
    'Round of 16': '十六强赛',
    'Quarter Finals': '四分之一决赛',
    'Semi Finals': '半决赛',
    'Bronze Match': '季军赛',
    Finals: '决赛',
  };
  if (fixed[label]) return fixed[label];
  const roundOf = label.match(/^Round of (\d+)$/i);
  if (roundOf) return `${roundOf[1]} 强赛`;
  return label;
}

function getTop8HistoryForReport(state = {}) {
  const phases = [
    ...getEliminationPhaseOrderForState(state),
    'winners',
    'losers',
    'grand_final',
  ];
  return phases
    .map(phase => ({
      kind: 'elimination',
      label: formatReportPhaseLabel(phase),
      matches: (state.matches || []).filter(match => match.phase === phase || match.bracket === phase).sort((a, b) => (a.table || 0) - (b.table || 0)),
    }))
    .filter(group => group.matches.length > 0);
}

function stageTypeLabel(type) {
  return {
    swiss: '瑞士轮',
    groups: '小组赛',
    group_round_robin: '小组循环',
    single_elimination: '单败淘汰',
    double_elimination: '双败淘汰',
  }[type] || type || '阶段';
}

function formatMatchRules(rules = {}) {
  const bestOf = rules.bestOf ? `BO${rules.bestOf}` : 'BO-';
  const scoreMode = usesGameScore(rules) ? '局分' : '胜负';
  const draw = rules.allowDraw ? '允许平局' : '不允许平局';
  return `${bestOf} / ${scoreMode} / ${draw}`;
}

function buildSettingsSummary(state = {}) {
  const settings = state.tournamentSettings || {};
  return {
    presetId: settings.presetId || '-',
    game: settings.game || '-',
    entrantType: settings.entrantType === 'team' ? '团队赛' : '个人赛',
  };
}

function buildStageSummary(state = {}) {
  const stages = Array.isArray(state.stages) && state.stages.length > 0
    ? state.stages
    : Array.isArray(state.tournamentSettings?.stages) ? state.tournamentSettings.stages : [];
  return stages.map((stage, index) => {
    const result = state.stageResults && stage.id ? state.stageResults[stage.id] : null;
    return {
      order: index + 1,
      id: stage.id || '',
      name: stage.name || stage.id || `阶段 ${index + 1}`,
      type: stageTypeLabel(stage.type),
      role: stage.role || '-',
      rules: formatMatchRules(stage.matchRules || {}),
      advancement: stage.advancement?.targetStageId
        ? `晋级至 ${stage.advancement.targetStageId}`
        : stage.advancement?.mode || '-',
      status: result ? '已完成' : (state.activeStageId === stage.id ? '进行中' : '未完成'),
    };
  });
}

function getStageHistoryForReport(state = {}) {
  const stages = Array.isArray(state.stages) && state.stages.length > 0
    ? state.stages
    : Array.isArray(state.tournamentSettings?.stages) ? state.tournamentSettings.stages : [];
  const stageIds = new Set(stages.map(stage => stage.id).filter(Boolean));
  const matchesById = new Map();
  for (const match of [
    ...(Array.isArray(state.groupMatchHistory) ? state.groupMatchHistory : []),
    ...(Array.isArray(state.matches) ? state.matches : []),
  ]) {
    if (match && match.id) matchesById.set(match.id, match);
  }
  const matches = [...matchesById.values()];
  const groups = [];

  for (const stage of stages) {
    if (!stage || stage.type === 'swiss') continue;
    const stageMatches = matches
      .filter(match => match.stageId === stage.id)
      .sort((a, b) => (a.groupRound || a.doubleEliminationRound || a.bracketRound || 0) - (b.groupRound || b.doubleEliminationRound || b.bracketRound || 0)
        || String(a.groupLabel || a.phase || a.bracket || '').localeCompare(String(b.groupLabel || b.phase || b.bracket || ''), 'zh-CN')
        || (a.table || 0) - (b.table || 0));
    if (stageMatches.length === 0) continue;
    groups.push({
      kind: stage.type,
      label: stage.name || stage.id,
      matches: stageMatches,
    });
  }

  const uncategorized = matches
    .filter(match => typeof match.round !== 'number' && match.stageId && !stageIds.has(match.stageId))
    .sort((a, b) => String(a.stageId).localeCompare(String(b.stageId), 'zh-CN') || (a.table || 0) - (b.table || 0));
  if (uncategorized.length > 0) {
    groups.push({ kind: 'stage', label: '其他阶段', matches: uncategorized });
  }

  return groups;
}

function formatMatchResult(match = {}) {
  if (match.draw) return '平局';
  if (match.p2 === 'BYE' || match.p1 === 'BYE') return `${match.winner} 轮空获胜`;
  if (match.preMatchDroppedPlayer) {
    const opponent = match.preMatchDroppedPlayer === match.p1 ? match.p2 : match.p1;
    return `${match.preMatchDroppedPlayer} 赛前退赛，${opponent} 判胜`;
  }
  if (match.postMatchDroppedPlayer) {
    return `${match.winner || '-'} 获胜，${match.postMatchDroppedPlayer} 赛后退赛`;
  }
  if (match.winner) {
    if ((match.p1Wins || 0) > 0 || (match.p2Wins || 0) > 0) {
      return `${match.winner} 获胜，${match.p1Wins || 0}-${match.p2Wins || 0}`;
    }
    return `${match.winner} 获胜`;
  }
  return '未完成';
}

function mapHistoryItemForReport(match, playerName) {
  const opponent = match.p1 === playerName ? match.p2 : match.p1;
  const result = match.draw ? '平' : match.winner === playerName ? '胜' : '负';
  const stage = match.groupLabel
    || formatReportPhaseLabel(match.phase || match.bracket)
    || (typeof match.round === 'number' ? `瑞士轮第 ${match.round} 轮` : '对局');
  const beforeRecord = typeof match.round === 'number'
    ? (match.p1 === playerName ? match.p1RecordBefore : match.p2RecordBefore)
    : null;
  return {
    stage,
    table: match.table || null,
    opponent,
    result,
    resultText: formatMatchResult(match),
    wasLive: !!match.wasLive,
    beforeRecord: beforeRecord ? formatRecordLine(beforeRecord) : null,
  };
}

function buildTournamentReportData(state = {}, now = new Date()) {
  const ranking = (state.swissRankingArchive && state.swissRankingArchive.length > 0)
    ? state.swissRankingArchive
    : (state.swissRanking || []);
  return {
    generatedAt: formatBeijingDateTime(now),
    tournamentName: state.tournamentName || '未命名比赛',
    settings: buildSettingsSummary(state),
    stages: buildStageSummary(state),
    ranking: ranking.map(entry => ({
      rank: entry.rank,
      player: entry.player,
      record: `${entry.wins}-${entry.draws}-${entry.losses}`,
      points: entry.points,
      omw: Number(entry.omw || 0).toFixed(3),
      oow: Number(entry.oow || 0).toFixed(3),
      note: entry.dropped ? '退赛' : '',
    })),
    swissRounds: getSwissHistoryForReport(state).map(page => ({
      label: page.label,
      matches: page.matches.map(match => ({
        tableLabel: `${match.table ?? ''}${match.wasLive ? '（直播桌）' : ''}`,
        p1: match.p1 === 'BYE' ? 'BYE' : `${match.p1}（${formatRecordLine(match.p1RecordBefore || emptyRecord())}）`,
        p2: match.p2 === 'BYE' ? 'BYE' : `${match.p2}（${formatRecordLine(match.p2RecordBefore || emptyRecord())}）`,
        result: formatMatchResult(match),
      })),
    })),
    top8Rounds: getTop8HistoryForReport(state).map(group => ({
      label: group.label,
      matches: group.matches.map(match => ({
        tableLabel: `${match.table ?? ''}${match.wasLive ? '（直播桌）' : ''}`,
        p1: match.p1 || '',
        p2: match.p2 || '',
        result: formatMatchResult(match),
      })),
    })),
    stageRounds: getStageHistoryForReport(state).map(group => ({
      label: group.label,
      matches: group.matches.map(match => ({
        tableLabel: `${match.table ?? ''}${match.wasLive ? '（直播桌）' : ''}`,
        phaseLabel: match.groupLabel || formatReportPhaseLabel(match.phase || match.bracket || match.stagePhase),
        p1: match.p1 || '',
        p2: match.p2 || '',
        result: formatMatchResult(match),
      })),
    })),
    pointAwards: (state.pointAwards || []).map(award => ({
      rank: award.rank ?? '',
      displayName: award.displayName || award.profileId || '',
      points: award.points || 0,
      participationPoints: award.participationPoints || 0,
      placementPoints: award.placementPoints || 0,
      multiplier: award.multiplier || 1,
      pointsProfileId: award.pointsProfileId || '',
    })),
  };
}

function buildPlayerReportData(playerName, state = {}, helpers = {}, now = new Date()) {
  const playerView = helpers.buildPlayerView(playerName);
  const completion = helpers.getPlayerCompletionStatus(playerName, state);
  if (!completion.finished) return null;
  const standings = (state.swissRankingArchive && state.swissRankingArchive.length > 0)
    ? state.swissRankingArchive
    : (state.swissRanking || []);
  const standing = standings.find(entry => entry.player === playerName) || completion.standing || null;
  const swissSource = (state.swissMatchHistory && state.swissMatchHistory.length > 0)
    ? state.swissMatchHistory
    : (state.swissMatchesArchive && state.swissMatchesArchive.length > 0)
      ? state.swissMatchesArchive
      : (state.matches || []).filter(match => typeof match.round === 'number');
  const swissHistory = swissSource
    .filter(match => match.done && (match.p1 === playerName || match.p2 === playerName))
    .map(match => mapHistoryItemForReport(match, playerName));
  const top8HistorySource = [
    ...(Array.isArray(state.groupMatchHistory) ? state.groupMatchHistory : []),
    ...(Array.isArray(state.matches) ? state.matches : []),
  ];
  const top8History = [...new Map(top8HistorySource.map(match => [match.id, match])).values()]
    .filter(match => typeof match.round !== 'number' && match.done && (match.p1 === playerName || match.p2 === playerName))
    .map(match => mapHistoryItemForReport(match, playerName));
  return {
    generatedAt: formatBeijingDateTime(now),
    tournamentName: state.tournamentName || '未命名比赛',
    playerName,
    finalStatus: completion.reason || completion.award || '比赛结束',
    finalAward: completion.award || '',
    record: formatRecordLine(playerView.record),
    points: playerView.record ? playerView.record.points || 0 : 0,
    swissRank: standing ? standing.rank : null,
    omw: standing ? Number(standing.omw || 0).toFixed(3) : null,
    oow: standing ? Number(standing.oow || 0).toFixed(3) : null,
    history: [...swissHistory, ...top8History],
  };
}

module.exports = {
  formatBeijingDateTime,
  getSwissHistoryForReport,
  getTop8HistoryForReport,
  getStageHistoryForReport,
  formatReportPhaseLabel,
  buildSettingsSummary,
  buildStageSummary,
  formatMatchResult,
  mapHistoryItemForReport,
  buildTournamentReportData,
  buildPlayerReportData,
};
