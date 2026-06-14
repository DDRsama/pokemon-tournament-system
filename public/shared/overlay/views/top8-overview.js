// Top 8 overview fallback renderer.

function renderTop8Overview(s) {
  renderTop8OverviewInto(document, s);
}

function renderTop8OverviewInto(root, s) {
  const el = root.querySelector('#state-overview');
  if (!el) return;
  const ovLeft = el.querySelector('.ov-left');
  const ovRight = el.querySelector('.ov-right');
  // 淘汰赛总览：隐藏左栏，右栏占满全屏
  if (ovLeft) { ovLeft.style.display = 'none'; }
  if (ovRight) { ovRight.style.display = 'flex'; ovRight.style.flex = '1'; ovRight.style.padding = '24px 32px'; ovRight.style.width = '100%'; }

  const p8 = s.top8 || [];
  const allMatches = s.matches || [];
  const live = s.currentLiveMatch;

  // 全屏淘汰赛对阵图 — 纵向排列各阶段
  var rightList = root.querySelector('#ovTableList');
  if (rightList) {
    rightList.style.gridTemplateColumns = '1fr';
    rightList.style.gap = '16px';
    var stages = [
      { label: '四分之一决赛', phase: 'Quarter Finals', cols: 4 },
      { label: '半决赛',        phase: 'Semi Finals', cols: 2 },
      { label: '季军战',        phase: 'Bronze Match', cols: 1 },
      { label: '决赛',          phase: 'Finals', cols: 1 },
    ];
    rightList.innerHTML = stages.map(function(stage) {
      var ms = allMatches.filter(function(m) { return m.phase === stage.phase; });
      if (ms.length === 0) {
        return '<div style="background:rgba(30,41,59,0.6);border-radius:16px;padding:16px 24px;border:2px solid #334155;font-family:inherit;">' +
          '<div style="font-size:20px;color:#fbbf24;font-weight:700;margin-bottom:12px;letter-spacing:1px;font-family:inherit;">' + stage.label + '</div>' +
          '<div style="text-align:center;color:#475569;font-size:18px;padding:12px;font-family:inherit;">待开始</div>' +
          '</div>';
      }
      var cardsHtml = ms.map(function(m) {
        var isLiveMatch = live && live.id === m.id;
        var p1Won = m.winner === m.p1;
        var p2Won = m.winner === m.p2;
        var p1Color = p1Won ? 'color:#22c55e;font-weight:900;' : (m.winner && !p1Won ? 'color:#64748b;' : 'color:#e2e8f0;');
        var p2Color = p2Won ? 'color:#22c55e;font-weight:900;' : (m.winner && !p2Won ? 'color:#64748b;' : 'color:#e2e8f0;');
        var liveBorder = isLiveMatch ? 'border-color:#f59e0b;box-shadow:0 0 18px rgba(245,158,11,0.4);' : 'border-color:#334155;';
        return '<div style="display:flex;align-items:center;background:rgba(30,41,59,0.85);border-radius:12px;padding:12px 16px;border:2px solid;font-family:inherit;' + liveBorder + '">' +
          '<div style="flex:1;text-align:center;font-size:20px;font-weight:800;font-family:inherit;' + p1Color + '">' + (m.p1 || '??') + (p1Won ? ' ✓' : '') + '</div>' +
          '<div style="font-size:16px;color:#475569;font-weight:600;padding:0 12px;font-family:inherit;">VS</div>' +
          '<div style="flex:1;text-align:center;font-size:20px;font-weight:800;font-family:inherit;' + p2Color + '">' + (m.p2 || '??') + (p2Won ? ' ✓' : '') + '</div>' +
          '</div>';
      }).join('');
      // 四分之一决赛4列，半决赛2列，其他单列
      var innerGrid = stage.cols === 4
        ? 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;'
        : stage.cols === 2
        ? 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;'
        : 'display:flex;flex-direction:column;gap:10px;';
      return '<div style="background:rgba(30,41,59,0.6);border-radius:16px;padding:16px 24px;border:2px solid #334155;font-family:inherit;">' +
        '<div style="font-size:20px;color:#fbbf24;font-weight:700;margin-bottom:12px;letter-spacing:1px;font-family:inherit;">' + stage.label + '</div>' +
        '<div style="' + innerGrid + '">' + cardsHtml + '</div>' +
        '</div>';
    }).join('');
  }
}
