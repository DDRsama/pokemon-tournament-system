const { emptyRecord, formatRecordLine } = require('./records');

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
    label: `瑞士轮 Round ${round}`,
    matches: swissMatches.filter(match => match.round === round).sort((a, b) => (a.table || 0) - (b.table || 0)),
  }));
}

function getTop8HistoryForReport(state = {}) {
  const phases = ['Quarter Finals', 'Semi Finals', 'Bronze Match', 'Finals'];
  return phases
    .map(phase => ({
      kind: 'top8',
      label: phase,
      matches: (state.matches || []).filter(match => match.phase === phase).sort((a, b) => (a.table || 0) - (b.table || 0)),
    }))
    .filter(group => group.matches.length > 0);
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
  const stage = match.phase || (typeof match.round === 'number' ? `瑞士轮 Round ${match.round}` : '对局');
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
  const top8History = (state.matches || [])
    .filter(match => match.phase && match.done && (match.p1 === playerName || match.p2 === playerName))
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
  formatMatchResult,
  mapHistoryItemForReport,
  buildTournamentReportData,
  buildPlayerReportData,
};
