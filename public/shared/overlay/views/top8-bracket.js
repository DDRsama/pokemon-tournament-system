// Top 8 bracket renderers.

function renderTop8BracketLegacy(s) {
  const qf = s.matches.filter(m => m.phase === 'Quarter Finals').sort((a, b) => (a.table || 0) - (b.table || 0));
  const sf = s.matches.filter(m => m.phase === 'Semi Finals').sort((a, b) => (a.table || 0) - (b.table || 0));
  const finalMatch = s.matches.find(m => m.phase === 'Finals') || null;
  const bronzeMatch = s.matches.find(m => m.phase === 'Bronze Match') || null;
  const live = s.currentLiveMatch;
  const labelMap = { 'Quarter Finals': '四分之一决赛', 'Semi Finals': '半决赛', 'Bronze Match': '季军赛', 'Finals': '决赛' };
  const currentPhase = (() => {
    if (finalMatch && !finalMatch.done && (finalMatch.p1 || finalMatch.p2)) return 'Finals';
    if (bronzeMatch && !bronzeMatch.done && (bronzeMatch.p1 || bronzeMatch.p2)) return 'Bronze Match';
    if (sf.some(m => !m.done && (m.p1 || m.p2))) return 'Semi Finals';
    return 'Quarter Finals';
  })();
  const shouldAnimateStage = top8AnimatedPhase !== currentPhase;
  if (top8BridgeTimer) {
    clearTimeout(top8BridgeTimer);
    top8BridgeTimer = null;
  }
  if (shouldAnimateStage) {
    top8BracketAnimated = false;
    top8LinesAnimated = false;
  }
  top8AnimatedPhase = currentPhase;
  document.getElementById('bracketPhaseLabel').textContent = labelMap[currentPhase] || currentPhase;

  const qf1 = qf[0] || null;
  const qf2 = qf[1] || null;
  const qf3 = qf[2] || null;
  const qf4 = qf[3] || null;
  const sf1 = sf[0] || null;
  const sf2 = sf[1] || null;
  const qfAnim = shouldAnimateStage ? 'phase-qf' : '';
  const sfAnim = shouldAnimateStage ? 'phase-sf' : '';
  const finalAnim = shouldAnimateStage ? 'phase-final' : '';

  const nodeClass = (name, winnerName, liveMatch, sideName) => {
    if (!name) return 'tree-node';
    const classes = ['tree-node'];
    if (winnerName && name === winnerName) classes.push('won');
    if (winnerName && name !== winnerName) classes.push('muted');
    if (liveMatch && name === sideName) classes.push('live');
    return classes.join(' ');
  };
  const halfClass = (name, winnerName, liveMatch, sideName) => {
    if (!name) return 'tree-half';
    const classes = ['tree-half'];
    if (winnerName && name === winnerName) classes.push('won');
    if (winnerName && name !== winnerName) classes.push('muted');
    if (liveMatch && name === sideName) classes.push('live');
    return classes.join(' ');
  };

  const points = {
    qf1p1: { x: 70, y: 90 }, qf1p2: { x: 70, y: 280 },
    qf2p1: { x: 70, y: 470 }, qf2p2: { x: 70, y: 660 },
    sf1p1: { x: 445, y: 185 }, sf1p2: { x: 445, y: 565 },
    qf3p1: { x: 1600, y: 90 }, qf3p2: { x: 1600, y: 280 },
    qf4p1: { x: 1600, y: 470 }, qf4p2: { x: 1600, y: 660 },
    sf2p1: { x: 1225, y: 185 }, sf2p2: { x: 1225, y: 565 },
    final: { x: 780, y: 370 },
    bronze: { x: 780, y: 610 },
  };

  const node = (id, name, score, cls, x, y, phaseClass = '', reverse = false) =>
    `<div id="${id}" class="${cls}${reverse ? ' reverse' : ''}${phaseClass ? ` ${phaseClass}` : ''}" style="left:${x}px; top:${y}px;"><span class="tree-node-name">${name || '待定'}</span><span class="tree-node-score ${score > 0 ? 'win' : ''}">${score || 0}</span></div>`;
  const pairBox = (id, match, boxClass, x, y, phaseClass = '') => `
    <div id="${id}" class="tree-split ${boxClass}${phaseClass ? ` ${phaseClass}` : ''}" style="left:${x}px; top:${y}px;">
      <div class="${halfClass(match?.p1, match?.winner, live, match?.p1)}"><span class="tree-half-name">${match?.p1 || '待定'}</span><span class="tree-half-score ${match?.winner === match?.p1 ? 'win' : ''}">${match?.p1Wins || 0}</span></div>
      <div class="${halfClass(match?.p2, match?.winner, live, match?.p2)}"><span class="tree-half-name">${match?.p2 || '待定'}</span><span class="tree-half-score ${match?.winner === match?.p2 ? 'win' : ''}">${match?.p2Wins || 0}</span></div>
    </div>
  `;

  const container = document.getElementById('bracketStages');
  container.innerHTML = `
    <div class="bracket-tree" id="bracketTree">
      <svg class="bracket-svg" id="bracketSvg" viewBox="0 0 1920 900" preserveAspectRatio="none"></svg>
      <div class="bridge-layer" id="bridgeLayer"></div>
      <div class="tree-round-label" style="left:185px; top:48px; transform:translateX(-50%);">四分之一决赛</div>
      <div class="tree-round-label" style="left:560px; top:48px; transform:translateX(-50%);">半决赛</div>
      <div class="tree-round-label" style="left:960px; top:48px; transform:translateX(-50%);">决赛</div>
      <div class="tree-round-label" style="left:1340px; top:48px; transform:translateX(-50%);">半决赛</div>
      <div class="tree-round-label" style="left:1715px; top:48px; transform:translateX(-50%);">四分之一决赛</div>

      ${node('qf1p1', qf1?.p1, qf1?.p1Wins || 0, nodeClass(qf1?.p1, qf1?.winner, live, qf1?.p1), points.qf1p1.x, points.qf1p1.y, qfAnim)}
      ${node('qf1p2', qf1?.p2, qf1?.p2Wins || 0, nodeClass(qf1?.p2, qf1?.winner, live, qf1?.p2), points.qf1p2.x, points.qf1p2.y, qfAnim)}
      ${node('qf2p1', qf2?.p1, qf2?.p1Wins || 0, nodeClass(qf2?.p1, qf2?.winner, live, qf2?.p1), points.qf2p1.x, points.qf2p1.y, qfAnim)}
      ${node('qf2p2', qf2?.p2, qf2?.p2Wins || 0, nodeClass(qf2?.p2, qf2?.winner, live, qf2?.p2), points.qf2p2.x, points.qf2p2.y, qfAnim)}

      ${node('sf1p1', sf1?.p1, sf1?.p1Wins || 0, nodeClass(sf1?.p1, sf1?.winner, live, sf1?.p1), points.sf1p1.x, points.sf1p1.y, sfAnim)}
      ${node('sf1p2', sf1?.p2, sf1?.p2Wins || 0, nodeClass(sf1?.p2, sf1?.winner, live, sf1?.p2), points.sf1p2.x, points.sf1p2.y, sfAnim)}

      ${pairBox('finalBox', finalMatch, 'final', points.final.x, points.final.y, finalAnim)}
      ${pairBox('bronzeBox', bronzeMatch, 'bronze', points.bronze.x, points.bronze.y, finalAnim)}

      ${node('sf2p1', sf2?.p1, sf2?.p1Wins || 0, nodeClass(sf2?.p1, sf2?.winner, live, sf2?.p1), points.sf2p1.x, points.sf2p1.y, sfAnim, true)}
      ${node('sf2p2', sf2?.p2, sf2?.p2Wins || 0, nodeClass(sf2?.p2, sf2?.winner, live, sf2?.p2), points.sf2p2.x, points.sf2p2.y, sfAnim, true)}

      ${node('qf3p1', qf3?.p1, qf3?.p1Wins || 0, nodeClass(qf3?.p1, qf3?.winner, live, qf3?.p1), points.qf3p1.x, points.qf3p1.y, qfAnim, true)}
      ${node('qf3p2', qf3?.p2, qf3?.p2Wins || 0, nodeClass(qf3?.p2, qf3?.winner, live, qf3?.p2), points.qf3p2.x, points.qf3p2.y, qfAnim, true)}
      ${node('qf4p1', qf4?.p1, qf4?.p1Wins || 0, nodeClass(qf4?.p1, qf4?.winner, live, qf4?.p1), points.qf4p1.x, points.qf4p1.y, qfAnim, true)}
      ${node('qf4p2', qf4?.p2, qf4?.p2Wins || 0, nodeClass(qf4?.p2, qf4?.winner, live, qf4?.p2), points.qf4p2.x, points.qf4p2.y, qfAnim, true)}
    </div>
  `;

  const tree = document.getElementById('bracketTree');
  const contentIds = ['qf1p1','qf1p2','qf2p1','qf2p2','sf1p1','sf1p2','finalBox','bronzeBox','sf2p1','sf2p2','qf3p1','qf3p2','qf4p1','qf4p2'];
  const contentRects = contentIds
    .map(id => document.getElementById(id))
    .filter(Boolean)
    .map(el => ({ left: el.offsetLeft, right: el.offsetLeft + el.offsetWidth }));
  if (contentRects.length) {
    const minLeft = Math.min(...contentRects.map(item => item.left));
    const maxRight = Math.max(...contentRects.map(item => item.right));
    const layoutCenter = (minLeft + maxRight) / 2;
    const containerCenter = container.clientWidth / 2;
    const visualCenterBias = -24;
    tree.style.transform = `translateX(${Math.round(containerCenter - layoutCenter + visualCenterBias)}px)`;
    tree.style.transformOrigin = 'top left';
  }
  const svgEl = document.getElementById('bracketSvg');
  svgEl.innerHTML = '';
  const bridgeLayer = document.getElementById('bridgeLayer');
  if (bridgeLayer) {
    const animateLines = shouldAnimateStage;
    const renderBridges = () => {
      bridgeLayer.innerHTML = '';
      const LINE_MS_PER_PX = 4;
      const addVerticalPair = (topId, bottomId, winner = null, delay = 0, animated = true) => {
        const a = document.getElementById(topId);
        const b = document.getElementById(bottomId);
        if (!a || !b) return 0;
        const top = a.offsetTop + a.offsetHeight;
        const height = Math.max(0, b.offsetTop - top);
        const half = Math.floor(height / 2);
        const left = a.offsetLeft + Math.floor(a.offsetWidth / 2);
        const width = 1;
        const dur1 = Math.max(140, Math.round(half * LINE_MS_PER_PX));
        const dur2 = Math.max(140, Math.round((height - half) * LINE_MS_PER_PX));
        const topClass = animated ? ' anim-v' : '';
        const bottomClass = animated ? ' anim-v from-bottom' : '';
        const topStyle = animated ? ` animation-duration:${dur1}ms; animation-delay:${delay}ms;` : '';
        const bottomStyle = animated ? ` animation-duration:${dur2}ms; animation-delay:${delay}ms;` : '';
        bridgeLayer.insertAdjacentHTML('beforeend',
          `<div class="bridge-box${topClass}${winner === 'top' ? ' win-route' : ''}" style="left:${left}px; top:${top}px; width:${width}px; height:${half}px;${topStyle}"></div>` +
          `<div class="bridge-box${bottomClass}${winner === 'bottom' ? ' win-route' : ''}" style="left:${left}px; top:${top + half}px; width:${width}px; height:${height - half}px;${bottomStyle}"></div>`
        );
        return Math.max(dur1, dur2);
      };
      const winnerHalf = (match) => {
        if (!match || !match.winner) return null;
        if (match.winner === match.p1) return 'top';
        if (match.winner === match.p2) return 'bottom';
        return null;
      };
      const baseDelay = 1000;
      const qfVerticalDur = Math.max(
        addVerticalPair('qf1p1', 'qf1p2', winnerHalf(qf1), baseDelay, animateLines),
        addVerticalPair('qf2p1', 'qf2p2', winnerHalf(qf2), baseDelay, animateLines),
        addVerticalPair('qf3p1', 'qf3p2', winnerHalf(qf3), baseDelay, animateLines),
        addVerticalPair('qf4p1', 'qf4p2', winnerHalf(qf4), baseDelay, animateLines),
      );

      const leftTopA = document.getElementById('qf1p1');
      const leftTopB = document.getElementById('qf1p2');
      const leftSf = document.getElementById('sf1p1');
      let qfHorizontalDur = 0;
      if (leftTopA && leftTopB && leftSf) {
        const baseTop = leftTopA.offsetTop + leftTopA.offsetHeight;
        const gapHeight = Math.max(0, leftTopB.offsetTop - baseTop);
        const height = 2;
        const top = baseTop + Math.floor((gapHeight - height) / 2);
        const left = leftTopA.offsetLeft + Math.floor(leftTopA.offsetWidth / 2) + 1;
        const width = Math.max(0, leftSf.offsetLeft - left);
        qfHorizontalDur = Math.max(140, Math.round(width * LINE_MS_PER_PX));
        const qf1AnimClass = animateLines ? ' anim-h' : '';
        const qf1AnimStyle = animateLines ? ` animation-duration:${qfHorizontalDur}ms; animation-delay:${baseDelay + qfVerticalDur}ms;` : '';
        bridgeLayer.insertAdjacentHTML('beforeend',
          `<div class="bridge-box${qf1AnimClass}${qf1?.winner ? ' win-route' : ''}" style="left:${left}px; top:${top}px; width:${width}px; height:${height}px;${qf1AnimStyle}"></div>`
        );
      }

      const addHorizontalBridge = (topId, bottomId, targetId, side = 'left', solid = false, winner = null, delay = 0, animated = true) => {
        const a = document.getElementById(topId);
        const b = document.getElementById(bottomId);
        const t = document.getElementById(targetId);
        if (!a || !b || !t) return 0;
        const baseTop = a.offsetTop + a.offsetHeight;
        const gapHeight = Math.max(0, b.offsetTop - baseTop);
        const height = 2;
        const top = baseTop + Math.floor((gapHeight - height) / 2);
        let left = 0;
        let width = 0;
        if (side === 'left') {
          left = a.offsetLeft + Math.floor(a.offsetWidth / 2) + 1;
          width = Math.max(0, t.offsetLeft - left);
        } else {
          left = t.offsetLeft + t.offsetWidth + 1;
          const end = a.offsetLeft + Math.floor(a.offsetWidth / 2);
          width = Math.max(0, end - left);
        }
        const dur = Math.max(140, Math.round(width * LINE_MS_PER_PX));
        const animClass = animated ? ` anim-h${side === 'right' ? ' reverse' : ''}` : '';
        const animStyle = animated ? ` animation-duration:${dur}ms; animation-delay:${delay}ms;` : '';
        bridgeLayer.insertAdjacentHTML('beforeend',
          `<div class="bridge-box${animClass}${solid ? ' solid' : ''}${winner ? ' win-route' : ''}" style="left:${left}px; top:${top}px; width:${width}px; height:${height}px;${animStyle}"></div>`
        );
        return dur;
      };

      const qfHorizontalDelay = baseDelay + qfVerticalDur;
      qfHorizontalDur = Math.max(
        qfHorizontalDur,
        addHorizontalBridge('qf2p1', 'qf2p2', 'sf1p2', 'left', false, !!qf2?.winner, qfHorizontalDelay, animateLines),
        addHorizontalBridge('qf3p1', 'qf3p2', 'sf2p1', 'right', false, !!qf3?.winner, qfHorizontalDelay, animateLines),
        addHorizontalBridge('qf4p1', 'qf4p2', 'sf2p2', 'right', false, !!qf4?.winner, qfHorizontalDelay, animateLines),
      );

      const sfVerticalDelay = qfHorizontalDelay + qfHorizontalDur;
      const sfVerticalDur = Math.max(
        addVerticalPair('sf1p1', 'sf1p2', winnerHalf(sf1), sfVerticalDelay, animateLines),
        addVerticalPair('sf2p1', 'sf2p2', winnerHalf(sf2), sfVerticalDelay, animateLines),
      );

      const finalHorizontalDelay = sfVerticalDelay + sfVerticalDur;
      addHorizontalBridge('sf1p1', 'sf1p2', 'finalBox', 'left', true, !!sf1?.winner, finalHorizontalDelay, animateLines);
      addHorizontalBridge('sf2p1', 'sf2p2', 'finalBox', 'right', true, !!sf2?.winner, finalHorizontalDelay, animateLines);
    };

    const scheduleBridgeRender = () => {
      top8BridgeTimer = setTimeout(() => {
        requestAnimationFrame(() => {
          renderBridges();
          top8LinesAnimated = true;
          top8BridgeTimer = null;
        });
      }, 1000);
    };
    if (animateLines) {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleBridgeRender).catch(scheduleBridgeRender);
      } else {
        requestAnimationFrame(() => requestAnimationFrame(scheduleBridgeRender));
      }
    } else {
      requestAnimationFrame(() => {
        renderBridges();
        top8LinesAnimated = true;
      });
    }
    top8BracketAnimated = true;
  }
}

const top8BracketLegacyRuntime = {
  bridgeTimer: null,
  signature: '',
  hasRendered: false,
  knownRoutes: new Set(),
  knownTargets: new Set(),
  lastTournamentId: '',
  animatedPhase: null,
  animationBusyUntil: 0,
  queuedState: null,
  queueTimer: null,
};

function top8BracketStateSignature(s) {
  const matches = Array.isArray(s?.matches) ? s.matches : [];
  return matches
    .filter(m => m.phase)
    .map(m => [
      m.id,
      m.phase,
      m.p1 || '',
      m.p2 || '',
      Number(m.p1Wins || 0),
      Number(m.p2Wins || 0),
      m.winner || '',
      m.done ? 1 : 0,
    ].join(':'))
    .sort()
    .join('|');
}
window.top8BracketStateSignature = top8BracketStateSignature;

function renderTop8Bracket(s) {
  renderTop8BracketInto(document, s, top8BracketLegacyRuntime);
}

function renderTop8BracketInto(root, s, runtime) {
  const state = runtime || top8BracketLegacyRuntime;
  if (state.bridgeTimer) {
    clearTimeout(state.bridgeTimer);
    state.bridgeTimer = null;
  }

  const matches = Array.isArray(s?.matches) ? s.matches : [];
  const byPhase = (phase) => matches
    .filter(m => m.phase === phase)
    .sort((a, b) => (a.table || 0) - (b.table || 0));
  const qf = byPhase('Quarter Finals');
  const sf = byPhase('Semi Finals');
  const finalMatch = matches.find(m => m.phase === 'Finals') || null;
  const bronzeMatch = matches.find(m => m.phase === 'Bronze Match') || null;
  const live = s?.currentLiveMatch || null;
  const bracketSignature = top8BracketStateSignature(s);
  const tournamentChanged = state.lastTournamentId !== (s?.tournamentId || '');
  if (tournamentChanged) {
    state.hasRendered = false;
    state.knownRoutes = new Set();
    state.knownTargets = new Set();
    state.lastTournamentId = s?.tournamentId || '';
  }
  const shouldReplayBracket = !state.hasRendered;
  const hasStructuralChange = state.hasRendered && bracketSignature !== state.signature;
  state.signature = bracketSignature;

  const currentPhase = (() => {
    if (finalMatch && !finalMatch.done && (finalMatch.p1 || finalMatch.p2)) return 'Finals';
    if (bronzeMatch && !bronzeMatch.done && (bronzeMatch.p1 || bronzeMatch.p2)) return 'Bronze Match';
    if (sf.some(m => !m.done && (m.p1 || m.p2))) return 'Semi Finals';
    return 'Quarter Finals';
  })();
  state.animatedPhase = currentPhase;

  const phaseLabel = root.querySelector('#bracketPhaseLabel');
  const labelMap = {
    'Quarter Finals': '\u56db\u5206\u4e4b\u4e00\u51b3\u8d5b',
    'Semi Finals': '\u534a\u51b3\u8d5b',
    'Bronze Match': '\u5b63\u519b\u8d5b',
    'Finals': '\u51b3\u8d5b',
  };
  if (phaseLabel) phaseLabel.textContent = labelMap[currentPhase] || currentPhase;

  const qf1 = qf[0] || null;
  const qf2 = qf[1] || null;
  const qf3 = qf[2] || null;
  const qf4 = qf[3] || null;
  const sf1 = sf[0] || null;
  const sf2 = sf[1] || null;
  const container = root.querySelector('#bracketStages');
  if (!container) return;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
  const pending = '\u5f85\u5b9a';
  const bracketOffsetY = 212;
  const withOffset = (box) => ({ ...box, y: box.y + bracketOffsetY });
  const layout = {
    qf1p1: { x: 100, y: 150, w: 240, h: 64 },
    qf1p2: { x: 100, y: 302, w: 240, h: 64 },
    qf2p1: { x: 100, y: 552, w: 240, h: 64 },
    qf2p2: { x: 100, y: 704, w: 240, h: 64 },
    sf1p1: { x: 450, y: 222, w: 240, h: 68 },
    sf1p2: { x: 450, y: 624, w: 240, h: 68 },
    final: { x: 780, y: 390, w: 360, h: 130 },
    bronze: { x: 800, y: 610, w: 320, h: 112 },
    sf2p1: { x: 1230, y: 222, w: 240, h: 68 },
    sf2p2: { x: 1230, y: 624, w: 240, h: 68 },
    qf3p1: { x: 1580, y: 150, w: 240, h: 64 },
    qf3p2: { x: 1580, y: 302, w: 240, h: 64 },
    qf4p1: { x: 1580, y: 552, w: 240, h: 64 },
    qf4p2: { x: 1580, y: 704, w: 240, h: 64 },
  };
  Object.keys(layout).forEach(key => {
    layout[key] = withOffset(layout[key]);
  });

  const slotName = (match, slot) => match?.[slot] || '';
  const slotWins = (match, slot) => Number(match?.[slot + 'Wins'] || 0);
  const includesPlayer = (match, name) => !!match && !!name && (match.p1 === name || match.p2 === name);
  const isLivePlayer = (name) => includesPlayer(live, name);
  const isActiveMatch = (match) => !!match && !match.done && match.phase === currentPhase;
  const targetRevealSlots = new Set();
  [
    ['qf1', 'sf1p1'], ['qf2', 'sf1p2'],
    ['qf3', 'sf2p1'], ['qf4', 'sf2p2'],
    ['sf1', 'final-p1'], ['sf2', 'final-p2'],
    ['sf1-loser', 'bronze-p1'], ['sf2-loser', 'bronze-p2'],
  ].forEach(([sourceId, targetId]) => {
    const source = sourceId.endsWith('-loser')
      ? matches.find(m => m.id === sourceId.replace('-loser', ''))
      : matches.find(m => m.id === sourceId);
    if (source && source.done) targetRevealSlots.add(targetId);
  });
  const currentTargetKeys = new Set(targetRevealSlots);
  const newTargetSlots = shouldReplayBracket
    ? currentTargetKeys
    : new Set([...currentTargetKeys].filter(key => !state.knownTargets.has(key)));
  const stableTargetSlots = new Set([...currentTargetKeys].filter(key => !newTargetSlots.has(key)));
  const isIncrementalRender = !shouldReplayBracket && hasStructuralChange;
  const qfTimeline = isIncrementalRender
    ? { winner: 260, route: 760, target: 1660, loss: 1660 }
    : { winner: 2300, route: 2920, target: 3820, loss: 3820 };
  const sfTimeline = isIncrementalRender
    ? { winner: 260, route: 760, target: 1660, loss: 1660 }
    : { winner: 4820, route: 5440, target: 6340, loss: 6340 };
  const targetTimeline = (key) => (
    key.startsWith('sf1') || key.startsWith('sf2') ? qfTimeline : sfTimeline
  );
  const matchTimeline = (match) => (
    match?.phase === 'Semi Finals' ? sfTimeline : qfTimeline
  );
  const timelineStyle = (timeline) => `--winner-delay:${timeline.winner}ms;--route-delay:${timeline.route}ms;--target-delay:${timeline.target}ms;--loss-delay:${timeline.loss}ms;`;
  const targetDelayStyle = (timeline) => `--target-delay:${timeline.target}ms;`;
  const resultDelayStyle = (timeline) => `--winner-delay:${timeline.winner}ms;--loss-delay:${timeline.loss}ms;`;
  const routeKeyFor = (match, sourceName) => `${match?.id || ''}:${sourceName || ''}`;
  const routeStoreKeyFor = (cls, match, sourceName) => `${cls}:${routeKeyFor(match, sourceName)}`;
  const isNewWinner = (match, name) => (
    isIncrementalRender
    && !!match?.done
    && !!name
    && match.winner === name
    && !state.knownRoutes.has(routeStoreKeyFor('complete', match, name))
  );
  const isNewLoser = (match, name) => (
    isIncrementalRender
    && !!match?.done
    && !!match.winner
    && !!name
    && match.winner !== name
    && !state.knownRoutes.has(routeStoreKeyFor('lost-route', match, name))
  );
  const playerNodeClass = (match, name, side, revealTarget = false, stableTarget = false) => {
    const classes = ['bracket-v2-node'];
    if (side === 'right') classes.push('right');
    if (!name) classes.push('empty');
    if (match?.winner && name) classes.push(match.winner === name ? 'won' : 'lost');
    if (isNewWinner(match, name)) classes.push('new-winner');
    if (isNewLoser(match, name)) classes.push('new-loser');
    if (revealTarget && name) classes.push('reveal-target');
    if (stableTarget && name) classes.push('stable-target');
    if (name && (isLivePlayer(name) || isActiveMatch(match)) && !revealTarget) classes.push('current');
    return classes.join(' ');
  };
  const playerHalfClass = (match, name, revealTarget = false, stableTarget = false, softRevealTarget = false, softStableTarget = false) => {
    const classes = ['bracket-v2-half'];
    if (!name) classes.push('empty');
    if (match?.winner && name) classes.push(match.winner === name ? 'won' : 'lost');
    if (isNewWinner(match, name)) classes.push('new-winner');
    if (isNewLoser(match, name)) classes.push('new-loser');
    if (revealTarget && name) classes.push('reveal-target');
    if (stableTarget && name) classes.push('stable-target');
    if (softRevealTarget && name) classes.push('soft-reveal-target');
    if (softStableTarget && name) classes.push('soft-stable-target');
    if (name && (isLivePlayer(name) || isActiveMatch(match)) && !revealTarget) classes.push('current');
    return classes.join(' ');
  };
  const node = (id, match, slot, side, delay) => {
    const box = layout[id];
    const name = slotName(match, slot);
    const wins = slotWins(match, slot);
    const revealTarget = newTargetSlots.has(id);
    const stableTarget = stableTargetSlots.has(id);
    const targetStyle = revealTarget ? targetDelayStyle(targetTimeline(id)) : '';
    const resultStyle = (match?.winner && name) ? resultDelayStyle(matchTimeline(match)) : '';
    const nameHtml = (revealTarget || stableTarget)
      ? `<span class="bracket-v2-name reveal-name"><span class="placeholder">${pending}</span><span class="actual">${renderMarqueeText(name)}</span></span>`
      : `<span class="bracket-v2-name">${renderMarqueeText(name || pending)}</span>`;
    return `<div class="${playerNodeClass(match, name, side, revealTarget, stableTarget)}" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;--entry-delay:${delay}ms;${targetStyle}${resultStyle}">
      ${nameHtml}
      <span class="bracket-v2-score">${wins}</span>
    </div>`;
  };
  const half = (match, slot) => {
    const name = slotName(match, slot);
    const wins = slotWins(match, slot);
    const sideClass = slot === 'p2' ? ' right-side' : '';
    const targetKey = `${match?.id || ''}-${slot}`;
    const isCentralTarget = match?.id === 'final' || match?.id === 'bronze';
    const targetIsNew = newTargetSlots.has(targetKey);
    const targetIsStable = stableTargetSlots.has(targetKey);
    const revealTarget = targetIsNew && !isCentralTarget;
    const stableTarget = targetIsStable && !isCentralTarget;
    const softRevealTarget = targetIsNew && isCentralTarget;
    const softStableTarget = targetIsStable && isCentralTarget;
    const targetStyle = (revealTarget || softRevealTarget) ? targetDelayStyle(targetTimeline(targetKey)) : '';
    const resultStyle = (match?.winner && name) ? resultDelayStyle(matchTimeline(match)) : '';
    const nameHtml = (revealTarget || stableTarget)
      || (softRevealTarget || softStableTarget)
      ? `<span class="bracket-v2-name reveal-name"><span class="placeholder">${pending}</span><span class="actual">${renderMarqueeText(name)}</span></span>`
      : `<span class="bracket-v2-name">${renderMarqueeText(name || pending)}</span>`;
    return `<div class="${playerHalfClass(match, name, revealTarget, stableTarget, softRevealTarget, softStableTarget)}${sideClass}" style="${targetStyle}${resultStyle}">
      ${nameHtml}
      <span class="bracket-v2-score">${wins}</span>
    </div>`;
  };
  const card = (id, match, title, extraClass, active) => {
    const box = layout[id];
    const cls = ['bracket-v2-card', extraClass];
    const finalHasNewTarget = id === 'final' && (newTargetSlots.has('final-p1') || newTargetSlots.has('final-p2'));
    if (active) cls.push('current');
    if (finalHasNewTarget) cls.push('final-impact');
    const impactStyle = finalHasNewTarget ? targetDelayStyle(sfTimeline) : '';
    return `<div class="${cls.join(' ')}" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;--entry-delay:760ms;${impactStyle}">
      <div class="bracket-v2-card-title">${title}</div>
      <div class="bracket-v2-card-body">${half(match, 'p1')}${half(match, 'p2')}</div>
    </div>`;
  };
  const roundLabel = (x, y, text, delay = 650) =>
    `<div class="bracket-v2-round-label" style="left:${x}px;top:${y + bracketOffsetY}px;animation-delay:${delay}ms;">${text}</div>`;

  const anchor = (id, side) => {
    const box = layout[id];
    const y = box.y + box.h / 2;
    if (side === 'left') return { x: box.x, y };
    if (side === 'right') return { x: box.x + box.w, y };
    return { x: box.x + box.w / 2, y };
  };
  const pathBetween = (fromId, fromSide, toId, toSide) => {
    const a = anchor(fromId, fromSide);
    const b = anchor(toId, toSide);
    const midX = Math.round((a.x + b.x) / 2);
    return `M ${Math.round(a.x)} ${Math.round(a.y)} H ${midX} V ${Math.round(b.y)} H ${Math.round(b.x)}`;
  };
  const lineClassFor = (match, sourceName) => {
    if (!sourceName) return 'future';
    if (match?.winner === sourceName) return 'complete';
    if (match?.done) return 'lost-route';
    return '';
  };
  const activeLineClassFor = (match, sourceName) => {
    if (!sourceName) return '';
    return lineClassFor(match, sourceName);
  };
  const currentRouteKeys = new Set();
  const lines = [];
  const addLine = (fromId, fromSide, toId, toSide, cls, delay, routeKey = '', timeline = qfTimeline) => {
    const storeKey = `${cls}:${routeKey}`;
    if (cls === 'complete' || cls === 'lost-route') currentRouteKeys.add(storeKey);
    const stableRoute = (cls === 'complete' || cls === 'lost-route') && !shouldReplayBracket && state.knownRoutes.has(storeKey);
    const newRoute = (cls === 'complete' || cls === 'lost-route') && isIncrementalRender && !state.knownRoutes.has(storeKey);
    lines.push({ d: pathBetween(fromId, fromSide, toId, toSide), cls: cls || '', delay, stableRoute, newRoute, timeline });
  };

  addLine('qf1p1', 'right', 'sf1p1', 'left', lineClassFor(qf1, qf1?.p1), 1180, routeKeyFor(qf1, qf1?.p1), qfTimeline);
  addLine('qf1p2', 'right', 'sf1p1', 'left', lineClassFor(qf1, qf1?.p2), 1240, routeKeyFor(qf1, qf1?.p2), qfTimeline);
  addLine('qf2p1', 'right', 'sf1p2', 'left', lineClassFor(qf2, qf2?.p1), 1300, routeKeyFor(qf2, qf2?.p1), qfTimeline);
  addLine('qf2p2', 'right', 'sf1p2', 'left', lineClassFor(qf2, qf2?.p2), 1360, routeKeyFor(qf2, qf2?.p2), qfTimeline);
  addLine('qf3p1', 'left', 'sf2p1', 'right', lineClassFor(qf3, qf3?.p1), 1180, routeKeyFor(qf3, qf3?.p1), qfTimeline);
  addLine('qf3p2', 'left', 'sf2p1', 'right', lineClassFor(qf3, qf3?.p2), 1240, routeKeyFor(qf3, qf3?.p2), qfTimeline);
  addLine('qf4p1', 'left', 'sf2p2', 'right', lineClassFor(qf4, qf4?.p1), 1300, routeKeyFor(qf4, qf4?.p1), qfTimeline);
  addLine('qf4p2', 'left', 'sf2p2', 'right', lineClassFor(qf4, qf4?.p2), 1360, routeKeyFor(qf4, qf4?.p2), qfTimeline);
  addLine('sf1p1', 'right', 'final', 'left', activeLineClassFor(sf1, sf1?.p1), 1780, routeKeyFor(sf1, sf1?.p1), sfTimeline);
  addLine('sf1p2', 'right', 'final', 'left', activeLineClassFor(sf1, sf1?.p2), 1840, routeKeyFor(sf1, sf1?.p2), sfTimeline);
  addLine('sf2p1', 'left', 'final', 'right', activeLineClassFor(sf2, sf2?.p1), 1780, routeKeyFor(sf2, sf2?.p1), sfTimeline);
  addLine('sf2p2', 'left', 'final', 'right', activeLineClassFor(sf2, sf2?.p2), 1840, routeKeyFor(sf2, sf2?.p2), sfTimeline);
  const lineWeight = (cls) => cls.includes('complete') ? 1 : 0;
  const lineSvg = lines
    .sort((a, b) => lineWeight(a.cls) - lineWeight(b.cls))
    .map(item => {
      const baseLine = item.newRoute && item.cls === 'complete'
        ? `<path class="bracket-v2-line base-route" pathLength="1" d="${item.d}"></path>`
        : '';
      return `${baseLine}<path class="bracket-v2-line${item.cls ? ` ${item.cls}` : ''}${item.stableRoute ? ' stable-route' : ''}${item.newRoute ? ' new-route' : ''}" pathLength="1" style="--line-delay:${item.delay}ms;${timelineStyle(item.timeline)}" d="${item.d}"></path>`;
    })
    .join('');

  const suppressWholeReplay = !shouldReplayBracket && !hasStructuralChange;
  const rootReplayClass = suppressWholeReplay ? ' no-replay' : (isIncrementalRender ? ' incremental' : '');
  container.innerHTML = `<div class="bracket-v2${rootReplayClass}" data-replay="${shouldReplayBracket ? '1' : '0'}" data-structural-change="${hasStructuralChange ? '1' : '0'}">
    <svg class="bracket-v2-svg" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true">${lineSvg}</svg>
    <img class="bracket-v2-title-art" src="/shared/pokemon-champions-title.png" alt="Pokemon Champions">
    ${roundLabel(220, 433, '\u56db\u5206\u4e4b\u4e00\u51b3\u8d5b')}
    ${roundLabel(570, 433, '\u534a\u51b3\u8d5b')}
    ${roundLabel(1350, 433, '\u534a\u51b3\u8d5b')}
    ${roundLabel(1700, 433, '\u56db\u5206\u4e4b\u4e00\u51b3\u8d5b')}
    ${node('qf1p1', qf1, 'p1', 'left', 30)}
    ${node('qf1p2', qf1, 'p2', 'left', 70)}
    ${node('qf2p1', qf2, 'p1', 'left', 110)}
    ${node('qf2p2', qf2, 'p2', 'left', 150)}
    ${node('sf1p1', sf1, 'p1', 'left', 190)}
    ${node('sf1p2', sf1, 'p2', 'left', 230)}
    ${card('final', finalMatch, '\u51b3\u8d5b', 'final', isActiveMatch(finalMatch))}
    ${card('bronze', bronzeMatch, '\u5b63\u519b\u8d5b', 'bronze', isActiveMatch(bronzeMatch))}
    ${node('sf2p1', sf2, 'p1', 'right', 270)}
    ${node('sf2p2', sf2, 'p2', 'right', 310)}
    ${node('qf3p1', qf3, 'p1', 'right', 350)}
    ${node('qf3p2', qf3, 'p2', 'right', 390)}
    ${node('qf4p1', qf4, 'p1', 'right', 430)}
    ${node('qf4p2', qf4, 'p2', 'right', 470)}
  </div>`;
  state.hasRendered = true;
  state.knownRoutes = currentRouteKeys;
  state.knownTargets = currentTargetKeys;
  if (shouldReplayBracket) {
    state.animationBusyUntil = Date.now() + 7200;
  } else if (hasStructuralChange) {
    state.animationBusyUntil = Date.now() + 2800;
  } else {
    state.animationBusyUntil = 0;
  }
}
