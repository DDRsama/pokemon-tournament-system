// Swiss overview renderer.

function renderOverview(s) {
  renderOverviewInto(document, s);
}

function renderOverviewInto(root, s, ctx) {
  // 淘汰赛阶段：显示专用总览
  if (s.phase === 'top8') {
    renderTop8Overview(s);
    return;
  }

  // 恢复瑞士轮左右分栏（淘汰赛总览可能隐藏了它们）
  const el = root.querySelector('#state-overview');
  if (!el) return;
  const ovLeft = el.querySelector('.ov-left');
  const ovRight = el.querySelector('.ov-right');
  if (ovLeft) { ovLeft.style.display = ''; }
  if (ovRight) { ovRight.style.display = ''; }
  // 右侧对阵表2列
  var tl = root.querySelector('#ovTableList');
  if (tl) { tl.style.display = 'grid'; tl.style.gridTemplateColumns = '1fr 1fr'; tl.style.gap = ''; }
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

// ── 瑞士轮结束 ───────────────────────────────────────────

// ── 瑞士轮排名卡片渲染 ─────────────────────────────────────
