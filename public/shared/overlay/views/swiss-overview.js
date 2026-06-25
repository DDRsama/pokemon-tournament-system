// Swiss overview renderer.

window.PTSOverlay = window.PTSOverlay || {};

function renderOverview(s) {
  renderOverviewInto(document, s);
}

function renderOverviewInto(root, s, ctx) {
  // 仅传统 Top 8 预览保留专用旧总览；Top 4 / Top 16 等走通用淘汰赛总览。
  if (s.phase === 'top8' && window.PTSOverlay?.shouldUseTop8Bracket?.(s) && s.overlayState === 'top8-overview') {
    renderTop8Overview(s);
    return;
  }

  if (s.phase !== 'swiss') {
    renderStageOverviewInto(root, s, ctx);
    return;
  }

  // 恢复瑞士轮左右分栏（淘汰赛总览可能隐藏了它们）
  const el = root.querySelector('#state-overview');
  if (!el) return;
  clearDoubleEliminationOverview(root);
  const ovLeft = el.querySelector('.ov-left');
  const ovRight = el.querySelector('.ov-right');
  if (ovLeft) { ovLeft.style.display = ''; }
  if (ovRight) { ovRight.style.display = ''; }
  // 右侧对阵表2列
  var tl = root.querySelector('#ovTableList');
  if (tl) {
    tl.classList.remove('is-group-stage');
    tl.style.display = 'grid';
    tl.style.gridTemplateColumns = '1fr 1fr';
    tl.style.gap = '';
  }
  const bracketEl = root.querySelector('#top8-overview-bracket');
  if (bracketEl) bracketEl.style.display = 'none';

  root.querySelector('#ovRoundName').textContent = '瑞士轮排名';
  root.querySelector('#ovRoundTag').textContent = `Round ${s.round}`;

  const matches = Array.isArray(s.matches) ? s.matches : [];
  const players = Array.isArray(s.players) ? s.players : [];
  const rms = matches.filter(m => m.round === s.round);
  const done = rms.filter(m => m.done).length;
  const total = rms.length;
  root.querySelector('#ovProgressText').textContent = `${done}/${total} 已完成`;
  root.querySelector('#ovProgressFill').style.width = total > 0 ? `${(done/total)*100}%` : '0%';

  // 左侧积分榜使用后端 standings，确保 tiebreak 与后台一致。
  const dropped = new Set(s.droppedPlayers || []);
  const standings = Array.isArray(s.playerStandings) && s.playerStandings.length
    ? s.playerStandings
    : [...players]
        .filter(p => p !== 'BYE')
        .sort((a, b) => recCmp(a, b, matches))
        .map((player, index) => {
          const rec = getRecord(player, matches);
          return { player, rank: index + 1, wins: rec.w, draws: rec.d, losses: rec.l, points: rec.pts };
        });
  const sorted = standings.filter(entry => entry.player && entry.player !== 'BYE' && !dropped.has(entry.player));
  var plEl = root.querySelector('#ovPlayerList');
  if (!plEl) return;
  plEl.classList.remove('is-group-standings');
  const previousTops = new Map(
    Array.from(plEl.querySelectorAll('.ov-pitem[data-player]')).map(el => [el.dataset.player, el.getBoundingClientRect().top])
  );
  const previousScoreSigs = new Map(
    Array.from(plEl.querySelectorAll('.ov-pitem[data-player]')).map(el => [el.dataset.player, el.dataset.scoreSig || ''])
  );
  const previousStats = new Map(
    Array.from(plEl.querySelectorAll('.ov-pitem[data-player]')).map(el => [el.dataset.player, {
      wins: Number(el.dataset.wins || 0),
      draws: Number(el.dataset.draws || 0),
      losses: Number(el.dataset.losses || 0),
      points: Number(el.dataset.points || 0),
    }])
  );
  plEl.style.display = 'grid';
  plEl.style.gridTemplateColumns = '';
  plEl.style.gap = '';
  plEl.innerHTML = sorted.map(function(entry, i) {
    const p = entry.player;
    const rank = entry.rank || (i + 1);
    var rec = {
      w: entry.wins ?? entry.w ?? 0,
      d: entry.draws ?? entry.d ?? 0,
      l: entry.losses ?? entry.l ?? 0,
      pts: entry.points ?? entry.pts ?? 0,
    };
    const scoreSig = `${rec.w}-${rec.d}-${rec.l}-${rec.pts}`;
    var rc = rank <= 3 ? 't3' : rank <= 8 ? 't8' : '';
    const playerName = escapeHtml(p);
    return '<div class="ov-pitem ' + (i % 2 === 0 ? 'even' : '') + '" data-player="' + playerName + '" data-score-sig="' + scoreSig + '" data-wins="' + rec.w + '" data-draws="' + rec.d + '" data-losses="' + rec.l + '" data-points="' + rec.pts + '">' +
      '<span class="ov-rank ' + rc + '">' + rank + '</span>' +
      '<span class="ov-pname" title="' + playerName + '">' + playerName + '</span>' +
      '<span class="ov-record">' + renderOverviewRecordChips(rec) + '</span>' +
      '<span class="ov-pts">' + rec.pts + 'pt</span>' +
      '</div>';
  }).join('');
  requestAnimationFrame(() => {
    const plans = Array.from(plEl.querySelectorAll('.ov-pitem[data-player]')).map(el => {
      const oldTop = previousTops.get(el.dataset.player);
      if (typeof oldTop !== 'number') return null;
      const delta = oldTop - el.getBoundingClientRect().top;
      const scoreChanged = previousScoreSigs.has(el.dataset.player)
        && previousScoreSigs.get(el.dataset.player) !== (el.dataset.scoreSig || '');
      const prev = previousStats.get(el.dataset.player);
      const winUp = !!prev && Number(el.dataset.wins || 0) > prev.wins && delta > 2;
      return { el, oldTop, delta, scoreChanged, winUp };
    }).filter(Boolean);
    const focusPlan = plans
      .filter(plan => plan.winUp && Math.abs(plan.delta) >= 2)
      .sort((a, b) => {
        const aUp = a.delta > 0 ? 1 : 0;
        const bUp = b.delta > 0 ? 1 : 0;
        if (aUp !== bUp) return bUp - aUp;
        return Math.abs(b.delta) - Math.abs(a.delta);
      })[0];
    if (focusPlan) {
      const maxScroll = Math.max(0, plEl.scrollHeight - plEl.clientHeight);
      const desiredOffset = Math.max(96, Math.min(Math.round(plEl.clientHeight * 0.34), plEl.clientHeight - 150));
      const targetScrollTop = Math.max(0, Math.min(focusPlan.el.offsetTop - desiredOffset, maxScroll));
      if (Math.abs(targetScrollTop - plEl.scrollTop) > 12) {
        plEl.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        if (ctx) {
          ctx.overviewFollowUntil = Date.now() + 2400;
          const scroller = ctx.overviewScrollers && ctx.overviewScrollers.players;
          if (scroller) {
            scroller.holdUntil = Math.max(scroller.holdUntil || 0, ctx.overviewFollowUntil);
            scroller.direction = targetScrollTop >= plEl.scrollTop ? 1 : -1;
          }
        }
      }
    }
    plans.forEach(({ el, delta, scoreChanged, winUp }) => {
      if (Math.abs(delta) < 2) return;
      if (el._overviewMoveTimer) window.clearTimeout(el._overviewMoveTimer);
      el.classList.toggle('is-moving', winUp);
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)${winUp ? ' scale(1.04)' : ''}`;
      requestAnimationFrame(() => {
        el.style.transition = winUp
          ? 'transform 920ms cubic-bezier(.16,.84,.18,1), box-shadow 920ms ease, border-color 920ms ease, filter 920ms ease'
          : 'transform 620ms cubic-bezier(.2,.8,.2,1)';
        el.style.transform = winUp ? 'scale(1.04)' : '';
        el._overviewMoveTimer = window.setTimeout(() => {
          el.style.transition = 'transform 180ms ease, box-shadow 220ms ease, border-color 220ms ease, filter 220ms ease';
          el.style.transform = '';
          el.classList.remove('is-moving');
          el._overviewMoveTimer = null;
        }, winUp ? 960 : 640);
      });
    });
  });

  // 右侧每桌(双列网格,含 BYE 处理)
  // 桌号排序：成绩好的在上面，轮空排最后面
  const getMatchScore = (m) => {
    if (m.p1 === 'BYE' || m.p2 === 'BYE') return -Infinity;
    const p1Rec = getRecord(m.p1, matches);
    const p2Rec = getRecord(m.p2, matches);
    const pts = Math.max(p1Rec ? p1Rec.pts : 0, p2Rec ? p2Rec.pts : 0);
    const w = Math.max(p1Rec ? p1Rec.w : 0, p2Rec ? p2Rec.w : 0);
    return pts * 1000 + w; // 按积分+胜场排序
  };
  const sortedM = [...rms].sort((a, b) => getMatchScore(b) - getMatchScore(a));
  const tableList = root.querySelector('#ovTableList');
  if (!tableList) return;
  const tableTitle = root.querySelector('#ovTableTitle');
  const tableSubtitle = root.querySelector('#ovTableSubtitle');
  if (tableTitle) tableTitle.textContent = '对阵桌';
  if (tableSubtitle) tableSubtitle.textContent = 'Round ' + s.round;
  tableList.classList.remove('is-compact');
  tableList.innerHTML = sortedM.map(m => {
    const isLive = s.currentLiveMatch && s.currentLiveMatch.id === m.id;
    const isBye = m.p1 === 'BYE' || m.p2 === 'BYE';
    const p1W = m.winner === m.p1, p2W = m.winner === m.p2;
    let badge = '';
    if (isBye) badge = '<span class="status-badge done">轮空</span>';
    else if (isLive) badge = '<span class="status-badge live">直播中</span>';
    else if (m.done) badge = '<span class="status-badge done">已结束</span>';
    else badge = '<span class="status-badge waiting">等待中</span>';
    const dropped2 = new Set(s.droppedPlayers || []);
    const p1d = m.p1 === 'BYE' ? '轮空' : (m.p1 || 'TBD');
    const p2d = m.p2 === 'BYE' ? '轮空' : (m.p2 || 'TBD');
    const p1Cls = 'p1n' + (p1W ? ' won' : p2W || dropped2.has(m.p1) ? ' lost' : '');
    const p2Cls = 'p1n right' + (p2W ? ' won' : p1W || dropped2.has(m.p2) ? ' lost' : '');
    return `<div class="ov-card${isBye || m.done ? ' done' : ''}${isLive ? ' live' : ''}">
      <div class="table-num">${m.table || '?'}</div>
      <div class="player-block">
        <span class="${p1Cls}" title="${escapeHtml(p1d)}">${renderMarqueeText(p1d)}</span>
        <span class="vs-mini">VS</span>
        <span class="${p2Cls}" title="${escapeHtml(p2d)}">${renderMarqueeText(p2d)}</span>
      </div>
      ${badge}
    </div>`;
  }).join('');
}

function stageOverviewLabel(value) {
  return {
    groups: '小组赛',
    'groups-ended': '小组赛结果',
    double_elimination: '双败淘汰',
    'double_elimination-ended': '双败淘汰结果',
    winners: '胜者组',
    losers: '败者组',
    grand_final: '总决赛',
    'Quarter Finals': '八强赛',
    'Semi Finals': '半决赛',
    'Bronze Match': '季军赛',
    Finals: '决赛',
    'Round of 16': '十六强赛',
    'Round of 32': '三十二强赛',
  }[value] || value || '赛事阶段';
}

function isTeamOverlayState(s) {
  const settings = s && (s.tournamentSettings || s.settings || {});
  if (settings.entrantType === 'team') return true;
  return Array.isArray(s && s.entrants) && s.entrants.some(entrant => entrant && entrant.entrantType === 'team');
}

function overlayParticipantLabel(s) {
  return isTeamOverlayState(s) ? '队伍' : '选手';
}

function isGroupOverviewStage(stage, phase) {
  return phase === 'groups' || phase === 'groups-ended' || stage?.type === 'groups' || stage?.type === 'group_round_robin';
}

function overlayGroupLabelFromIndex(index) {
  const n = Number(index);
  if (!Number.isInteger(n) || n <= 0) return '小组';
  if (n <= 26) return `${String.fromCharCode(64 + n)}组`;
  return `第 ${n} 组`;
}

function overlayMatchGroupLabel(match) {
  return match?.groupLabel || overlayGroupLabelFromIndex(match?.groupIndex);
}

function overlayGroupKey(group) {
  return group.id || group.groupId || group.label || group.index || 'group';
}

function overlayMatchGroupKey(match) {
  return match.groupId || match.groupLabel || match.groupIndex || 'group';
}

function overlayGroupAdvanceCount(stage) {
  const count = Number(stage?.groups?.advancePerGroup ?? stage?.advancement?.count ?? 1);
  return Number.isInteger(count) && count > 0 ? count : 1;
}

function normalizeOverlayGroupRound(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function overlayCurrentGroupRound(s, stage) {
  return normalizeOverlayGroupRound(
    stage?.id ? s?.groupStageRounds?.[stage.id] : null,
    normalizeOverlayGroupRound(s?.groupRound, 1),
  );
}

function overlayGroupRoundCount(matches) {
  return matches.reduce((max, match) => Math.max(max, normalizeOverlayGroupRound(match.groupRound, 1)), 0);
}

function compareOverlayGroupMatches(a, b) {
  const ar = Number(a.groupRound || a.round || 0);
  const br = Number(b.groupRound || b.round || 0);
  if (ar !== br) return ar - br;
  const at = Number(a.table || 0);
  const bt = Number(b.table || 0);
  if (at !== bt) return at - bt;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function buildOverlayGroupViews(s, stage, matches) {
  const assigned = Array.isArray(s?.groupAssignments?.[stage?.id]) ? s.groupAssignments[stage.id] : [];
  const groups = new Map();
  assigned.forEach(group => {
    const label = group.label || overlayGroupLabelFromIndex(group.index);
    groups.set(overlayGroupKey(group), {
      id: group.id,
      index: Number(group.index) || groups.size + 1,
      label,
      entrants: [...(group.entrants || [])],
      matches: [],
    });
  });

  matches.forEach(match => {
    const key = overlayMatchGroupKey(match);
    if (!groups.has(key)) {
      groups.set(key, {
        id: match.groupId || key,
        index: Number(match.groupIndex) || groups.size + 1,
        label: overlayMatchGroupLabel(match),
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
      const groupMatches = group.matches.slice().sort(compareOverlayGroupMatches);
      const standings = sortOverlayGroupStandings(
        group.entrants.map(player => buildOverlayGroupStandingEntry(player, groupMatches)),
        groupMatches,
      ).map((entry, index) => ({ ...entry, rank: index + 1 }));
      return { ...group, matches: groupMatches, standings };
    });
}

function buildOverlayGroupStandingEntry(player, matches) {
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

function overlayGroupHeadToHeadResult(a, b, matches) {
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

function sortOverlayGroupStandings(standings, matches) {
  return standings.slice().sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.omw !== a.omw) return b.omw - a.omw;
    if (b.oow !== a.oow) return b.oow - a.oow;
    if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
    if (b.gameWins !== a.gameWins) return b.gameWins - a.gameWins;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const headToHead = overlayGroupHeadToHeadResult(a.player, b.player, matches);
    if (headToHead !== 0) return headToHead;
    return String(a.player).localeCompare(String(b.player), 'zh-CN');
  });
}

function overlayGroupMatchStatus(match, s) {
  if (!match) return { label: '等待', className: 'waiting' };
  if (match.p1 === 'BYE' || match.p2 === 'BYE') return { label: '轮空', className: 'done' };
  if (s.currentLiveMatch && s.currentLiveMatch.id === match.id) return { label: '直播中', className: 'live' };
  if (match.done) return { label: '已结束', className: 'done' };
  return { label: '等待', className: 'waiting' };
}

function renderOverlayGroupStandingRow(entry, advancePerGroup) {
  const qualified = Number(entry.rank) <= Number(advancePerGroup || 1);
  const record = `${entry.wins}-${entry.draws}-${entry.losses}`;
  return `<div class="ov-group-standing-row${qualified ? ' is-advance' : ''}">
    <span class="ov-group-rank">#${escapeHtml(entry.rank)}</span>
    <span class="ov-group-name" title="${escapeHtml(entry.player)}">${renderMarqueeText(entry.player)}</span>
    <span class="ov-group-record">${escapeHtml(record)}</span>
    <span class="ov-group-points">${escapeHtml(entry.points)}pt</span>
  </div>`;
}

function renderOverlayGroupCard(group, advancePerGroup) {
  const done = group.matches.filter(match => match.done).length;
  return `<section class="ov-group-card">
    <header class="ov-group-card-head">
      <strong>${escapeHtml(group.label)}</strong>
      <span>${done}/${group.matches.length}</span>
    </header>
    <div class="ov-group-standing-list">
      ${group.standings.map(entry => renderOverlayGroupStandingRow(entry, advancePerGroup)).join('')}
    </div>
  </section>`;
}

function renderOverlayGroupMatchCard(match, s) {
  const status = overlayGroupMatchStatus(match, s);
  const isLive = status.className === 'live';
  const isDone = status.className === 'done';
  const p1W = match.winner && match.winner === match.p1;
  const p2W = match.winner && match.winner === match.p2;
  const p1d = match.p1 === 'BYE' ? '轮空' : (match.p1 || '待定');
  const p2d = match.p2 === 'BYE' ? '轮空' : (match.p2 || '待定');
  const p1Cls = 'p1n' + (p1W ? ' won' : p2W ? ' lost' : '');
  const p2Cls = 'p1n right' + (p2W ? ' won' : p1W ? ' lost' : '');
  const p1ScoreCls = 'ov-card-score' + (p1W ? ' win' : '');
  const p2ScoreCls = 'ov-card-score' + (p2W ? ' win' : '');
  return `<article class="ov-card ov-group-match-card${isDone ? ' done' : ''}${isLive ? ' live' : ''}">
    <div class="table-num">${escapeHtml(match.table || '?')}</div>
    <div class="player-block">
      <div class="ov-group-player">
        <span class="${p1Cls}" title="${escapeHtml(p1d)}">${renderMarqueeText(p1d)}</span>
        <span class="${p1ScoreCls}">${escapeHtml(match.p1Wins || 0)}</span>
      </div>
      <span class="vs-mini">VS</span>
      <div class="ov-group-player right">
        <span class="${p2ScoreCls}">${escapeHtml(match.p2Wins || 0)}</span>
        <span class="${p2Cls}" title="${escapeHtml(p2d)}">${renderMarqueeText(p2d)}</span>
      </div>
    </div>
    <span class="status-badge ${status.className}">${escapeHtml(status.label)}</span>
  </article>`;
}

function renderOverlayGroupMatchSection(group, s) {
  const done = group.matches.filter(match => match.done).length;
  return `<section class="ov-group-match-section">
    <header class="ov-group-match-head">
      <strong>${escapeHtml(group.label)}</strong>
      <span>${done}/${group.matches.length}</span>
    </header>
    <div class="ov-group-match-grid">
      ${group.matches.map(match => renderOverlayGroupMatchCard(match, s)).join('')}
    </div>
  </section>`;
}

function renderGroupOverviewInto(root, s, ctx, activeStage, stageMatches) {
  const el = root.querySelector('#state-overview');
  if (!el) return;
  clearDoubleEliminationOverview(root);
  const ovLeft = el.querySelector('.ov-left');
  const ovRight = el.querySelector('.ov-right');
  if (ovLeft) ovLeft.style.display = '';
  if (ovRight) ovRight.style.display = '';
  const bracketEl = root.querySelector('#top8-overview-bracket');
  if (bracketEl) bracketEl.style.display = 'none';

  const currentRound = overlayCurrentGroupRound(s, activeStage);
  const roundCount = overlayGroupRoundCount(stageMatches);
  const visibleStageMatches = s.phase === 'groups'
    ? stageMatches.filter(match => normalizeOverlayGroupRound(match.groupRound, 1) === currentRound)
    : stageMatches;
  const groups = buildOverlayGroupViews(s, activeStage, stageMatches);
  const visibleMatchIds = new Set(visibleStageMatches.map(match => match.id));
  const visibleGroups = groups.map(group => ({
    ...group,
    matches: group.matches.filter(match => visibleMatchIds.has(match.id)),
  }));
  const advancePerGroup = overlayGroupAdvanceCount(activeStage);
  const done = stageMatches.filter(match => match.done).length;
  const total = stageMatches.length;
  const roundDone = visibleStageMatches.filter(match => match.done).length;

  root.querySelector('#ovRoundName').textContent = activeStage?.name || '小组赛';
  root.querySelector('#ovRoundTag').textContent = `${groups.length} 组 · 第 ${currentRound}/${roundCount || 1} 轮`;
  root.querySelector('#ovProgressText').textContent = `本轮 ${roundDone}/${visibleStageMatches.length} · 总 ${done}/${total}`;
  root.querySelector('#ovProgressFill').style.width = total > 0 ? `${(done / total) * 100}%` : '0%';

  const plEl = root.querySelector('#ovPlayerList');
  if (plEl) {
    plEl.classList.add('is-group-standings');
    plEl.style.display = 'grid';
    plEl.style.gridTemplateColumns = '';
    plEl.style.gap = '';
    plEl.innerHTML = groups.length > 0
      ? groups.map(group => renderOverlayGroupCard(group, advancePerGroup)).join('')
      : '<div class="ov-group-empty">等待生成小组</div>';
  }

  const tableList = root.querySelector('#ovTableList');
  if (!tableList) return;
  const tableTitle = root.querySelector('#ovTableTitle');
  const tableSubtitle = root.querySelector('#ovTableSubtitle');
  if (tableTitle) tableTitle.textContent = '小组对阵';
  if (tableSubtitle) tableSubtitle.textContent = `第 ${currentRound}/${roundCount || 1} 轮`;
  tableList.classList.remove('is-compact');
  tableList.classList.add('is-group-stage');
  tableList.style.display = 'grid';
  tableList.style.gridTemplateColumns = '';
  tableList.style.gap = '';
  tableList.innerHTML = groups.length > 0
    ? visibleGroups.map(group => renderOverlayGroupMatchSection(group, s)).join('')
    : '<div class="ov-group-empty">暂无小组对局</div>';
}

function clearDoubleEliminationOverview(root) {
  const shell = root.querySelector('#state-overview .de-shell');
  if (shell) shell.remove();
}

function doubleEliminationBracket(match) {
  return (match && (match.bracket || match.phase || match.stagePhase)) || '';
}

function doubleEliminationBracketLabel(value) {
  const bracket = typeof value === 'string' ? value : doubleEliminationBracket(value);
  return stageOverviewLabel(bracket);
}

function doubleEliminationBracketPriority(bracket) {
  return {
    grand_final: 0,
    winners: 1,
    losers: 2,
  }[bracket] ?? 99;
}

function doubleEliminationRoundNumber(match) {
  return Number(match && (match.doubleEliminationRound || match.bracketRound || match.groupRound || match.round || 0)) || 0;
}

function doubleEliminationScopeLabel(match) {
  if (!match) return '双败淘汰';
  const bracket = match.bracket || match.phase || match.stagePhase || '';
  if (bracket === 'grand_final') {
    return match.finalReset ? '总决赛重置局' : '总决赛';
  }
  const round = doubleEliminationRoundNumber(match);
  const bracketLabel = stageOverviewLabel(bracket);
  return round > 0 ? `${bracketLabel} 第 ${round} 轮` : bracketLabel;
}

function compareDoubleEliminationMatches(a, b) {
  const ap = doubleEliminationBracketPriority(a && (a.bracket || a.phase || a.stagePhase));
  const bp = doubleEliminationBracketPriority(b && (b.bracket || b.phase || b.stagePhase));
  if (ap !== bp) return ap - bp;
  const ar = doubleEliminationRoundNumber(a);
  const br = doubleEliminationRoundNumber(b);
  if (ar !== br) return ar - br;
  const at = Number((a && a.table) || 0);
  const bt = Number((b && b.table) || 0);
  if (at !== bt) return at - bt;
  return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
}

function getVisibleDoubleEliminationMatches(s, stageMatches) {
  return getVisibleDoubleEliminationMatchGroups(s, stageMatches).flatMap(group => group.matches);
}

function getVisibleDoubleEliminationMatchGroups(s, stageMatches) {
  const matches = Array.isArray(stageMatches) ? stageMatches : [];
  if (matches.length === 0) return [];
  const unfinished = matches.filter(match => !match.done);
  const liveMatch = s && s.currentLiveMatch
    ? matches.find(match => match.id === s.currentLiveMatch.id) || null
    : null;

  const bracketOrder = ['winners', 'losers', 'grand_final'];
  const groups = [];
  for (const bracket of bracketOrder) {
    const bracketMatches = matches
      .filter(match => doubleEliminationBracket(match) === bracket)
      .sort(compareDoubleEliminationMatches);
    if (bracketMatches.length === 0) continue;
    const bracketUnfinished = bracketMatches.filter(match => !match.done);
    const liveInBracket = liveMatch && doubleEliminationBracket(liveMatch) === bracket ? liveMatch : null;
    if (!liveInBracket && bracketUnfinished.length === 0) continue;
    const selected = liveInBracket || bracketUnfinished[0];
    const round = doubleEliminationRoundNumber(selected);
    const visible = bracketMatches.filter(match => doubleEliminationRoundNumber(match) === round);
    groups.push({
      bracket,
      label: doubleEliminationScopeLabel(selected),
      matches: visible.length > 0 ? visible.sort(compareDoubleEliminationMatches) : [selected],
    });
  }

  if (groups.length > 0) return groups;

  const selected = matches.slice().sort(compareDoubleEliminationMatches).find(Boolean);
  if (!selected) return [];
  return [{
    bracket: doubleEliminationBracket(selected),
    label: doubleEliminationScopeLabel(selected),
    matches: matches.filter(match =>
      doubleEliminationBracket(match) === doubleEliminationBracket(selected) &&
      doubleEliminationRoundNumber(match) === doubleEliminationRoundNumber(selected)
    ).sort(compareDoubleEliminationMatches),
  }];
}

function doubleEliminationRoundOnlyLabel(match) {
  if (!match) return '待生成';
  if (doubleEliminationBracket(match) === 'grand_final') {
    return match.finalReset ? '重置局' : '总决赛';
  }
  const round = doubleEliminationRoundNumber(match);
  return round > 0 ? `第 ${round} 轮` : '待定';
}

function doubleEliminationScoreText(match, side) {
  if (!match) return '-';
  return String(side === 'p1' ? (match.p1Wins || 0) : (match.p2Wins || 0));
}

function doubleEliminationStatus(match, s) {
  if (!match) return { label: '等待', className: 'waiting' };
  if (match.p1 === 'BYE' || match.p2 === 'BYE') return { label: '轮空', className: 'done' };
  if (s.currentLiveMatch && s.currentLiveMatch.id === match.id) return { label: '直播中', className: 'live' };
  if (match.done) return { label: '已结束', className: 'done' };
  return { label: '等待', className: 'waiting' };
}

function renderDoubleEliminationMatchCard(match, s) {
  const status = doubleEliminationStatus(match, s);
  const isLive = status.className === 'live';
  const isDone = status.className === 'done';
  const p1W = match.winner && match.winner === match.p1;
  const p2W = match.winner && match.winner === match.p2;
  const p1d = match.p1 === 'BYE' ? '轮空' : (match.p1 || '待定');
  const p2d = match.p2 === 'BYE' ? '轮空' : (match.p2 || '待定');
  const p1Cls = 'de-player-line' + (p1W ? ' won' : p2W ? ' lost' : '');
  const p2Cls = 'de-player-line' + (p2W ? ' won' : p1W ? ' lost' : '');
  const p1Score = doubleEliminationScoreText(match, 'p1');
  const p2Score = doubleEliminationScoreText(match, 'p2');
  const p1ScoreCls = 'de-score-box' + (p1W ? ' win' : '');
  const p2ScoreCls = 'de-score-box' + (p2W ? ' win' : '');
  return `<article class="de-match-card${isDone ? ' done' : ''}${isLive ? ' live' : ''}">
    <div class="de-card-head">
      <span class="de-table">桌 ${escapeHtml(match.table || '?')}</span>
      <span class="de-status ${status.className}">${escapeHtml(status.label)}</span>
    </div>
    <div class="de-horizontal-match">
      <div class="${p1Cls}">
        <span class="de-player-name" title="${escapeHtml(p1d)}">${renderMarqueeText(p1d)}</span>
        <span class="${p1ScoreCls}">${p1Score}</span>
      </div>
      <div class="de-versus">VS</div>
      <div class="${p2Cls} right">
        <span class="de-player-name" title="${escapeHtml(p2d)}">${renderMarqueeText(p2d)}</span>
        <span class="${p2ScoreCls}">${p2Score}</span>
      </div>
    </div>
  </article>`;
}

function getDoubleEliminationLaneRows(stageMatches, currentGroups) {
  const activeRounds = new Map((Array.isArray(currentGroups) ? currentGroups : [])
    .map(group => [group.bracket, doubleEliminationRoundNumber(group.matches[0])]));
  return [
    { key: 'winners', label: '胜者组' },
    { key: 'losers', label: '败者组' },
    { key: 'grand_final', label: '总决赛' },
  ].map(lane => {
    const matches = stageMatches
      .filter(match => doubleEliminationBracket(match) === lane.key)
      .sort(compareDoubleEliminationMatches);
    const done = matches.filter(match => match.done).length;
    const total = matches.length;
    const target = matches.find(match => !match.done) || matches[matches.length - 1] || null;
    const active = activeRounds.get(lane.key) === doubleEliminationRoundNumber(target);
    const status = total === 0 ? '待生成' : done >= total ? '已完成' : active ? '当前' : '等待';
    return {
      key: lane.key,
      label: lane.label,
      status,
      active,
      round: total === 0 ? '待生成' : doubleEliminationRoundOnlyLabel(target),
      count: `${done}/${total}`,
    };
  });
}

function renderDoubleEliminationLane(row) {
  const statusClass = row.status === '当前'
    ? ' is-current'
    : row.status === '已完成'
      ? ' is-done'
      : row.status === '待生成'
        ? ' is-empty'
        : '';
  return `<div class="de-lane${row.active ? ' is-current' : ''}">
    <div>
      <div class="de-lane-name">${escapeHtml(row.label)}</div>
      <div class="de-lane-round">${escapeHtml(row.round)}</div>
    </div>
    <div class="de-lane-side">
      <span class="de-lane-status${statusClass}">${escapeHtml(row.status)}</span>
      <span class="de-lane-count">${escapeHtml(row.count)}</span>
    </div>
  </div>`;
}

function renderDoubleEliminationMatchGroup(group, s) {
  const done = group.matches.filter(match => match.done).length;
  const total = group.matches.length;
  const gridClass = total <= 1 ? ' is-single' : total === 2 ? ' is-two' : '';
  return `<section class="de-match-group">
    <div class="de-group-head">
      <div class="de-group-title">${escapeHtml(group.label)}</div>
      <div class="de-group-count">${done}/${total}</div>
    </div>
    <div class="de-match-grid${gridClass}">
      ${group.matches.map(match => renderDoubleEliminationMatchCard(match, s)).join('')}
    </div>
  </section>`;
}

function renderDoubleEliminationOverviewInto(root, s, ctx) {
  const el = root.querySelector('#state-overview');
  if (!el) return;
  const ovLeft = el.querySelector('.ov-left');
  const ovRight = el.querySelector('.ov-right');
  if (ovLeft) ovLeft.style.display = 'none';
  if (ovRight) ovRight.style.display = 'none';
  const bracketEl = root.querySelector('#top8-overview-bracket');
  if (bracketEl) bracketEl.style.display = 'none';

  const activeStage = s.activeStage || null;
  const stageId = activeStage && activeStage.id;
  const matches = Array.isArray(s.matches) ? s.matches : [];
  const stageMatches = matches
    .filter(match => stageId ? match.stageId === stageId : match.stagePhase === s.phase)
    .sort(compareDoubleEliminationMatches);
  const visibleGroups = getVisibleDoubleEliminationMatchGroups(s, stageMatches);
  const visibleMatches = visibleGroups.flatMap(group => group.matches);
  const currentMatch = visibleMatches.find(match => !match.done) || visibleMatches[0] || stageMatches[0] || null;
  const currentTitle = visibleGroups.length > 1
    ? visibleGroups.map(group => group.label).join(' / ')
    : doubleEliminationScopeLabel(currentMatch);
  const currentDone = visibleMatches.filter(match => match.done).length;
  const currentTotal = visibleMatches.length;
  const stageDone = stageMatches.filter(match => match.done).length;
  const stageTotal = stageMatches.length;
  const laneRows = getDoubleEliminationLaneRows(stageMatches, visibleGroups);
  const railSubtitle = visibleGroups.length > 1 ? '同步进行' : doubleEliminationBracketLabel(currentMatch);

  let shell = el.querySelector('.de-shell');
  if (!shell) {
    shell = document.createElement('div');
    shell.className = 'de-shell';
    el.appendChild(shell);
  }

  shell.innerHTML = `<aside class="de-rail">
    <div class="de-rail-head">
      <div class="de-rail-title">阶段轨迹</div>
      <div class="de-rail-subtitle">${escapeHtml(railSubtitle)}</div>
    </div>
    <div class="de-lane-list">${laneRows.map(renderDoubleEliminationLane).join('')}</div>
  </aside>
  <section class="de-main-panel">
    <header class="de-header">
      <div class="de-title-block">
        <div class="de-kicker">${escapeHtml(activeStage?.name || '淘汰赛：双败淘汰')}</div>
        <h1 class="de-round-title">${escapeHtml(currentTitle)}</h1>
      </div>
      <div class="de-progress">
        <div class="de-progress-chip"><span>当前</span><strong>${currentDone}/${currentTotal}</strong></div>
        <div class="de-progress-chip"><span>阶段</span><strong>${stageDone}/${stageTotal}</strong></div>
      </div>
    </header>
    <div class="de-main-body">
      ${visibleGroups.length > 0
        ? `<div class="de-group-list">${visibleGroups.map(group => renderDoubleEliminationMatchGroup(group, s)).join('')}</div>`
        : '<div class="de-empty">等待生成对阵</div>'}
    </div>
  </section>`;
}

function renderStageOverviewInto(root, s, ctx) {
  const el = root.querySelector('#state-overview');
  if (!el) return;
  if (s.phase === 'double_elimination') {
    renderDoubleEliminationOverviewInto(root, s, ctx);
    return;
  }
  clearDoubleEliminationOverview(root);
  const ovLeft = el.querySelector('.ov-left');
  const ovRight = el.querySelector('.ov-right');
  if (ovLeft) ovLeft.style.display = '';
  if (ovRight) ovRight.style.display = '';
  const bracketEl = root.querySelector('#top8-overview-bracket');
  if (bracketEl) bracketEl.style.display = 'none';

  const activeStage = s.activeStage || null;
  const stageId = activeStage && activeStage.id;
  const matches = Array.isArray(s.matches) ? s.matches : [];
  const stageMatches = matches.filter(match => stageId ? match.stageId === stageId : match.stagePhase === s.phase);
  if (isGroupOverviewStage(activeStage, s.phase)) {
    renderGroupOverviewInto(root, s, ctx, activeStage, stageMatches);
    return;
  }
  const visibleMatches = stageMatches;
  const done = stageMatches.filter(match => match.done).length;
  const total = stageMatches.length;
  const stageTitle = activeStage?.name || stageOverviewLabel(s.phase);

  root.querySelector('#ovRoundName').textContent = stageTitle;
  root.querySelector('#ovRoundTag').textContent = stageOverviewLabel(s.phase);
  root.querySelector('#ovProgressText').textContent = `${done}/${total} 已完成`;
  root.querySelector('#ovProgressFill').style.width = total > 0 ? `${(done / total) * 100}%` : '0%';

  const result = stageId && s.stageResults ? s.stageResults[stageId] : null;
  const standings = result && Array.isArray(result.standings) ? result.standings : [];
  const participantLabel = overlayParticipantLabel(s);
  const entrants = Array.isArray(s.entrants) && s.entrants.length > 0
    ? s.entrants.map(entrant => entrant.displayName || entrant.teamName || entrant.name).filter(Boolean)
    : (Array.isArray(s.players) ? s.players : []);
  const leftRows = standings.length > 0
    ? standings.map(entry => ({
        rank: entry.rank,
        player: entry.player,
        meta: entry.points != null ? `${entry.points}pt` : stageOverviewLabel(entry.groupLabel || entry.bracket || ''),
        tag: '结果',
      }))
    : entrants.map((player, index) => ({
        rank: index + 1,
        player,
        meta: '',
        tag: participantLabel,
      }));

  const plEl = root.querySelector('#ovPlayerList');
  if (plEl) {
    plEl.classList.remove('is-group-standings');
    plEl.style.display = 'grid';
    plEl.style.gridTemplateColumns = '';
    plEl.style.gap = '';
    plEl.innerHTML = leftRows.map((entry, i) => {
      const rank = entry.rank || (i + 1);
      const rc = rank <= 3 ? 't3' : rank <= 8 ? 't8' : '';
      const playerName = escapeHtml(entry.player || '-');
      const metaText = escapeHtml(entry.meta || '');
      const recordClass = metaText ? 'ov-record is-text' : 'ov-record is-empty';
      return '<div class="ov-pitem ' + (i % 2 === 0 ? 'even' : '') + '" data-player="' + playerName + '">' +
        '<span class="ov-rank ' + rc + '">' + rank + '</span>' +
        '<span class="ov-pname" title="' + playerName + '">' + playerName + '</span>' +
        '<span class="' + recordClass + '">' + metaText + '</span>' +
        '<span class="ov-pts">' + escapeHtml(entry.tag || '') + '</span>' +
        '</div>';
    }).join('');
  }

  const tableList = root.querySelector('#ovTableList');
  if (!tableList) return;
  const tableTitle = root.querySelector('#ovTableTitle');
  const tableSubtitle = root.querySelector('#ovTableSubtitle');
  if (tableTitle) tableTitle.textContent = '阶段对阵';
  if (tableSubtitle) tableSubtitle.textContent = stageOverviewLabel(s.phase);
  tableList.classList.toggle('is-compact', visibleMatches.length > 8);
  tableList.classList.remove('is-group-stage');
  tableList.style.display = 'grid';
  tableList.style.gridTemplateColumns = '1fr 1fr';
  tableList.style.gap = '';
  const sortedM = [...visibleMatches].sort((a, b) => {
    const ar = Number(a.groupRound || a.bracketRound || a.doubleEliminationRound || a.round || 0);
    const br = Number(b.groupRound || b.bracketRound || b.doubleEliminationRound || b.round || 0);
    if (ar !== br) return ar - br;
    return (a.table || 0) - (b.table || 0);
  });
  tableList.innerHTML = sortedM.map(match => {
    const isLive = s.currentLiveMatch && s.currentLiveMatch.id === match.id;
    const isBye = match.p1 === 'BYE' || match.p2 === 'BYE';
    const p1W = match.winner === match.p1;
    const p2W = match.winner === match.p2;
    const badge = isBye
      ? '<span class="status-badge done">轮空</span>'
      : isLive
        ? '<span class="status-badge live">直播中</span>'
        : match.done
          ? '<span class="status-badge done">已结束</span>'
          : '<span class="status-badge waiting">等待中</span>';
    const phase = stageOverviewLabel(match.phase || match.bracket || match.stagePhase);
    const phaseBadge = phase && phase !== stageOverviewLabel(s.phase)
      ? '<span class="status-badge waiting">' + escapeHtml(phase) + '</span>'
      : '';
    const p1d = match.p1 === 'BYE' ? '轮空' : (match.p1 || 'TBD');
    const p2d = match.p2 === 'BYE' ? '轮空' : (match.p2 || 'TBD');
    const p1Cls = 'p1n' + (p1W ? ' won' : p2W ? ' lost' : '');
    const p2Cls = 'p1n right' + (p2W ? ' won' : p1W ? ' lost' : '');
    const score = (match.p1Wins || match.p2Wins) ? '<span class="status-badge">' + (match.p1Wins || 0) + '-' + (match.p2Wins || 0) + '</span>' : '';
    return `<div class="ov-card${isBye || match.done ? ' done' : ''}${isLive ? ' live' : ''}">
      <div class="table-num">${match.table || '?'}</div>
      <div class="player-block">
        <span class="${p1Cls}" title="${escapeHtml(p1d)}">${renderMarqueeText(p1d)}</span>
        <span class="vs-mini">VS</span>
        <span class="${p2Cls}" title="${escapeHtml(p2d)}">${renderMarqueeText(p2d)}</span>
      </div>
      <div class="ov-card-actions">${score}${phaseBadge}${badge}</div>
    </div>`;
  }).join('');
}

// ── 瑞士轮结束 ───────────────────────────────────────────

// ── 瑞士轮排名卡片渲染 ─────────────────────────────────────
