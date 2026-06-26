async function setLive(id) {

  const res = await api(tournamentApi('/set-live'), { matchId: id });
  if (res.state) render(res.state);
}
async function setResult(id, winner) {
  const match = findCurrentMatch(id);
  if (match && !canOperateMatch(match, currentState)) return;
  const res = await api(tournamentApi('/result'), { matchId: id, winnerId: winner });
  if (res.state) render(res.state);
}
async function setDraw(id) {
  const match = findCurrentMatch(id);
  if (match && !canOperateMatch(match, currentState)) return;
  const res = await api(tournamentApi('/draw'), { matchId: id });
  if (res.state) render(res.state);
}
async function swapSeats(id) {
  const match = findCurrentMatch(id);
  if (match && !canOperateMatch(match, currentState)) return;
  const res = await api(tournamentApi('/swap-seats'), { matchId: id });
  if (res.state) render(res.state);
}
async function dropPlayerFromMatchAction(matchId, playerName) {
  const confirmed = await confirmAction(`确认将「${playerName}」标记为退赛？未录入结果则按赛前退赛处理，已录入结果则按赛后退赛处理。`, {
    title: '对局退赛',
    okText: '确认退赛',
  });
  if (!confirmed) return;
  const res = await api(tournamentApi('/drop-player-from-match'), { matchId, playerName });
  if (res.state) render(res.state);
}
async function setBo3Score(id, pw1, pw2) {
  const match = findCurrentMatch(id);
  if (match && !canOperateMatch(match, currentState)) return;
  const res = await api(tournamentApi('/bo3-score'), { matchId: id, p1Wins: pw1, p2Wins: pw2 });
  if (res.state) render(res.state);
}

// ── 辅助 ─────────────────────────────────────────────────
function findCurrentMatch(id) {
  return currentState?.matches?.find(match => match.id === id) || null;
}

function isPlaceholderEntrant(value) {
  const token = String(value || '').trim().toUpperCase();
  return !token || token === 'TBD' || token === '待定' || token === 'BYE';
}

function canOperateMatch(match, state = currentState) {
  return !!match
    && !isTournamentFinished(state)
    && !isPlaceholderEntrant(match.p1)
    && !isPlaceholderEntrant(match.p2);
}

function roundStats(round, matches) {
  const rms = matches.filter(m => m.round === round);
  return { total: rms.length, done: rms.filter(m => m.done).length, allDone: rms.length > 0 && rms.every(m => m.done) };
}
function top8PhaseStats(matches) {
  return ['Quarter Finals', 'Semi Finals', 'Finals', 'Bronze Match'].map(p => {
    const ms = matches.filter(m => m.phase === p);
    return { phase: p, total: ms.length, done: ms.filter(m => m.done).length, allDone: ms.length > 0 && ms.every(m => m.done) };
  }).filter(p => p.total > 0);
}
function eliminationPhaseLabel(phase) {
  return {
    'Quarter Finals': '八强赛',
    'Semi Finals': '半决赛',
    Finals: '决赛',
    'Bronze Match': '季军赛',
  }[phase] || phase || '淘汰赛';
}
function wdlHtml(w, d, l) { return `<span class="rank-wdl"><span class="w">${w}</span>-<span class="d">${d}</span>-<span class="l">${l}</span></span>`; }
function getRecord2(player, s) {
  let w = 0, d = 0, l = 0;
  for (const m of s.matches) {
    if (!m.done) continue;
    if (m.draw) { if (m.p1 === player || m.p2 === player) d++; continue; }
    if (m.winner === player) w++; else if (m.p1 === player || m.p2 === player) l++;
  }
  return { w, d, l, points: w * 3 + d };
}
function hasOpponent(m, a, b) { return (m.p1 === a && m.p2 === b) || (m.p1 === b && m.p2 === a); }
function getActiveStage(s) {
  if (!s || !Array.isArray(s.stages)) return null;
  const activeId = s.activeStage && s.activeStage.id ? s.activeStage.id : s.activeStageId;
  return s.stages.find(stage => stage.id === activeId) || null;
}
function getStartableStage(s) {
  const activeStage = getActiveStage(s);
  if (activeStage) return activeStage;
  return getStages(s).find(stage => !s?.stageResults?.[stage.id] && !stage.complete) || null;
}
function getStages(s) {
  return Array.isArray(s?.stages) ? s.stages : [];
}
function isTeamTournament(s) {
  const settings = s?.tournamentSettings || {};
  if (settings.entrantType === 'team') return true;
  return Array.isArray(s?.entrants) && s.entrants.some(entrant => entrant?.entrantType === 'team');
}
function participantLabel(s) {
  return isTeamTournament(s) ? '队伍' : '选手';
}
function participantUnitLabel(s) {
  return isTeamTournament(s) ? '团队赛' : '个人赛';
}
function getEntrantByDisplayName(s, name) {
  if (!name) return null;
  return (Array.isArray(s?.entrants) ? s.entrants : []).find(entrant => (entrant.displayName || entrant.teamName || entrant.name) === name) || null;
}
function entrantRosterText(s, name) {
  const entrant = getEntrantByDisplayName(s, name);
  if (!entrant || !Array.isArray(entrant.teamRoster) || entrant.teamRoster.length === 0) return '';
  return entrant.teamRoster.join(' / ');
}
function hasStageType(s, type) {
  return getStages(s).some(stage => stage.type === type);
}
function stageStructureLabel(s) {
  const stages = getStages(s);
  if (stages.length === 0) return '自定义';
  return stages.map(stage => stageTypeName(stage.type)).join(' → ');
}
function finalResultStage(s) {
  const stages = getStages(s);
  const active = getActiveStage(s);
  if (active) return active;
  const resultIds = Object.keys(s?.stageResults || {});
  for (let i = stages.length - 1; i >= 0; i--) {
    if (resultIds.includes(stages[i].id)) return stages[i];
  }
  return stages[stages.length - 1] || null;
}
function standingsForStage(s, stage) {
  const result = stage ? s?.stageResults?.[stage.id] : null;
  if (Array.isArray(result?.standings)) return result.standings;
  if (Array.isArray(s?.swissRanking)) return s.swissRanking;
  return [];
}
function finalStandingsForSidebar(s) {
  if (!isTournamentFinished(s)) return [];
  return standingsForStage(s, finalResultStage(s))
    .filter(entry => entry && entry.player && Number.isFinite(Number(entry.rank)));
}
function comparePlayersByRecord(a, b, s) {
  const ra = getRecord2(a, s), rb = getRecord2(b, s);
  if (rb.points !== ra.points) return rb.points - ra.points;
  const aHeadToHeadWins = s.matches.filter(m => m.done && !m.draw && m.winner === a && hasOpponent(m, a, b)).length;
  const bHeadToHeadWins = s.matches.filter(m => m.done && !m.draw && m.winner === b && hasOpponent(m, a, b)).length;
  if (aHeadToHeadWins !== bHeadToHeadWins) return bHeadToHeadWins - aHeadToHeadWins;
  return 0;
}
function normalizeMatchRules(stage) {
  const rules = stage && stage.matchRules ? stage.matchRules : {};
  return {
    bestOf: Number.isInteger(Number(rules.bestOf)) && Number(rules.bestOf) > 0 ? Number(rules.bestOf) : 1,
    scoreMode: rules.scoreMode || 'match',
    allowDraw: rules.allowDraw !== false,
  };
}

function usesGameScoreRules(rules = {}, stage = null) {
  const bestOf = Number.isInteger(Number(rules.bestOf)) && Number(rules.bestOf) > 0 ? Number(rules.bestOf) : 1;
  return rules.scoreMode === 'games'
    || bestOf > 1
    || stage?.type === 'single_elimination'
    || stage?.type === 'double_elimination';
}
function isGroupStage(stage) {
  return stage && (stage.type === 'groups' || stage.type === 'group_round_robin');
}
function normalizeGroupRound(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
function currentGroupRound(s, stage) {
  return normalizeGroupRound(
    stage?.id ? s?.groupStageRounds?.[stage.id] : null,
    normalizeGroupRound(s?.groupRound, 1),
  );
}
function groupRoundCount(matches) {
  return matches.reduce((max, match) => Math.max(max, normalizeGroupRound(match.groupRound, 1)), 0);
}
function groupLabelFromIndex(index) {
  const n = Number(index);
  return Number.isInteger(n) && n > 0 ? `${String.fromCharCode(64 + n)}组` : '小组';
}
function matchGroupLabel(match) {
  return match.groupLabel || groupLabelFromIndex(match.groupIndex);
}
function groupEntryKey(group) {
  return group.id || group.groupId || group.label || group.index || 'group';
}
function buildGroupViews(s, stage, matches) {
  const assigned = Array.isArray(s?.groupAssignments?.[stage.id]) ? s.groupAssignments[stage.id] : [];
  const groups = new Map();
  assigned.forEach(group => {
    const label = group.label || groupLabelFromIndex(group.index);
    groups.set(groupEntryKey(group), {
      id: group.id,
      index: Number(group.index) || groups.size + 1,
      label,
      entrants: [...(group.entrants || [])],
      matches: [],
    });
  });
  [...matches].forEach(match => {
    const key = match.groupId || match.groupLabel || match.groupIndex || 'group';
    if (!groups.has(key)) {
      groups.set(key, {
        id: match.groupId || key,
        index: Number(match.groupIndex) || groups.size + 1,
        label: matchGroupLabel(match),
        entrants: [],
        matches: [],
      });
    }
    const group = groups.get(key);
    [match.p1, match.p2].forEach(player => {
      if (player && player !== 'BYE' && !group.entrants.includes(player)) group.entrants.push(player);
    });
    group.matches.push(match);
  });
  return [...groups.values()]
    .sort((a, b) => (a.index || 0) - (b.index || 0) || String(a.label).localeCompare(String(b.label), 'zh-CN'))
    .map(group => {
      const groupMatches = [...group.matches].sort((a, b) =>
        Number(a.groupRound || a.round || 0) - Number(b.groupRound || b.round || 0) ||
        Number(a.table || 0) - Number(b.table || 0) ||
        String(a.id || '').localeCompare(String(b.id || '')),
      );
      const standings = sortGroupStandingsForAdmin(
        group.entrants.map(player => buildGroupStandingEntryForAdmin(player, groupMatches)),
        groupMatches,
      ).map((entry, index) => ({ ...entry, rank: index + 1 }));
      return { ...group, matches: groupMatches, standings };
    });
}
function buildGroupStandingEntryForAdmin(player, matches) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let gameWins = 0;
  let gameLosses = 0;
  let played = 0;
  for (const match of matches) {
    if (!match.done || (match.p1 !== player && match.p2 !== player)) continue;
    played += 1;
    const selfWins = match.p1 === player ? (match.p1Wins || 0) : (match.p2Wins || 0);
    const oppWins = match.p1 === player ? (match.p2Wins || 0) : (match.p1Wins || 0);
    gameWins += selfWins;
    gameLosses += oppWins;
    if (match.draw) draws += 1;
    else if (match.winner === player) wins += 1;
    else losses += 1;
  }
  return {
    player,
    wins,
    draws,
    losses,
    points: wins * 3 + draws,
    gameWins,
    gameLosses,
    gameDiff: gameWins - gameLosses,
    played,
  };
}
function addGroupResistanceForAdmin(standings, matches) {
  const standingsByPlayer = new Map(standings.map(entry => [entry.player, entry]));
  return standings.map(entry => {
    const opponents = groupOpponentsForAdmin(entry.player, matches);
    const opponentRates = opponents.map(opponent => groupWinRateForAdmin(opponent, standingsByPlayer));
    const omw = opponentRates.length ? opponentRates.reduce((sum, value) => sum + value, 0) / opponentRates.length : 0;
    const oow = opponents.length
      ? opponents
          .map(opponent => groupOpponentsForAdmin(opponent, matches))
          .map(opponentsOpponents => {
            const rates = opponentsOpponents
              .filter(opponent => opponent && opponent !== 'BYE')
              .map(opponent => groupWinRateForAdmin(opponent, standingsByPlayer));
            return rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : 0;
          })
          .reduce((sum, value) => sum + value, 0) / opponents.length
      : 0;
    return { ...entry, omw, oow };
  });
}
function groupHeadToHeadResult(a, b, matches) {
  const direct = matches.find(match =>
    match.done &&
    !match.draw &&
    ((match.p1 === a && match.p2 === b) || (match.p1 === b && match.p2 === a)),
  );
  if (!direct) return 0;
  if (direct.winner === a) return -1;
  if (direct.winner === b) return 1;
  return 0;
}
function sortGroupStandingsForAdmin(standings, matches) {
  return standings.slice().sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.omw !== a.omw) return b.omw - a.omw;
    if (b.oow !== a.oow) return b.oow - a.oow;
    if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
    if (b.gameWins !== a.gameWins) return b.gameWins - a.gameWins;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const headToHead = groupHeadToHeadResult(a.player, b.player, matches);
    if (headToHead !== 0) return headToHead;
    return String(a.player).localeCompare(String(b.player), 'zh-CN');
  });
}

// ── 渲染 ─────────────────────────────────────────────────
function render(s) {
  currentState = s;
  removeLegacySwissControls();
  const n = s.players.length;
  const p8 = s.pendingTop8 || [];
  const p8Set = new Set(p8);
  const stages = getStages(s);
  const activeStage = getActiveStage(s);
  const label = participantLabel(s);

  // 顶栏
  const badge = document.getElementById('phaseBadge');
  const displayPhase = isTournamentFinished(s) ? 'done' : s.phase;
  document.body.dataset.adminPhase = displayPhase || '';
  const labels = { setup:'等待开始', swiss:'瑞士轮', 'swiss-ended':'瑞士轮结束', groups:'小组赛', 'groups-ended':'小组赛结束', top8:'淘汰赛', double_elimination:'双败淘汰', 'double_elimination-ended':'双败结束', done:'已结束' };
  badge.className = 'phase-badge ' + (displayPhase === 'swiss' ? 'swiss' : displayPhase === 'swiss-ended' ? 'swiss-ended' : displayPhase === 'groups' || displayPhase === 'groups-ended' ? 'groups' : displayPhase === 'top8' || displayPhase === 'double_elimination' || displayPhase === 'double_elimination-ended' ? 'top8' : displayPhase === 'done' ? 'done' : '');
  badge.textContent = labels[displayPhase] || '—';
  document.getElementById('roundLabel').textContent = s.phase === 'swiss' ? `第 ${s.round} 轮` : '';

  // 比赛名
  const tCur = document.getElementById('tourName');
  tCur.textContent = s.tournamentName || '—';
  const baseUrl = s.publicBaseUrl || location.origin;
  const playerEntryUrl = `${baseUrl}/t/${encodeURIComponent(s.tournamentId)}/player-login`;
  document.getElementById('playerEntryUrl').textContent = playerEntryUrl;
  renderQrInto('playerQrImage', playerEntryUrl);

  // 统计
  document.getElementById('participantPanelTitle').innerHTML = `📋 ${label} <span id="playerCount" style="color:#94a3b8;">${n}</span>`;
  document.getElementById('playerInput').placeholder = `${label}名称...`;
  document.getElementById('bulkAddBtn').textContent = `批量导入${label}`;
  document.getElementById('bulkModalTitle').textContent = `批量导入${label}`;
  document.getElementById('playerEntrySectionTitle').textContent = isTeamTournament(s) ? '📱 参赛端' : '📱 选手端';
  document.querySelector('.player-qr-label').textContent = isTeamTournament(s) ? '参赛二维码' : '选手二维码';
  document.querySelector('.player-qr-tip').textContent = isTeamTournament(s) ? '扫码进入参赛页面' : '扫码进入选手个人页';
  document.getElementById('playerCount').textContent = n;
  committedPublicBaseUrlInput = stripBaseUrlProtocol(s.publicBaseUrlOverride);
  document.getElementById('publicBaseUrlInput').value = committedPublicBaseUrlInput;
  const liveRoomCodeInput = document.getElementById('liveRoomCodeInput');
  if (liveRoomCodeInput && document.activeElement !== liveRoomCodeInput) {
    liveRoomCodeInput.value = s.liveRoomCode || '';
  }

  const canExport = isTournamentFinished(s);
  const exportBtn = document.getElementById('btnExportReport');
  exportBtn.disabled = !canExport;
  exportBtn.title = canExport ? '导出战报' : '比赛完成后可导出战报';

  renderPlayers(s, p8Set);
  renderStageIdleScreen(s);
  renderTop8Bracket(s);
  renderStageArena(s);
  renderStages(s);
  renderOverlay(s);
  removeLegacySwissControls();
}

function removeLegacySwissControls() {
  const legacyIds = [
    'swiss' + 'Arena',
    'swiss' + 'Hint',
    'swiss' + 'HintText',
    'round' + 'HeaderArea',
    'round' + 'Header',
    'match' + 'List',
    'btn' + 'Start',
    'btn' + 'Next',
    'btn' + 'EndSwiss',
    'btn' + 'Revert',
    'swiss' + 'Rounds',
  ];
  legacyIds.forEach(id => document.getElementById(id)?.remove());

  const legacyText = [
    '瑞士轮' + '轮数',
    '当前' + '人数',
    '进入' + '淘汰赛',
    '开始' + '瑞士轮',
    '结束' + '瑞士轮',
    '下一' + '轮',
    '← ' + '回退',
  ];
  document.querySelectorAll('button, .config-row, .side-module, .config-box, .phase-hint').forEach(el => {
    if (el.closest('[data-admin-modern]')) return;
    const text = (el.textContent || '').trim();
    const hits = legacyText.filter(token => text.includes(token));
    if (hits.length === 0) return;
    const block = el.closest('.config-box, .side-module');
    (block || el).remove();
  });
}

function stageTypeName(type) {
  return {
    swiss: '瑞士轮',
    groups: '小组赛',
    group_round_robin: '小组循环',
    single_elimination: '单败淘汰',
    double_elimination: '双败淘汰',
  }[type] || type || '阶段';
}

function renderStageRuleSummary(stage) {
  const bestOf = Number(stage.matchRules?.bestOf || 1);
  const allowDraw = stage.matchRules?.allowDraw !== false;
  const rows = [
    ['BO', `BO${bestOf}`],
    ['平局', allowDraw ? '允许' : '禁止'],
  ];
  if (stage.type === 'swiss') {
    const resultRoundCount = Number(currentState?.stageResults?.[stage.id]?.metadata?.roundCount);
    const plannedRoundCount = Number(currentState?.swissRounds);
    const runningThisStage = currentState?.phase === 'swiss' && (currentState?.activeStageId === stage.id || currentState?.activeStage?.id === stage.id);
    if (Number.isInteger(resultRoundCount) && resultRoundCount > 0) {
      rows.push(['轮数', `${resultRoundCount} 轮完成`]);
    } else if (runningThisStage && Number.isInteger(plannedRoundCount) && plannedRoundCount > 0) {
      rows.push(['轮数', `计划 ${plannedRoundCount} 轮`]);
    } else {
      rows.push(['轮数', '按人数自动']);
    }
    rows.push(['晋级', stage.advancement?.count ? `${stage.advancement.count} 人` : '无']);
  }
  if (stage.type === 'groups' || stage.type === 'group_round_robin') {
    rows.push(['小组', `${stage.groups?.groupCount || 2} 组`]);
    rows.push(['每组晋级', `${stage.groups?.advancePerGroup || stage.advancement?.count || 1} 人`]);
  }
  if (stage.type === 'single_elimination') {
    rows.push(['人数', `${stage.elimination?.bracketSize || stage.advancement?.count || 8} 人`]);
    rows.push(['季军赛', stage.elimination?.bronzeMatch !== false ? '开启' : '关闭']);
  }
  if (stage.type === 'double_elimination') {
    rows.push(['人数', `${stage.doubleElimination?.bracketSize || 8} 人`]);
    rows.push(['决赛重置', stage.doubleElimination?.grandFinalReset === false ? '关闭' : '开启']);
  }
  return `<div class="stage-rule-summary">${rows.map(([key, value]) => `
    <div class="stage-rule-pill"><span>${escHtml(key)}</span><strong>${escHtml(value)}</strong></div>
  `).join('')}</div>`;
}

function renderStageActions(stage, activeId, phase) {
  if (isTournamentFinished(currentState)) return '';
  const active = stage.id === activeId;
  const isSwiss = stage.type === 'swiss';
  if (isSwiss) return '';
  const hasStageResult = !!currentState?.stageResults?.[stage.id];
  const stageMatches = getStageMatchesForAdmin(stage);
  const hasMatches = stageMatches.length > 0;
  const currentStepDone = isCurrentStageStepDone(stage, stageMatches);
  const stageFinalReady = isStageReadyToComplete(stage, stageMatches);
  const canAdvance = active && (
    (hasStageResult && stage.advancement?.targetStageId) ||
    (!hasStageResult && isStageReadyToAdvance(stage, stageMatches, currentStepDone, stageFinalReady))
  );
  const canComplete = active && !hasStageResult && stageFinalReady;
  const actions = [];
  if (canAdvance) actions.push(`<button class="btn btn-secondary btn-sm" onclick="advanceStage('${stage.id}')">${stageActionAdvanceLabel(stage, hasStageResult)}</button>`);
  if (canComplete) actions.push(`<button class="btn btn-green btn-sm" onclick="completeStage('${stage.id}')">完成阶段</button>`);
  return actions.length ? `<div class="stage-actions">${actions.join('')}</div>` : '';
}

function stageActionAdvanceLabel(stage, hasStageResult) {
  if (hasStageResult && stage.advancement?.targetStageId) return '进入下一阶段';
  return '推进阶段';
}

function renderStageArenaActions(s, stage, matches) {
  if (!stage || isTournamentFinished(s)) return '';
  if (isGroupStage(stage)) return renderGroupStageArenaActions(s, stage);
  if (stage.type !== 'swiss') return '';
  const hasStageResult = !!s?.stageResults?.[stage.id];
  if (hasStageResult && stage.advancement?.targetStageId) {
    return `<div class="stage-flow-actions">
      <div class="stage-flow-copy">
        <div class="stage-flow-kicker">资格赛已完成</div>
        <div class="stage-flow-title">瑞士轮排名已生成</div>
        <div class="stage-flow-meta">晋级名单已准备好，可以进入后续阶段。</div>
      </div>
      <div class="stage-flow-buttons">
        <button class="btn btn-secondary btn-sm" onclick="advanceStage('${stage.id}')">进入下一阶段</button>
      </div>
    </div>`;
  }
  const activeId = s.activeStage?.id || s.activeStageId;
  if (s.phase !== 'swiss' || activeId !== stage.id) return '';
  const currentRound = Number(s.round || 0);
  const canRevertRound = currentRound > 1;
  const revertButton = canRevertRound
    ? '<button class="btn btn-red btn-sm" onclick="revertSwissRound()">回退一轮</button>'
    : '';
  const currentStepDone = isCurrentStageStepDone(stage, matches);
  if (!currentStepDone) {
    if (!canRevertRound) return '';
    return `<div class="stage-flow-actions">
      <div class="stage-flow-copy">
        <div class="stage-flow-kicker">瑞士轮操作</div>
        <div class="stage-flow-title">第 ${currentRound} 轮进行中</div>
        <div class="stage-flow-meta">如果本轮配对或录入有误，可以回退到上一轮结束后的状态。</div>
      </div>
      <div class="stage-flow-buttons">
        ${revertButton}
      </div>
    </div>`;
  }
  const plannedRounds = Number(s.swissRounds || 0);
  const continueLabel = currentRound >= plannedRounds ? '额外继续一轮' : '继续一轮';
  const plannedText = plannedRounds > 0
    ? `当前计划 ${plannedRounds} 轮，已完成第 ${currentRound} 轮。`
    : `已完成第 ${currentRound} 轮。`;
  return `<div class="stage-flow-actions">
    <div class="stage-flow-copy">
      <div class="stage-flow-kicker">瑞士轮决策</div>
      <div class="stage-flow-title">本轮对局已全部完成</div>
      <div class="stage-flow-meta">${escHtml(plannedText)}</div>
    </div>
    <div class="stage-flow-buttons">
      ${revertButton}
      <button class="btn btn-secondary btn-sm" onclick="advanceStage('${stage.id}')">${continueLabel}</button>
      <button class="btn btn-green btn-sm" onclick="completeStage('${stage.id}')">结束资格赛</button>
    </div>
  </div>`;
}

function renderGroupStageArenaActions(s, stage) {
  const allMatches = getStageMatchesForAdmin(stage, s);
  const currentRound = currentGroupRound(s, stage);
  const totalRounds = groupRoundCount(allMatches);
  const roundMatches = allMatches.filter(match => normalizeGroupRound(match.groupRound, 1) === currentRound);
  const currentDone = roundMatches.length > 0 && roundMatches.every(match => !!match.done);
  const allDone = allMatches.length > 0 && allMatches.every(match => !!match.done);
  const hasStageResult = !!s?.stageResults?.[stage.id];
  if (hasStageResult && stage.advancement?.targetStageId) {
    return `<div class="stage-flow-actions">
      <div class="stage-flow-copy">
        <div class="stage-flow-kicker">小组赛已完成</div>
        <div class="stage-flow-title">晋级名单已生成</div>
        <div class="stage-flow-meta">每组出线选手已准备好，可以进入后续阶段。</div>
      </div>
      <div class="stage-flow-buttons">
        <button class="btn btn-secondary btn-sm" onclick="advanceStage('${stage.id}')">进入下一阶段</button>
      </div>
    </div>`;
  }
  if (!currentDone) return '';
  if (allDone || currentRound >= totalRounds) {
    return `<div class="stage-flow-actions">
      <div class="stage-flow-copy">
        <div class="stage-flow-kicker">小组赛决策</div>
        <div class="stage-flow-title">全部小组轮次已完成</div>
        <div class="stage-flow-meta">当前共 ${escHtml(totalRounds)} 轮，已完成所有小组对局。</div>
      </div>
      <div class="stage-flow-buttons">
        <button class="btn btn-green btn-sm" onclick="completeStage('${stage.id}')">结束小组赛</button>
      </div>
    </div>`;
  }
  return `<div class="stage-flow-actions">
    <div class="stage-flow-copy">
      <div class="stage-flow-kicker">小组赛轮次</div>
      <div class="stage-flow-title">第 ${escHtml(currentRound)} 轮已完成</div>
      <div class="stage-flow-meta">下一步进入第 ${escHtml(currentRound + 1)} 轮。</div>
    </div>
    <div class="stage-flow-buttons">
      <button class="btn btn-secondary btn-sm" onclick="advanceStage('${stage.id}')">进入下一轮</button>
    </div>
  </div>`;
}

function isCurrentStageStepDone(stage, matches) {
  if (!stage || matches.length === 0) return false;
  if (stage.type === 'swiss') {
    const roundMatches = matches.filter(match => match.round === currentState?.round);
    return roundMatches.length > 0 && roundMatches.every(match => !!match.done);
  }
  if (isGroupStage(stage)) {
    const round = currentGroupRound(currentState, stage);
    const roundMatches = matches.filter(match => normalizeGroupRound(match.groupRound, 1) === round);
    return roundMatches.length > 0 && roundMatches.every(match => !!match.done);
  }
  return matches.every(match => !!match.done);
}

function isSingleEliminationFinalReady(stage, matches) {
  if (!stage || stage.type !== 'single_elimination') return false;
  const finalDone = matches.some(match => match.phase === 'Finals' && match.done);
  const bronzeEnabled = stage.elimination?.bronzeMatch !== false;
  const bronzeDone = !bronzeEnabled || matches.some(match => match.phase === 'Bronze Match' && match.done);
  return finalDone && bronzeDone;
}

function isStageReadyToComplete(stage, matches) {
  if (!stage || matches.length === 0) return false;
  if (stage.type === 'swiss') {
    return isCurrentStageStepDone(stage, matches);
  }
  if (stage.type === 'single_elimination') return isSingleEliminationFinalReady(stage, matches);
  if (isGroupStage(stage)) return matches.length > 0 && matches.every(match => !!match.done);
  return matches.every(match => !!match.done);
}

function isStageReadyToAdvance(stage, matches, currentStepDone, stageFinalReady) {
  if (!stage || !currentStepDone || stageFinalReady) return false;
  if (stage.type === 'swiss') return true;
  if (isGroupStage(stage)) return true;
  if (stage.type === 'single_elimination') return true;
  if (stage.type === 'double_elimination') return true;
  return false;
}

function renderStages(s) {
  const stages = getStages(s);
  document.getElementById('presetName').textContent = stageStructureLabel(s);
  const activeId = s.activeStage && s.activeStage.id ? s.activeStage.id : s.activeStageId;
  const stageList = document.getElementById('stageList');
  stageList.innerHTML = stages.length === 0
    ? '<div class="empty-state">暂无阶段</div>'
    : stages.map(stage => {
        const isSwiss = stage.type === 'swiss';
        const complete = !!s.stageResults?.[stage.id] || (!isSwiss && !!stage.complete);
        const active = stage.id === activeId;
        const progress = `${stage.completedMatchCount || 0}/${stage.matchCount || 0}`;
        const bo = stage.matchRules && stage.matchRules.bestOf ? `BO${stage.matchRules.bestOf}` : 'BO-';
        return `<div class="stage-item${active ? ' active' : ''}${complete ? ' done' : ''}">
          <div class="stage-name">${stage.name || stage.id}</div>
          <div class="stage-meta">${stageTypeName(stage.type)} · ${bo} · ${progress} 已完成</div>
          ${renderStageRuleSummary(stage)}
          ${renderStageActions(stage, activeId, s.phase)}
        </div>`;
      }).join('');
}

function renderStageIdleScreen(s) {
  const screen = document.getElementById('stageIdleScreen');
  if (!screen) return;
  const hasOpenMatch = (s.matches || []).some(match => !match.done);
  const shouldShow = s.phase === 'setup' && !hasOpenMatch;
  screen.classList.toggle('visible', shouldShow);
  if (!shouldShow) return;

  const activeStage = getStartableStage(s);
  const label = participantLabel(s);
  const count = Array.isArray(s.players) ? s.players.length : 0;
  const kicker = document.getElementById('stageIdleKicker');
  const title = document.getElementById('stageIdleTitle');
  const meta = document.getElementById('stageIdleMeta');
  const actions = document.getElementById('stageIdleActions');
  if (kicker) kicker.textContent = '等待开始';
  if (title) {
    title.textContent = activeStage ? `${stageTypeName(activeStage.type)}尚未开始` : '阶段尚未开始';
  }
  if (meta) meta.textContent = `当前${label} ${count}，点击下方按钮启动赛事阶段。`;
  if (actions) {
    actions.innerHTML = activeStage && !activeStage.complete && !hasOpenMatch
      ? `<button class="btn btn-secondary btn-sm" onclick="startStage('${activeStage.id}')">开始阶段</button>`
      : '';
  }
}

// ── 选手列表 ─────────────────────────────────────────────
function renderPlayers(s, p8Set) {
  const list = document.getElementById('playerList');
  const dropped = new Set(s.droppedPlayers || []);
  const label = participantLabel(s);
  if (s.phase === 'setup') {
    list.innerHTML = s.players.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">👥</div>暂无${label}</div>`
      : s.players.map(p => {
          const esc = p.replace(/'/g, "\\'");
          const isDropped = dropped.has(p);
          const roster = entrantRosterText(s, p);
          return `<div class="player-item${isDropped ? ' dropped' : ''}"><span class="rank">—</span><span class="name" title="${escAttr(p)}">${escHtml(p)}${roster ? `<small>${escHtml(roster)}</small>` : ''}</span>${isDropped ? '<span class="wd-badge">WD</span>' : ''}<button class="drop-btn" onclick="removePlayer('${esc}')" title="移除">×</button></div>`;
         }).join('');
    return;
  }
  const finalStandings = finalStandingsForSidebar(s);
  const rankByPlayer = new Map(finalStandings.map(entry => [entry.player, Number(entry.rank)]));
  const sorted = [...s.players].sort((a, b) => {
    const hasRankA = rankByPlayer.has(a);
    const hasRankB = rankByPlayer.has(b);
    if (hasRankA || hasRankB) {
      if (!hasRankA) return 1;
      if (!hasRankB) return -1;
      const rankDelta = rankByPlayer.get(a) - rankByPlayer.get(b);
      if (rankDelta !== 0) return rankDelta;
    }
    return comparePlayersByRecord(a, b, s);
  });
  // active players (not dropped) for ranking
  const activeSorted = sorted.filter(p => !dropped.has(p));
  list.innerHTML = activeSorted.map(function(p, i) {
    var rec = getRecord2(p, s);
    var isT8 = p8Set.has(p);
    var isDropped = dropped.has(p);
    var escapedPlayerArg = p.replace(/'/g, '\\\'');
    var roster = entrantRosterText(s, p);
    var dropBtn = (!isDropped && s.phase === 'swiss') ? ' <button class="drop-btn" onclick="dropPlayer(\'' + escapedPlayerArg + '\')" style="margin-left:4px;background:none;border:none;color:#f87171;cursor:pointer;font-size:11px;">退赛</button>' : '';
    return '<div class="player-item' + (isT8 ? ' top8-qualify' : '') + (isDropped ? ' dropped' : '') + '">' +
      '<span class="rank">' + (rankByPlayer.size ? (rankByPlayer.has(p) ? rankByPlayer.get(p) : '—') : (i+1)) + '</span>' +
      '<span class="name" title="' + escAttr(p) + '" style="flex:1;">' + escHtml(p) + (roster ? '<small>' + escHtml(roster) + '</small>' : '') + '</span>' +
      '<span class="record">' + wdlHtml(rec.w, rec.d, rec.l) + '</span>' +
      dropBtn +
      '</div>';
  }).join('');

  // dropped players section
  const droppedList = sorted.filter(p => dropped.has(p));
  if (droppedList.length > 0) {
    const section = document.createElement('div');
    section.className = 'dropped-section';
    section.innerHTML = '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">退赛' + label + '</div>' +
      droppedList.map(p => `<div class="player-item dropped"><span class="rank">—</span><span class="name">${escHtml(p)}</span><span class="wd-badge">WD</span></div>`).join('');
    list.appendChild(section);
  }
}

// ── 淘汰赛 ───────────────────────────────────────────────
function renderTop8Bracket(s) {
  const el = document.getElementById('top8Bracket');
  const activeStage = getActiveStage(s);
  if (isTournamentFinished(s) || s.phase !== 'top8' || (activeStage && activeStage.type !== 'single_elimination')) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const phases = top8PhaseStats(s.matches);
  document.getElementById('bracketProgress').innerHTML = phases.map(p =>
    `<div class="bracket-step${p.allDone ? ' done' : p.done > 0 ? ' active' : ''}" title="${escAttr(eliminationPhaseLabel(p.phase))}"></div>`
  ).join('');
  // 显示当前未完成的 phase，但 Finals 和 Bronze Match 同时显示
  const activePhases = phases.filter(p => !p.allDone);
  const pms = activePhases.length > 0
    ? s.matches.filter(m => activePhases.some(p => p.phase === m.phase))
    : s.matches.filter(m => m.phase === 'Finals' || m.phase === 'Bronze Match');
  const phaseLabels = activePhases.length > 0
    ? activePhases.map(p => eliminationPhaseLabel(p.phase)).join(' / ')
    : phases.map(p => eliminationPhaseLabel(p.phase)).join(' / ') || '淘汰赛';
  document.getElementById('top8PhaseHint').innerHTML = `<strong>${phaseLabels}</strong>`;
  document.getElementById('top8MatchList').innerHTML = pms.map(m => matchCard(s, m, true)).join('');
}

function renderStageArena(s) {
  const el = document.getElementById('stageArena');
  const activeStage = isTournamentFinished(s) ? finalResultStage(s) : getActiveStage(s);
  const handledByTop8Bracket = !isTournamentFinished(s) && s.phase === 'top8' && activeStage?.type === 'single_elimination';
  const show = activeStage && !handledByTop8Bracket;
  if (!show) {
    el.style.display = 'none';
    document.getElementById('stageMatchList').innerHTML = '';
    return;
  }
  el.style.display = 'block';
  const matches = getVisibleStageMatches(s, activeStage);
  const title = document.getElementById('stageArenaTitle');
  title.textContent = stageArenaTitle(s, activeStage, matches);
  const standings = standingsForStage(s, activeStage);
  const resultHtml = isTournamentFinished(s)
    ? renderFinalSummary(s, activeStage, standings)
    : '';
  const actionsHtml = renderStageArenaActions(s, activeStage, matches);
  let matchHtml = '';
  if (activeStage.type === 'double_elimination') {
    matchHtml = renderDoubleEliminationArena(s, activeStage, matches);
  } else if (isGroupStage(activeStage)) {
    matchHtml = renderGroupArena(s, activeStage, matches);
  } else {
    matchHtml = matches.length > 0
      ? matches.map(m => matchCard(s, m, false)).join('')
      : '<div class="empty-state"><div class="empty-state-icon">🏁</div>暂无当前阶段对局</div>';
  }
  document.getElementById('stageMatchList').innerHTML = `${resultHtml}${actionsHtml}${matchHtml}`;
}

function renderGroupArena(s, stage, matches) {
  const allMatches = getStageMatchesForAdmin(stage, s);
  const currentRound = currentGroupRound(s, stage);
  const totalRounds = groupRoundCount(allMatches);
  const groupViews = buildGroupViews(s, stage, allMatches);
  const visibleMatchIds = new Set(matches.map(match => match.id));
  const visibleGroupViews = groupViews.map(group => ({
    ...group,
    matches: group.matches.filter(match => visibleMatchIds.has(match.id)),
  }));
  if (groupViews.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">🏁</div>暂无小组对局</div>';
  }
  const done = allMatches.filter(match => match.done).length;
  const roundDone = matches.filter(match => match.done).length;
  const advancePerGroup = Number(stage.groups?.advancePerGroup || stage.advancement?.count || 1);
  return `<div class="group-stage-arena">
    <div class="group-stage-overview">
      <div class="group-stage-copy">
        <div class="group-stage-kicker">小组赛</div>
        <div class="group-stage-rule">${escHtml(groupViews.length)} 组循环赛，每组前 ${escHtml(advancePerGroup)} 名晋级。当前第 ${escHtml(currentRound)}/${escHtml(totalRounds || 1)} 轮。</div>
      </div>
      <div class="group-stage-metrics">
        ${doubleMetricHtml('总进度', `${done}/${allMatches.length}`)}
        ${doubleMetricHtml('本轮', `${roundDone}/${matches.length}`)}
        ${doubleMetricHtml('小组', `${groupViews.length}`)}
        ${doubleMetricHtml('每组晋级', `${advancePerGroup}`)}
      </div>
    </div>
    <div class="group-board">
      ${visibleGroupViews.map(group => renderGroupSection(s, group, advancePerGroup)).join('')}
    </div>
  </div>`;
}

function renderGroupSection(s, group, advancePerGroup) {
  const done = group.matches.filter(match => match.done).length;
  return `<section class="group-section">
    <div class="group-section-head">
      <div>
        <div class="group-section-title">${escHtml(group.label)}</div>
        <div class="group-section-meta">${escHtml(group.entrants.length)} 人 · ${done}/${group.matches.length} 已完成</div>
      </div>
      <div class="group-advance-chip">前 ${escHtml(advancePerGroup)} 晋级</div>
    </div>
    <div class="group-standings-mini">
      ${group.standings.map(entry => renderGroupStandingRow(entry, advancePerGroup)).join('')}
    </div>
    <div class="group-match-list">
      ${group.matches.map(match => matchCard(s, match, false)).join('')}
    </div>
  </section>`;
}

function renderGroupStandingRow(entry, advancePerGroup) {
  const qualified = Number(entry.rank) <= Number(advancePerGroup || 1);
  return `<div class="group-standing-row${qualified ? ' qualified' : ''}">
    <span class="group-standing-rank">#${escHtml(entry.rank)}</span>
    <strong>${escHtml(entry.player)}</strong>
    <span class="group-standing-record">${entry.wins}-${entry.draws}-${entry.losses}</span>
    <span class="group-standing-points">${entry.points}pt</span>
  </div>`;
}

function renderDoubleEliminationArena(s, stage, matches) {
  const winners = sortDoubleEliminationMatches(matches.filter(match => match.bracket === 'winners'));
  const losers = sortDoubleEliminationMatches(matches.filter(match => match.bracket === 'losers'));
  const grandFinal = sortDoubleEliminationMatches(matches.filter(match => match.bracket === 'grand_final'));
  const deState = s.doubleElimination?.[stage.id] || {};
  const resetEnabled = stage.doubleElimination?.grandFinalReset !== false;
  const eliminatedCount = Array.isArray(deState.eliminated) ? deState.eliminated.length : 0;
  const totalDone = matches.filter(match => match.done).length;
  return `<div class="double-elim-arena">
    <div class="double-elim-overview">
      <div class="double-elim-copy">
        <div class="double-elim-kicker">双败淘汰规则</div>
        <div class="double-elim-rule">胜者组落败进入败者组；败者组再败淘汰；胜者组冠军与败者组冠军进入总决赛。</div>
        <div class="double-elim-note">${resetEnabled ? '总决赛重置开启：败者组冠军先赢总决赛会触发重置局。' : '总决赛重置关闭：总决赛一场定冠军。'}</div>
      </div>
      <div class="double-elim-metrics">
        ${doubleMetricHtml('总进度', `${totalDone}/${matches.length}`)}
        ${doubleMetricHtml('已淘汰', `${eliminatedCount}`)}
        ${doubleMetricHtml('总决赛重置', resetEnabled ? '开启' : '关闭')}
      </div>
    </div>
    <div class="double-bracket-board">
      ${renderDoubleBracketSection(s, 'winners', '胜者组', '本组首败不会淘汰，落败者进入败者组。', winners, '暂无胜者组对局')}
      ${renderDoubleBracketSection(s, 'losers', '败者组', '本组再败淘汰，胜者继续留在败者组。', losers, '等待胜者组落败者进入败者组')}
      ${renderDoubleBracketSection(s, 'grand_final', '总决赛', resetEnabled ? '胜者组冠军对败者组冠军；必要时进入重置局。' : '胜者组冠军对败者组冠军。', grandFinal, '等待胜者组冠军和败者组冠军')}
    </div>
  </div>`;
}

function doubleMetricHtml(label, value) {
  return `<div class="double-elim-metric"><span>${escHtml(label)}</span><strong>${escHtml(value)}</strong></div>`;
}

function sortDoubleEliminationMatches(matches) {
  return [...matches].sort((a, b) =>
    Number(a.doubleEliminationRound || a.bracketRound || 0) - Number(b.doubleEliminationRound || b.bracketRound || 0) ||
    Number(a.table || 0) - Number(b.table || 0) ||
    String(a.id || '').localeCompare(String(b.id || '')),
  );
}

function renderDoubleBracketSection(s, key, title, subtitle, matches, emptyText) {
  const done = matches.filter(match => match.done).length;
  const body = matches.length > 0
    ? renderDoubleRoundGroups(s, key, matches)
    : `<div class="double-bracket-empty">${escHtml(emptyText)}</div>`;
  return `<section class="double-bracket-section ${key}">
    <div class="double-bracket-head">
      <div>
        <div class="double-bracket-title">${escHtml(title)}</div>
        <div class="double-bracket-subtitle">${escHtml(subtitle)}</div>
      </div>
      <div class="double-bracket-count">${done}/${matches.length}</div>
    </div>
    ${body}
  </section>`;
}

function renderDoubleRoundGroups(s, bracket, matches) {
  const rounds = [...new Set(matches.map(match => Number(match.doubleEliminationRound || match.bracketRound || 1)))].sort((a, b) => a - b);
  return rounds.map(round => {
    const roundMatches = matches.filter(match => Number(match.doubleEliminationRound || match.bracketRound || 1) === round);
    const done = roundMatches.filter(match => match.done).length;
    return `<div class="double-round">
      <div class="double-round-title">
        <span>${escHtml(doubleRoundTitle(bracket, round))}</span>
        <small>${done}/${roundMatches.length} 已完成</small>
      </div>
      <div class="double-match-grid">
        ${roundMatches.map(match => matchCard(s, match, false)).join('')}
      </div>
    </div>`;
  }).join('');
}

function doubleRoundTitle(bracket, round) {
  if (bracket === 'winners') return `胜者组第 ${round} 轮`;
  if (bracket === 'losers') return `败者组第 ${round} 轮`;
  return round >= 2 ? '总决赛重置局' : '总决赛';
}

function getStageMatchesForAdmin(stage, state = currentState) {
  if (!stage) return [];
  return (state.matches || []).filter(match => {
    if (match.stageId) return match.stageId === stage.id;
    if (stage.type === 'swiss') return typeof match.round === 'number';
    if (stage.type === 'groups' || stage.type === 'group_round_robin') return match.stagePhase === 'groups' || typeof match.groupRound === 'number';
    if (stage.type === 'single_elimination') return !!match.phase;
    if (stage.type === 'double_elimination') return match.stagePhase === 'double_elimination' || !!match.doubleEliminationRound;
    return false;
  });
}

function getVisibleStageMatches(s, stage) {
  const matches = getStageMatchesForAdmin(stage, s);
  if (stage?.type === 'swiss' && s.phase === 'swiss') {
    return matches.filter(match => match.round === s.round);
  }
  if (isGroupStage(stage) && s.phase === 'groups') {
    const round = currentGroupRound(s, stage);
    return matches.filter(match => normalizeGroupRound(match.groupRound, 1) === round);
  }
  return matches;
}

function stageArenaTitle(s, stage, matches) {
  if (isTournamentFinished(s)) return `比赛结果 · ${stageTypeName(stage.type)}`;
  if (stage?.type === 'swiss' && s.phase === 'swiss') {
    const rs = roundStats(s.round, matches);
    return `瑞士轮 · 第 ${s.round} 轮 · ${rs.done}/${rs.total} 已完成`;
  }
  if (isGroupStage(stage) && s.phase === 'groups') {
    const currentRound = currentGroupRound(s, stage);
    const rs = {
      done: matches.filter(match => match.done).length,
      total: matches.length,
    };
    return `小组赛 · 第 ${currentRound} 轮 · ${rs.done}/${rs.total} 已完成`;
  }
  if (isGroupStage(stage)) return `小组赛 · ${stage.name || stage.id}`;
  if (stage?.type === 'double_elimination') return `双败淘汰 · ${stage.name || stage.id}`;
  return `${stageTypeName(stage.type)} · ${stage.name || stage.id}`;
}

function renderFinalSummary(s, stage, standings) {
  const label = participantLabel(s);
  const champion = standings.find(row => Number(row.rank) === 1)?.player || s.stageResults?.[stage.id]?.metadata?.champion || s.doubleElimination?.[stage.id]?.champion || '';
  const podium = standings.slice(0, 4);
  if (podium.length === 0 && !champion) return '';
  return `<div class="stage-result-summary">
    <div class="stage-result-head">
      <div>
        <div class="stage-result-title">已完成</div>
        <div class="stage-result-meta">${stage.name || stageTypeName(stage.type)} · ${participantUnitLabel(s)}</div>
      </div>
      ${champion ? `<div class="stage-champion"><span>冠军</span><strong>${escHtml(champion)}</strong></div>` : ''}
    </div>
    ${podium.length > 0 ? `<div class="stage-standings">
      ${podium.map(row => `<div class="stage-standing-row">
        <span>#${escHtml(row.rank)}</span>
        <strong>${escHtml(row.player || row.displayName || '')}</strong>
        <small>${escHtml(label)}</small>
      </div>`).join('')}
    </div>` : ''}
  </div>`;
}

// ── 对局卡片 ─────────────────────────────────────────────
function matchCard(s, m, isTop8) {
  const isLive = s.currentLiveMatch && s.currentLiveMatch.id === m.id;
  const tournamentFinished = isTournamentFinished(s);
  const stage = Array.isArray(s.stages) ? s.stages.find(item => item.id === m.stageId) : null;
  const rules = stage && stage.matchRules ? stage.matchRules : {};
  const label = participantLabel(s);
  const isGamesScore = isTop8 || usesGameScoreRules(rules, stage);
  const bestOf = Number(rules.bestOf || (isGamesScore ? 3 : 1));
  const maxWins = Math.max(1, Math.floor(bestOf / 2) + 1);
  const allowDraw = rules.allowDraw !== false && !isGamesScore;
  const hasOtherLiveMatch = s.currentLiveMatch && s.currentLiveMatch.id !== m.id;
  const liveClosedThisScope = s.matches.some(other =>
    other.id !== m.id &&
    other.wasLive &&
    other.done &&
    (
      (typeof m.round === 'number' && other.round === m.round) ||
      (m.phase && other.phase === m.phase)
    ),
  ) || (m.wasLive && m.done);
  const canOperate = canOperateMatch(m, s);
  const waitingOpponent = !m.done && !canOperate;
  const cardClass = `match-card${isLive ? ' live' : ''}${m.done ? ' done' : ''}${waitingOpponent ? ' waiting-opponent' : ''}`;
  const p1Won = m.winner === m.p1, p2Won = m.winner === m.p2;
  const featured = new Set(s.featuredSwissPlayers || []);
  const p1Featured = !isTop8 && featured.has(m.p1);
  const p2Featured = !isTop8 && featured.has(m.p2);
  const escP1 = (m.p1 || '').replace(/'/g, "\\'");
  const escP2 = (m.p2 || '').replace(/'/g, "\\'");
  const p1Placeholder = isPlaceholderEntrant(m.p1);
  const p2Placeholder = isPlaceholderEntrant(m.p2);
  const p1Display = m.p1 === 'BYE' ? '轮空' : (p1Placeholder ? '待定' : m.p1);
  const p2Display = m.p2 === 'BYE' ? '轮空' : (p2Placeholder ? '待定' : m.p2);
  const lockedClass = waitingOpponent ? ' locked' : '';
  const groupText = isGroupStage(stage) ? matchGroupLabel(m) : '';
  const bracketText = m.bracket === 'winners' ? '胜者组' : m.bracket === 'losers' ? '败者组' : m.bracket === 'grand_final' ? '总决赛' : '';
  const roundText = m.doubleEliminationRound ? `第 ${m.doubleEliminationRound} 轮` : (m.bracketRound ? `第 ${m.bracketRound} 轮` : (m.groupRound ? `第 ${m.groupRound} 轮` : ''));
  const tableText = m.table ? `桌 ${m.table}` : '';
  const matchMeta = [groupText, bracketText, roundText, tableText].filter(Boolean).join(' · ') || '对局';
  let bo3Html = '';
  if (isGamesScore && (m.p1Wins > 0 || m.p2Wins > 0)) {
    const pw1 = m.p1Wins || 0, pw2 = m.p2Wins || 0;
    const dots = Array.from({ length: maxWins }, (_, i) => i);
    bo3Html = `<div class="bo3-row">
      <div class="bo3-player"><span class="bo3-score-num${pw1 >= maxWins ? ' winning' : ''}">${pw1}</span><div class="bo3-dots">${dots.map(i => `<div class="bo3-dot${i < pw1 ? ' win' : ''}"></div>`).join('')}</div></div>
      <span style="color:#475569;font-size:10px;">—</span>
      <div class="bo3-player"><div class="bo3-dots">${dots.map(i => `<div class="bo3-dot${i < pw2 ? ' win' : ''}"></div>`).join('')}</div><span class="bo3-score-num${pw2 >= maxWins ? ' winning' : ''}">${pw2}</span></div>
    </div>`;
  }
  return `<div class="${cardClass}">
    <div class="match-header">
      <span class="match-meta">${escHtml(matchMeta)}</span>
      <div class="match-header-actions">
        ${!tournamentFinished && !m.done && isLive
          ? `<button class="btn live-btn active" onclick="setLive('${m.id}')">取消直播</button>`
          : (!tournamentFinished && !m.done && !hasOtherLiveMatch && !liveClosedThisScope
              ? `<button class="btn live-btn" onclick="setLive('${m.id}')">${m.liveRoomCode ? `设为直播(${m.liveRoomCode})` : '设为直播'}</button>`
              : '')}
        ${canOperate && !m.done ? `<button class="btn match-btn" onclick="swapSeats('${m.id}')">换座</button>` : ''}
        ${allowDraw && canOperate && !m.done ? `<button class="btn match-btn warn" onclick="setDraw('${m.id}')">平局</button>` : ''}
        ${m.done ? '<span style="color:#22c55e;font-weight:700;">✅</span>' : ''}
      </div>
    </div>
    <div class="match-players">
      <div class="seat-group">
        ${!isGamesScore && canOperate ? `<button class="seat-drop-btn" onclick="dropPlayerFromMatchAction('${m.id}','${escP1}')" title="左侧${label}退赛">退</button>` : ''}
        ${isGamesScore && canOperate ? `<div class="score-stack"><button class="btn score-btn" onclick="adjustScore('${m.id}','p1',-1)">-1</button><button class="btn score-btn" onclick="adjustScore('${m.id}','p1',1)">+1</button></div>` : ''}
        <div class="player-side ${p1Won ? 'won' : p2Won ? 'lost' : ''}${p1Placeholder ? ' tbd' : ''}${lockedClass}${p1Featured ? ' tv' : ''}" onclick="${canOperate && !p1Placeholder ? `setResult('${m.id}','${escP1}')` : ''}">${escHtml(p1Display)}</div>
      </div>
      <div class="vs">VS</div>
      <div class="seat-group right">
        <div class="player-side ${p2Won ? 'won' : p1Won ? 'lost' : ''}${p2Placeholder ? ' tbd' : ''}${lockedClass}${p2Featured ? ' tv' : ''}" onclick="${canOperate && !p2Placeholder ? `setResult('${m.id}','${escP2}')` : ''}">${escHtml(p2Display)}</div>
        ${isGamesScore && canOperate ? `<div class="score-stack"><button class="btn score-btn" onclick="adjustScore('${m.id}','p2',1)">+1</button><button class="btn score-btn" onclick="adjustScore('${m.id}','p2',-1)">-1</button></div>` : ''}
        ${!isGamesScore && canOperate ? `<button class="seat-drop-btn" onclick="dropPlayerFromMatchAction('${m.id}','${escP2}')" title="右侧${label}退赛">退</button>` : ''}
      </div>
    </div>
    ${bo3Html}
    ${waitingOpponent ? '<div class="match-waiting-note">等待对手确认后可操作</div>' : ''}
  </div>`;
}

function adjustScore(matchId, side, delta) {
  const m = currentState.matches.find(x => x.id === matchId);
  if (!m) return;
  if (!canOperateMatch(m, currentState)) return;
  const stage = Array.isArray(currentState.stages) ? currentState.stages.find(item => item.id === m.stageId) : null;
  const bestOf = Number(stage?.matchRules?.bestOf || 3);
  const maxWins = Math.max(1, Math.floor(bestOf / 2) + 1);
  const pw1 = Math.max(0, m.p1Wins || 0);
  const pw2 = Math.max(0, m.p2Wins || 0);
  if (side === 'p1') {
    const next = Math.max(0, Math.min(maxWins, pw1 + delta));
    setBo3Score(matchId, next, pw2);
  } else {
    const next = Math.max(0, Math.min(maxWins, pw2 + delta));
    setBo3Score(matchId, pw1, next);
  }
}

// ── 叠加层预览 ──────────────────────────────────────────
function renderOverlay(s) {
  const baseUrl = s.publicBaseUrl || location.origin;
  const previewUrl = `/t/${encodeURIComponent(s.tournamentId)}/overlay`;
  const url = `${baseUrl}/t/${encodeURIComponent(s.tournamentId)}/overlay`;
  document.getElementById('overlayUrl').textContent = url;
  const frame = document.getElementById('overlayFrame');
  updateOverlayPreviewScale();
  if (frame.getAttribute('src') !== previewUrl) { frame.src = previewUrl; frame.style.display = 'block'; }
  const names = { idle:'空闲', live:'直播中', result:'胜者展示(直播桌)', overview:'全场总览', 'top8-live':'淘汰赛直播', 'top8-result':'胜者展示(局分)', 'top8-bracket':'淘汰赛对阵图', 'swiss-ended':'瑞士轮排名' };
  const live = s.currentLiveMatch;
  const stage = getActiveStage(s);
  const rules = normalizeMatchRules(stage);
  const fallback = document.getElementById('overlayPreviewFallback');
  if (fallback) {
    fallback.classList.add('hidden');
    const title = live
      ? `${live.p1 || '待定'} vs ${live.p2 || '待定'}`
      : (names[s.overlayState] || s.overlayState || '全场总览');
    const stageName = stage?.name || stageTypeName(stage?.type) || stageStructureLabel(s);
    const progress = stage ? `${stage.completedMatchCount || 0}/${stage.matchCount || 0} 已完成` : '';
    const meta = live
      ? `${stageName} · 桌 ${live.table || '-'}`
      : [s.tournamentName || '', stageName, progress].filter(Boolean).join(' · ');
    fallback.innerHTML = `
      <div class="overlay-preview-kicker">${escHtml(names[s.overlayState] || s.overlayState || 'OVERLAY')}</div>
      <div class="overlay-preview-title">${escHtml(title)}</div>
      <div class="overlay-preview-meta">${escHtml(meta)}</div>
    `;
  }
}

// ── 启动 ─────────────────────────────────────────────────
const publicBaseUrlInput = document.getElementById('publicBaseUrlInput');
const publicBaseUrlConfirmBtn = document.getElementById('publicBaseUrlConfirmBtn');
publicBaseUrlConfirmBtn.addEventListener('pointerdown', () => { publicBaseUrlConfirming = true; });
publicBaseUrlConfirmBtn.addEventListener('click', async () => {
  try {
    await confirmPublicBaseUrl();
  } finally {
    publicBaseUrlConfirming = false;
  }
});
publicBaseUrlInput.addEventListener('blur', () => {
  window.setTimeout(() => {
    if (publicBaseUrlConfirming || document.activeElement === publicBaseUrlConfirmBtn) return;
    cancelPublicBaseUrlEdit();
  }, 0);
});
publicBaseUrlInput.addEventListener('input', () => setPublicBaseUrlMessage(''));
publicBaseUrlInput.addEventListener('keydown', evt => {
  if (evt.key === 'Enter') {
    evt.preventDefault();
    publicBaseUrlConfirmBtn.click();
  } else if (evt.key === 'Escape') {
    evt.preventDefault();
    cancelPublicBaseUrlEdit();
    publicBaseUrlInput.blur();
  }
});
const liveRoomCodeInput = document.getElementById('liveRoomCodeInput');
const liveRoomCodeSaveBtn = document.getElementById('liveRoomCodeSaveBtn');
liveRoomCodeSaveBtn?.addEventListener('click', saveLiveRoomCode);
liveRoomCodeInput?.addEventListener('input', () => setLiveRoomCodeMessage(''));
liveRoomCodeInput?.addEventListener('keydown', evt => {
  if (evt.key === 'Enter') {
    evt.preventDefault();
    liveRoomCodeSaveBtn?.click();
  }
});
apiGet('/state').then(state => { if (state && state.phase) render(state); });

Object.assign(window.PTSAdmin, { setLive, setResult, setDraw, swapSeats, dropPlayerFromMatchAction, setBo3Score, roundStats, top8PhaseStats, eliminationPhaseLabel, wdlHtml, getRecord2, hasOpponent, getActiveStage, normalizeMatchRules, render, removeLegacySwissControls, stageTypeName, renderStages, renderPlayers, renderTop8Bracket, renderStageArena, renderStageArenaActions, matchCard, adjustScore, renderOverlay });
removeLegacySwissControls();
flushPendingSocketState();
