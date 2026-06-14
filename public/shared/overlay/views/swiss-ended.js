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

function renderSwissEnded(s) {
  renderSwissEndedInto(document, s);
}

function renderSwissEndedInto(root, s) {
  var el = root.querySelector('#state-swiss-ended');
  if (!el) return;
  var ranking = (s.swissRanking || []);
  var top8Ranking = ranking.slice(0, 8);
  var tableRanking = ranking.slice(8);
  var p8 = new Set(s.pendingTop8 || []);
  el.innerHTML = `
    <div class="se-shell">
      <section class="se-left">
        <div class="se-logo" aria-hidden="true"></div>
        <div class="se-kicker">瑞士轮结束</div>
        <div class="se-main-title">八强出炉</div>
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
