// Podium renderer.

function renderPodium(s) {
  renderPodiumInto(document, s);
}

function renderPodiumInto(root, s) {
  const matches = Array.isArray(s.matches) ? s.matches : [];
  const finalMatch = matches.find(m => m.phase === 'Finals' && m.done);
  const bronzeMatch = matches.find(m => m.phase === 'Bronze Match' && m.done);
  const getLoser = (m) => m.winner === m.p1 ? m.p2 : m.p1;
  const stageResult = Object.values(s.stageResults || {})
    .find(result => result && Array.isArray(result.standings) && result.standings.some(entry => entry.rank === 1 && entry.player));
  const resultStandings = stageResult ? [...stageResult.standings].sort((a, b) => (a.rank || 999) - (b.rank || 999)) : [];

  const first = finalMatch ? finalMatch.winner : (resultStandings.find(entry => entry.rank === 1)?.player || '-');
  const second = finalMatch ? getLoser(finalMatch) : (resultStandings.find(entry => entry.rank === 2)?.player || '-');
  const third = bronzeMatch ? bronzeMatch.winner : (resultStandings.find(entry => entry.rank === 3)?.player || '-');
  const fourth = bronzeMatch ? getLoser(bronzeMatch) : (resultStandings.find(entry => entry.rank === 4)?.player || '-');
  const bracketSize = window.PTSOverlay?.topCutBracketSize?.(s)
    || Number(s.activeStage?.elimination?.bracketSize || s.activeStage?.doubleElimination?.bracketSize || s.top8?.length || 8)
    || 8;
  const topCutLabel = ({
    2: '决赛选手',
    4: '四强选手',
    8: '八强选手',
    16: '十六强选手',
    32: '三十二强选手',
  })[bracketSize] || '晋级选手';

  // 提取5-8名：四分之一决赛的败者
  const qfMatches = matches.filter(m => m.phase === 'Quarter Finals' && m.done);
  const top8Set = new Set(s.top8 || []);
  const top4Set = new Set([first, second, third, fourth]);
  const fifthToEighthFromMatches = qfMatches.map(m => {
    if (m.winner === m.p1) return m.p2;
    if (m.winner === m.p2) return m.p1;
    return null;
  }).filter(p => p && p !== 'BYE' && top8Set.has(p) && !top4Set.has(p));
  const fifthToEighth = fifthToEighthFromMatches.length > 0
    ? fifthToEighthFromMatches
    : resultStandings
        .filter(entry => entry.rank >= 5 && entry.rank <= 8 && entry.player)
        .map(entry => entry.player);

  const el = root.querySelector('#state-podium');
  if (!el) return;
  const podiumSpot = (rank, cls, label, name) => `
      <div class="podium-spot ${cls}">
        <div class="podium-label">${label}</div>
        <div class="podium-medal">${rank}</div>
        <div class="podium-name" title="${escapeHtml(name)}">${renderMarqueeText(name)}</div>
        <div class="podium-stand">${rank}</div>
      </div>
  `;
  const sideList = fifthToEighth.length
    ? fifthToEighth.map((p) => `
      <div class="podium-side-item">
        <div class="podium-side-name" title="${escapeHtml(p)}">${renderMarqueeText(p)}</div>
      </div>
    `).join('')
    : `<div class="podium-side-empty">暂无其他${escapeHtml(topCutLabel)}</div>`;

  el.innerHTML = '<div class="podium-confetti" id="confetti"></div>' +
    '<div class="podium-shell">' +
      '<div class="podium-title-wrap">' +
        '<img class="podium-title-art" src="/shared/pokemon-champions-title.png" alt="Pokemon Champions">' +
      '</div>' +
      '<div class="podium-event-name">' + escapeHtml(s.tournamentName || '') + '</div>' +
      '<div class="podium-layout">' +
        '<div class="podium-main">' +
      '<div class="podium-stage">' +
        podiumSpot(2, 'second', '亚军', second) +
        podiumSpot(1, 'first', '冠军', first) +
        podiumSpot(3, 'third', '季军', third) +
        podiumSpot(4, 'fourth', '殿军', fourth) +
      '</div>' +
        '</div>' +
        '<div class="podium-side">' +
          '<div class="podium-side-title">' + escapeHtml(topCutLabel) + '</div>' +
          '<div class="podium-side-list">' + sideList + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  spawnConfetti(el);
  markOverflowingText(root);
}

function spawnConfetti(root) {
  const el = root.querySelector('#confetti');
  if (!el) return;
  const colors = ['#fbbf24','#f59e0b','#ffffff','#ef4444','#22c55e','#3b82f6','#a855f7','#ec4899'];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 3 + 's';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    el.appendChild(piece);
  }
}
