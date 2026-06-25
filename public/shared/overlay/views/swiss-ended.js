// Swiss ended renderer.

function renderSeTop8Card(r, p8) {
  const isT8 = p8.has(r.player);
  const rc = r.rank <= 3 ? 't3' : 't8';
  return `<div class="se-card${isT8 ? ' top8' : ''}">
    <div class="se-rank ${rc}">#${r.rank}</div>
    <div class="se-pname">${renderMarqueeText(r.player)}${r.dropped ? '<span class="se-drop">退</span>' : ''}</div>
    <div class="se-record">${renderOverviewRecordChips({ w: r.wins, d: r.draws, l: r.losses })}</div>
    <div class="se-pts">${r.points}pt</div>
  </div>`;
}

function renderSeRankRow(r, p8) {
  const isT8 = p8.has(r.player);
  return `<div class="se-row${isT8 ? ' top8' : ''}">
    <div class="se-row-rank">#${r.rank}</div>
    <div class="se-row-name">${renderMarqueeText(r.player)}${r.dropped ? '<span class="se-drop">退</span>' : ''}</div>
    <div class="se-row-record">${renderOverviewRecordChips({ w: r.wins, d: r.draws, l: r.losses })}</div>
    <div class="se-row-pts">${r.points}pt</div>
  </div>`;
}

function getSwissEndedAdvancers(s) {
  const pending = Array.isArray(s.pendingTop8) ? s.pendingTop8.filter(Boolean) : [];
  if (pending.length > 0) return pending;
  const results = s.stageResults && typeof s.stageResults === 'object'
    ? Object.values(s.stageResults)
    : [];
  for (const result of results) {
    if (Array.isArray(result.advancers) && result.advancers.length > 0) {
      return result.advancers.filter(Boolean);
    }
  }
  return [];
}

function swissEndedMainTitle(s) {
  const count = getSwissEndedAdvancers(s).length;
  if (!count) return '最终排名';
  const labels = {
    2: '决赛名单出炉',
    4: '四强出炉',
    8: '八强出炉',
    16: '十六强出炉',
    32: '三十二强出炉',
  };
  return labels[count] || '晋级名单出炉';
}

function renderSwissEnded(s) {
  renderSwissEndedInto(document, s);
}

function renderSwissEndedInto(root, s) {
  var el = root.querySelector('#state-swiss-ended');
  if (!el) return;
  var ranking = (s.swissRanking || []);
  var advancers = getSwissEndedAdvancers(s);
  var mainCount = advancers.length || 8;
  var top8Ranking = ranking.slice(0, mainCount);
  var tableRanking = ranking.slice(mainCount);
  var p8 = new Set(advancers);
  el.innerHTML = `
    <div class="se-shell">
      <section class="se-left">
        <div class="se-logo" aria-hidden="true"></div>
        <div class="se-kicker">瑞士轮结束</div>
        <div class="se-main-title">${escapeHtml(swissEndedMainTitle(s))}</div>
        <div class="se-subtitle">${escapeHtml(s.tournamentName || '')}</div>
        <div class="se-grid">
          ${top8Ranking.map(function(r) { return renderSeTop8Card(r, p8); }).join('')}
        </div>
      </section>
      <section class="se-right">
        <div class="se-right-head">
          <div>
            <div class="se-right-title">积分榜</div>
            <div class="se-right-line"></div>
          </div>
        </div>
        <div class="se-ranking-list">
          ${tableRanking.map(function(r) { return renderSeRankRow(r, p8); }).join('')}
        </div>
      </section>
      </div>
    </div>`;
  markOverflowingText(root);
}

// ── 淘汰赛对阵图 ─────────────────────────────────────────
