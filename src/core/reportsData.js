const { emptyRecord, formatRecordLine } = require('./records');
const { usesGameScore } = require('./rules');
const { getEliminationPhaseOrderForState } = require('./top8');
const { buildFinalPlacements } = require('./finalPlacements');

function normalizeLanguage(language = 'zh-CN') {
  const value = String(language || '').trim().toLowerCase();
  if (value === 'en' || value.startsWith('en-')) return 'en';
  if (value === 'ja' || value === 'jp' || value.startsWith('ja-')) return 'ja';
  return 'zh-CN';
}

const REPORT_TEXT = {
  'zh-CN': {
    locale: 'zh-CN',
    unnamedTournament: '未命名比赛',
    stageDefault: '阶段',
    otherStage: '其他阶段',
    swiss: '瑞士轮',
    scoreGames: '局分',
    scoreMatch: '胜负',
    allowDraw: '允许平局',
    noDraw: '不允许平局',
    teamEvent: '团队赛',
    individualEvent: '个人赛',
    completed: '已完成',
    inProgress: '进行中',
    incomplete: '未完成',
    dropped: '退赛',
    tvMark: '（直播桌）',
    bye: 'BYE',
    noValue: '-',
    playerReportSuffix: '个人战报',
    finalResultFallback: '比赛结束',
    stageTypes: {
      swiss: '瑞士轮',
      groups: '小组赛',
      group_round_robin: '小组循环',
      single_elimination: '单败淘汰',
      double_elimination: '双败淘汰',
    },
    phaseLabels: {
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
    },
    labels: {
      exportedAt: '导出时间：',
      stagesTitle: '赛事阶段',
      finalResultsTitle: '最终成绩',
      swissRankingTitle: '瑞士轮总排名',
      eliminationTitle: '淘汰赛',
      pointAwardsTitle: '积分发放',
      personalHistoryTitle: '个人对局记录',
      order: '顺序',
      stage: '阶段',
      type: '类型',
      rules: '规则',
      status: '状态',
      rank: '名次',
      player: '选手',
      result: '结果',
      record: '战绩',
      points: '积分',
      omw: '对手胜率',
      oow: '对手的对手胜率',
      note: '备注',
      table: '桌号',
      playerA: '选手A',
      playerB: '选手B',
      participationPoints: '参赛分',
      placementPoints: '名次分',
      multiplier: '倍率',
      totalPoints: '总分',
      item: '项目',
      content: '内容',
      finalResult: '最终结果',
      swissRank: '瑞士轮排名',
      opponent: '对手',
      beforeRecord: '本轮前战绩',
      detail: '详情',
    },
    swissRound: round => `瑞士轮第 ${round} 轮`,
    stageName: index => `阶段 ${index}`,
    advanceTo: id => `晋级至 ${id}`,
    tableLabel: (table, live) => `${table ?? ''}${live ? '（直播桌）' : ''}`,
    withRecord: (player, record) => `${player}（${record}）`,
    byeWin: winner => `${winner} 轮空获胜`,
    preDropWin: (dropped, opponent) => `${dropped} 赛前退赛，${opponent} 判胜`,
    postDropWin: (winner, dropped) => `${winner || '-'} 获胜，${dropped} 赛后退赛`,
    winScore: (winner, score) => `${winner} 获胜，${score}`,
    win: winner => `${winner} 获胜`,
    shortResult: result => ({ win: '胜', draw: '平', loss: '负' }[result] || result),
  },
  en: {
    locale: 'en-US',
    unnamedTournament: 'Untitled Tournament',
    stageDefault: 'Stage',
    otherStage: 'Other Stages',
    swiss: 'Swiss',
    scoreGames: 'Game Score',
    scoreMatch: 'Match Result',
    allowDraw: 'Draws Allowed',
    noDraw: 'No Draws',
    teamEvent: 'Team Event',
    individualEvent: 'Individual Event',
    completed: 'Completed',
    inProgress: 'In Progress',
    incomplete: 'Incomplete',
    dropped: 'Dropped',
    tvMark: ' (TV)',
    bye: 'BYE',
    noValue: '-',
    playerReportSuffix: 'Player Report',
    finalResultFallback: 'Tournament Finished',
    stageTypes: {
      swiss: 'Swiss',
      groups: 'Group Stage',
      group_round_robin: 'Group Round Robin',
      single_elimination: 'Single Elimination',
      double_elimination: 'Double Elimination',
    },
    phaseLabels: {
      winners: 'Winners Bracket',
      losers: 'Losers Bracket',
      grand_final: 'Grand Final',
      grand_final_reset: 'Grand Final Reset',
      'Round of 32': 'Round of 32',
      'Round of 16': 'Round of 16',
      'Quarter Finals': 'Quarterfinals',
      'Semi Finals': 'Semifinals',
      'Bronze Match': 'Third Place Match',
      Finals: 'Finals',
    },
    labels: {
      exportedAt: 'Exported at: ',
      stagesTitle: 'Tournament Stages',
      finalResultsTitle: 'Final Results',
      swissRankingTitle: 'Final Swiss Standings',
      eliminationTitle: 'Playoffs',
      pointAwardsTitle: 'Point Awards',
      personalHistoryTitle: 'Match History',
      order: 'Order',
      stage: 'Stage',
      type: 'Type',
      rules: 'Rules',
      status: 'Status',
      rank: 'Rank',
      player: 'Player',
      result: 'Result',
      record: 'Record',
      points: 'Points',
      omw: 'OMW',
      oow: 'OOW',
      note: 'Note',
      table: 'Table',
      playerA: 'Player A',
      playerB: 'Player B',
      participationPoints: 'Participation',
      placementPoints: 'Placement',
      multiplier: 'Multiplier',
      totalPoints: 'Total',
      item: 'Item',
      content: 'Content',
      finalResult: 'Final Result',
      swissRank: 'Swiss Rank',
      opponent: 'Opponent',
      beforeRecord: 'Record Before',
      detail: 'Details',
    },
    swissRound: round => `Swiss Round ${round}`,
    stageName: index => `Stage ${index}`,
    advanceTo: id => `Advance to ${id}`,
    tableLabel: (table, live) => `${table ?? ''}${live ? ' (TV)' : ''}`,
    withRecord: (player, record) => `${player} (${record})`,
    byeWin: winner => `${winner} won by bye`,
    preDropWin: (dropped, opponent) => `${dropped} dropped before the match; ${opponent} wins by ruling`,
    postDropWin: (winner, dropped) => `${winner || '-'} won; ${dropped} dropped after the match`,
    winScore: (winner, score) => `${winner} won, ${score}`,
    win: winner => `${winner} won`,
    shortResult: result => ({ win: 'W', draw: 'D', loss: 'L' }[result] || result),
  },
  ja: {
    locale: 'ja-JP',
    unnamedTournament: '名称未設定の大会',
    stageDefault: 'ステージ',
    otherStage: 'その他のステージ',
    swiss: 'スイスドロー',
    scoreGames: 'ゲームスコア',
    scoreMatch: '勝敗',
    allowDraw: '引き分けあり',
    noDraw: '引き分けなし',
    teamEvent: 'チーム戦',
    individualEvent: '個人戦',
    completed: '完了',
    inProgress: '進行中',
    incomplete: '未完了',
    dropped: 'ドロップ',
    tvMark: '（配信卓）',
    bye: 'BYE',
    noValue: '-',
    playerReportSuffix: '個人レポート',
    finalResultFallback: '大会終了',
    stageTypes: {
      swiss: 'スイスドロー',
      groups: 'グループステージ',
      group_round_robin: 'グループ総当たり',
      single_elimination: 'シングルエリミネーション',
      double_elimination: 'ダブルエリミネーション',
    },
    phaseLabels: {
      winners: '勝者側',
      losers: '敗者側',
      grand_final: 'グランドファイナル',
      grand_final_reset: 'グランドファイナルリセット',
      'Round of 32': 'ラウンド32',
      'Round of 16': 'ラウンド16',
      'Quarter Finals': '準々決勝',
      'Semi Finals': '準決勝',
      'Bronze Match': '3位決定戦',
      Finals: '決勝',
    },
    labels: {
      exportedAt: '出力日時：',
      stagesTitle: '大会ステージ',
      finalResultsTitle: '最終成績',
      swissRankingTitle: 'スイス最終順位',
      eliminationTitle: '決勝トーナメント',
      pointAwardsTitle: 'ポイント付与',
      personalHistoryTitle: '対戦履歴',
      order: '順序',
      stage: 'ステージ',
      type: '形式',
      rules: 'ルール',
      status: '状態',
      rank: '順位',
      player: 'プレイヤー',
      result: '結果',
      record: '成績',
      points: 'ポイント',
      omw: 'OMW',
      oow: 'OOW',
      note: '備考',
      table: '卓',
      playerA: 'プレイヤーA',
      playerB: 'プレイヤーB',
      participationPoints: '参加点',
      placementPoints: '順位点',
      multiplier: '倍率',
      totalPoints: '合計',
      item: '項目',
      content: '内容',
      finalResult: '最終結果',
      swissRank: 'スイス順位',
      opponent: '対戦相手',
      beforeRecord: '対戦前成績',
      detail: '詳細',
    },
    swissRound: round => `スイス 第 ${round} ラウンド`,
    stageName: index => `ステージ ${index}`,
    advanceTo: id => `${id}へ進出`,
    tableLabel: (table, live) => `${table ?? ''}${live ? '（配信卓）' : ''}`,
    withRecord: (player, record) => `${player}（${record}）`,
    byeWin: winner => `${winner} BYE勝利`,
    preDropWin: (dropped, opponent) => `${dropped} が試合前ドロップ、${opponent} の裁定勝ち`,
    postDropWin: (winner, dropped) => `${winner || '-'} 勝利、${dropped} が試合後ドロップ`,
    winScore: (winner, score) => `${winner} 勝利、${score}`,
    win: winner => `${winner} 勝利`,
    shortResult: result => ({ win: '勝', draw: '分', loss: '負' }[result] || result),
  },
};

const KNOWN_STAGE_NAMES = {
  en: [
    [/^瑞士轮阶段$/, 'Swiss Stage'],
    [/^单败淘汰阶段$/, 'Single Elimination Stage'],
    [/^双败阶段$/, 'Double Elimination Stage'],
    [/^资格赛：瑞士轮$/, 'Qualifier: Swiss'],
    [/^淘汰赛：单败淘汰$/, 'Playoffs: Single Elimination'],
    [/^淘汰赛：双败淘汰$/, 'Playoffs: Double Elimination'],
    [/^小组赛$/, 'Group Stage'],
    [/^十六强淘汰赛$/, 'Top 16 Playoffs'],
    [/瑞士轮/g, 'Swiss'],
    [/单败淘汰/g, 'Single Elimination'],
    [/双败淘汰/g, 'Double Elimination'],
    [/淘汰赛/g, 'Playoffs'],
    [/资格赛/g, 'Qualifier'],
    [/小组赛/g, 'Group Stage'],
  ],
  ja: [
    [/^瑞士轮阶段$/, 'スイスステージ'],
    [/^单败淘汰阶段$/, 'シングルエリミネーションステージ'],
    [/^双败阶段$/, 'ダブルエリミネーションステージ'],
    [/^资格赛：瑞士轮$/, '予選：スイスドロー'],
    [/^淘汰赛：单败淘汰$/, '決勝：シングルエリミネーション'],
    [/^淘汰赛：双败淘汰$/, '決勝：ダブルエリミネーション'],
    [/^小组赛$/, 'グループステージ'],
    [/^十六强淘汰赛$/, 'トップ16決勝'],
    [/瑞士轮/g, 'スイスドロー'],
    [/单败淘汰/g, 'シングルエリミネーション'],
    [/双败淘汰/g, 'ダブルエリミネーション'],
    [/淘汰赛/g, '決勝'],
    [/资格赛/g, '予選'],
    [/小组赛/g, 'グループステージ'],
  ],
};

const RESULT_LABEL_TRANSLATIONS = {
  en: [
    [/^冠军$/, 'Champion'],
    [/^亚军$/, 'Runner-up'],
    [/^季军$/, 'Third Place'],
    [/^殿军$/, 'Fourth Place'],
    [/^四强$/, 'Top 4'],
    [/^八强$/, 'Top 8'],
    [/^十六强$/, 'Top 16'],
    [/^三十二强$/, 'Top 32'],
    [/^小组出线$/, 'Advanced from Group'],
    [/^(.+)组第\s*(\d+)$/, '$1 Group Place $2'],
    [/^瑞士轮第\s*(\d+)$/, 'Swiss Rank #$1'],
    [/^#(\d+)$/, '#$1'],
  ],
  ja: [
    [/^冠军$/, '優勝'],
    [/^亚军$/, '準優勝'],
    [/^季军$/, '3位'],
    [/^殿军$/, '4位'],
    [/^四强$/, 'トップ4'],
    [/^八强$/, 'トップ8'],
    [/^十六强$/, 'トップ16'],
    [/^三十二强$/, 'トップ32'],
    [/^小组出线$/, 'グループ通過'],
    [/^(.+)组第\s*(\d+)$/, '$1グループ $2位'],
    [/^瑞士轮第\s*(\d+)$/, 'スイス $1位'],
    [/^#(\d+)$/, '#$1'],
  ],
};

function textFor(language = 'zh-CN') {
  return REPORT_TEXT[normalizeLanguage(language)] || REPORT_TEXT['zh-CN'];
}

function localizeKnownStageName(name = '', language = 'zh-CN') {
  const lang = normalizeLanguage(language);
  if (lang === 'zh-CN') return name;
  let next = String(name || '');
  for (const [pattern, replacement] of KNOWN_STAGE_NAMES[lang] || []) {
    if (pattern.test(next)) next = next.replace(pattern, replacement);
  }
  return next;
}

function localizeResultLabel(label = '', language = 'zh-CN') {
  const lang = normalizeLanguage(language);
  let next = String(label || '');
  if (lang === 'zh-CN') return next;
  for (const [pattern, replacement] of RESULT_LABEL_TRANSLATIONS[lang] || []) {
    if (pattern.test(next)) return next.replace(pattern, replacement);
  }
  return next;
}

function formatBeijingDateTime(date = new Date(), language = 'zh-CN') {
  const tx = textFor(language);
  return new Intl.DateTimeFormat(tx.locale, {
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

function getSwissHistoryForReport(state = {}, language = 'zh-CN') {
  const tx = textFor(language);
  const swissMatches = (state.swissMatchHistory && state.swissMatchHistory.length > 0)
    ? state.swissMatchHistory
    : (state.matches || []).filter(match => typeof match.round === 'number');
  const rounds = [...new Set(swissMatches.map(match => match.round))].sort((a, b) => a - b);
  return rounds.map(round => ({
    kind: 'swiss',
    label: tx.swissRound(round),
    matches: swissMatches.filter(match => match.round === round).sort((a, b) => (a.table || 0) - (b.table || 0)),
  }));
}

function formatReportPhaseLabel(value, language = 'zh-CN') {
  const tx = textFor(language);
  const label = String(value || '').trim();
  if (!label) return '';
  if (tx.phaseLabels[label]) return tx.phaseLabels[label];
  const roundOf = label.match(/^Round of (\d+)$/i);
  if (roundOf) {
    if (normalizeLanguage(language) === 'en') return `Round of ${roundOf[1]}`;
    if (normalizeLanguage(language) === 'ja') return `ラウンド${roundOf[1]}`;
    return `${roundOf[1]} 强赛`;
  }
  return localizeKnownStageName(label, language);
}

function getTop8HistoryForReport(state = {}, language = 'zh-CN') {
  const phases = [
    ...getEliminationPhaseOrderForState(state),
    'winners',
    'losers',
    'grand_final',
  ];
  return phases
    .map(phase => ({
      kind: 'elimination',
      label: formatReportPhaseLabel(phase, language),
      matches: (state.matches || []).filter(match => match.phase === phase || match.bracket === phase).sort((a, b) => (a.table || 0) - (b.table || 0)),
    }))
    .filter(group => group.matches.length > 0);
}

function stageTypeLabel(type, language = 'zh-CN') {
  const tx = textFor(language);
  return tx.stageTypes[type] || type || tx.stageDefault;
}

function formatMatchRules(rules = {}, language = 'zh-CN') {
  const tx = textFor(language);
  const bestOf = rules.bestOf ? `BO${rules.bestOf}` : 'BO-';
  const scoreMode = usesGameScore(rules) ? tx.scoreGames : tx.scoreMatch;
  const draw = rules.allowDraw ? tx.allowDraw : tx.noDraw;
  return `${bestOf} / ${scoreMode} / ${draw}`;
}

function buildSettingsSummary(state = {}, language = 'zh-CN') {
  const tx = textFor(language);
  const settings = state.tournamentSettings || {};
  return {
    presetId: settings.presetId || '-',
    game: settings.game || '-',
    entrantType: settings.entrantType === 'team' ? tx.teamEvent : tx.individualEvent,
  };
}

function buildStageSummary(state = {}, language = 'zh-CN') {
  const tx = textFor(language);
  const stages = Array.isArray(state.stages) && state.stages.length > 0
    ? state.stages
    : Array.isArray(state.tournamentSettings?.stages) ? state.tournamentSettings.stages : [];
  return stages.map((stage, index) => {
    const result = state.stageResults && stage.id ? state.stageResults[stage.id] : null;
    return {
      order: index + 1,
      id: stage.id || '',
      name: localizeKnownStageName(stage.name || stage.id || tx.stageName(index + 1), language),
      type: stageTypeLabel(stage.type, language),
      role: stage.role || '-',
      rules: formatMatchRules(stage.matchRules || {}, language),
      advancement: stage.advancement?.targetStageId
        ? tx.advanceTo(stage.advancement.targetStageId)
        : stage.advancement?.mode || '-',
      status: result ? tx.completed : (state.activeStageId === stage.id ? tx.inProgress : tx.incomplete),
    };
  });
}

function getStageHistoryForReport(state = {}, language = 'zh-CN') {
  const tx = textFor(language);
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
      label: localizeKnownStageName(stage.name || stage.id, language),
      matches: stageMatches,
    });
  }

  const uncategorized = matches
    .filter(match => typeof match.round !== 'number' && match.stageId && !stageIds.has(match.stageId))
    .sort((a, b) => String(a.stageId).localeCompare(String(b.stageId), 'zh-CN') || (a.table || 0) - (b.table || 0));
  if (uncategorized.length > 0) {
    groups.push({ kind: 'stage', label: tx.otherStage, matches: uncategorized });
  }

  return groups;
}

function formatMatchResult(match = {}, language = 'zh-CN') {
  const tx = textFor(language);
  if (match.draw) return tx.shortResult('draw') === '平' ? '平局' : (normalizeLanguage(language) === 'en' ? 'Draw' : '引き分け');
  if (match.p2 === 'BYE' || match.p1 === 'BYE') return tx.byeWin(match.winner);
  if (match.preMatchDroppedPlayer) {
    const opponent = match.preMatchDroppedPlayer === match.p1 ? match.p2 : match.p1;
    return tx.preDropWin(match.preMatchDroppedPlayer, opponent);
  }
  if (match.postMatchDroppedPlayer) return tx.postDropWin(match.winner, match.postMatchDroppedPlayer);
  if (match.winner) {
    if ((match.p1Wins || 0) > 0 || (match.p2Wins || 0) > 0) {
      return tx.winScore(match.winner, `${match.p1Wins || 0}-${match.p2Wins || 0}`);
    }
    return tx.win(match.winner);
  }
  return tx.incomplete;
}

function mapHistoryItemForReport(match, playerName, language = 'zh-CN') {
  const tx = textFor(language);
  const opponent = match.p1 === playerName ? match.p2 : match.p1;
  const resultKey = match.draw ? 'draw' : match.winner === playerName ? 'win' : 'loss';
  const stage = match.groupLabel
    || formatReportPhaseLabel(match.phase || match.bracket, language)
    || (typeof match.round === 'number' ? tx.swissRound(match.round) : tx.stageDefault);
  const beforeRecord = typeof match.round === 'number'
    ? (match.p1 === playerName ? match.p1RecordBefore : match.p2RecordBefore)
    : null;
  return {
    stage,
    table: match.table || null,
    opponent,
    result: tx.shortResult(resultKey),
    resultText: formatMatchResult(match, language),
    wasLive: !!match.wasLive,
    beforeRecord: beforeRecord ? formatRecordLine(beforeRecord) : null,
  };
}

function normalizeBuildArgs(nowOrOptions, options) {
  if (nowOrOptions instanceof Date) {
    return { now: nowOrOptions, language: normalizeLanguage(options?.language || options?.lang) };
  }
  return { now: new Date(), language: normalizeLanguage(nowOrOptions?.language || nowOrOptions?.lang || options?.language || options?.lang) };
}

function buildTournamentReportData(state = {}, nowOrOptions = new Date(), options = {}) {
  const { now, language } = normalizeBuildArgs(nowOrOptions, options);
  const tx = textFor(language);
  const ranking = (state.swissRankingArchive && state.swissRankingArchive.length > 0)
    ? state.swissRankingArchive
    : (state.swissRanking || []);
  return {
    language,
    labels: tx.labels,
    generatedAt: formatBeijingDateTime(now, language),
    tournamentName: state.tournamentName || tx.unnamedTournament,
    settings: buildSettingsSummary(state, language),
    stages: buildStageSummary(state, language),
    finalPlacements: buildFinalPlacements(state).map(entry => ({
      rank: entry.rank ?? '',
      rankLabel: localizeResultLabel(entry.rankLabel || '', language),
      player: entry.displayName || entry.player,
      result: localizeResultLabel(entry.resultLabel || entry.rankLabel || '', language),
    })),
    ranking: ranking.map(entry => ({
      rank: entry.rank,
      player: entry.player,
      record: `${entry.wins}-${entry.draws}-${entry.losses}`,
      points: entry.points,
      omw: Number(entry.omw || 0).toFixed(3),
      oow: Number(entry.oow || 0).toFixed(3),
      note: entry.dropped ? tx.dropped : '',
    })),
    swissRounds: getSwissHistoryForReport(state, language).map(page => ({
      label: page.label,
      matches: page.matches.map(match => ({
        tableLabel: tx.tableLabel(match.table, match.wasLive),
        p1: match.p1 === 'BYE' ? tx.bye : tx.withRecord(match.p1, formatRecordLine(match.p1RecordBefore || emptyRecord())),
        p2: match.p2 === 'BYE' ? tx.bye : tx.withRecord(match.p2, formatRecordLine(match.p2RecordBefore || emptyRecord())),
        result: formatMatchResult(match, language),
      })),
    })),
    top8Rounds: getTop8HistoryForReport(state, language).map(group => ({
      label: group.label,
      matches: group.matches.map(match => ({
        tableLabel: tx.tableLabel(match.table, match.wasLive),
        p1: match.p1 || '',
        p2: match.p2 || '',
        result: formatMatchResult(match, language),
      })),
    })),
    stageRounds: getStageHistoryForReport(state, language).map(group => ({
      label: group.label,
      matches: group.matches.map(match => ({
        tableLabel: tx.tableLabel(match.table, match.wasLive),
        phaseLabel: match.groupLabel || formatReportPhaseLabel(match.phase || match.bracket || match.stagePhase, language),
        p1: match.p1 || '',
        p2: match.p2 || '',
        result: formatMatchResult(match, language),
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

function buildPlayerReportData(playerName, state = {}, helpers = {}, nowOrOptions = new Date(), options = {}) {
  const { now, language } = normalizeBuildArgs(nowOrOptions, options);
  const tx = textFor(language);
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
    .map(match => mapHistoryItemForReport(match, playerName, language));
  const top8HistorySource = [
    ...(Array.isArray(state.groupMatchHistory) ? state.groupMatchHistory : []),
    ...(Array.isArray(state.matches) ? state.matches : []),
  ];
  const top8History = [...new Map(top8HistorySource.map(match => [match.id, match])).values()]
    .filter(match => typeof match.round !== 'number' && match.done && (match.p1 === playerName || match.p2 === playerName))
    .map(match => mapHistoryItemForReport(match, playerName, language));
  return {
    language,
    labels: tx.labels,
    generatedAt: formatBeijingDateTime(now, language),
    tournamentName: state.tournamentName || tx.unnamedTournament,
    playerName,
    reportTitle: `${state.tournamentName || tx.unnamedTournament} - ${tx.playerReportSuffix}`,
    finalStatus: localizeResultLabel(completion.finalPlacement?.resultLabel || completion.reason || completion.award || tx.finalResultFallback, language),
    finalAward: localizeResultLabel(completion.award || '', language),
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
  normalizeLanguage,
};
