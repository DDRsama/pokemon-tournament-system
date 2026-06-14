(function () {
  'use strict';

  const PTSOverlay = window.PTSOverlay || (window.PTSOverlay = {});

  function $(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function setText(root, selector, value) {
    const el = $(root, selector);
    if (el) el.textContent = value ?? '';
    return el;
  }

  function setHtml(root, selector, value) {
    const el = $(root, selector);
    if (el) el.innerHTML = value ?? '';
    return el;
  }

  function show(root, selector, display) {
    const el = $(root, selector);
    if (el) el.style.display = display;
    return el;
  }

  function updateTopBar(root, state) {
    const topBar = show(root, '#topBar', 'flex');
    if (!topBar) return;
    setText(root, '#tournamentName', state.tournamentName || '-');
    const phaseLabels = {
      setup: '等待开始',
      swiss: '瑞士轮',
      'swiss-ended': '瑞士轮结束',
      top8: '淘汰赛',
      done: '已完成',
    };
    const phaseText = state.phase === 'top8' ? '' : (phaseLabels[state.phase] || '-');
    const phaseTag = setText(root, '#phaseTag', phaseText);
    if (phaseTag) phaseTag.style.display = phaseText ? '' : 'none';
    updateClock(root);
  }

  function updateClock(root) {
    const now = new Date();
    const timeText = now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    setText(root, '#liveTime', timeText);
  }

  function renderQrElement(container, text) {
    if (!container) return;
    container.innerHTML = '';
    if (!text) return;
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    container.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    const svg = container.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.display = 'block';
    }
  }

  function resultInfo(state) {
    return state.lastResult || state.currentLiveMatch || {};
  }

  function ensureOverviewTimerCleanup(ctx) {
    if (ctx.overviewTimerCleanupReady) return;
    ctx.overviewTimerCleanupReady = true;
    ctx.cleanup(() => {
      if (!ctx.overviewScrollers) return;
      for (const scroller of Object.values(ctx.overviewScrollers)) {
        if (scroller.timer) window.clearInterval(scroller.timer);
      }
      ctx.overviewScrollers = {};
    });
  }

  function autoScrollListInView(ctx, key, el, options = {}) {
    if (!el) return;
    if (!ctx.overviewScrollers) ctx.overviewScrollers = {};
    const stepMs = options.stepMs || 34;
    const travelMs = options.travelMs || 45000;
    const edgePauseMs = options.edgePauseMs || 650;
    const topPauseMs = options.topPauseMs || edgePauseMs;
    const bottomPauseMs = options.bottomPauseMs || edgePauseMs;
    const getStepPx = (currentEl, currentMax) => {
      if (options.itemsPerSecond) {
        const firstItem = currentEl.children && currentEl.children[0];
        const styles = window.getComputedStyle(currentEl);
        const rowGap = parseFloat(styles.rowGap || styles.gap || '0') || 0;
        const itemHeight = firstItem ? firstItem.getBoundingClientRect().height : 0;
        const pxPerSecond = Math.max(1, (itemHeight + rowGap) * options.itemsPerSecond);
        return pxPerSecond * stepMs / 1000;
      }
      return options.stepPx || (currentMax / Math.max(1, travelMs / stepMs));
    };
    let scroller = ctx.overviewScrollers[key];
    if (!scroller) {
      scroller = { direction: 1, holdUntil: 0, el, timer: null, virtualTop: el.scrollTop || 0 };
      scroller.timer = window.setInterval(() => {
        const now = Date.now();
        const currentEl = scroller.el;
        if (!currentEl || now < scroller.holdUntil) return;
        const currentMax = currentEl.scrollHeight - currentEl.clientHeight;
        if (currentMax <= 4) {
          currentEl.scrollTop = 0;
          scroller.direction = 1;
          return;
        }
        if (typeof scroller.virtualTop !== 'number') scroller.virtualTop = currentEl.scrollTop || 0;
        if (Math.abs((currentEl.scrollTop || 0) - scroller.virtualTop) > 3) {
          scroller.virtualTop = currentEl.scrollTop || 0;
        }
        if (scroller.direction > 0 && scroller.virtualTop >= currentMax - 2) {
          scroller.virtualTop = currentMax;
          currentEl.scrollTop = currentMax;
          scroller.direction = -1;
          scroller.holdUntil = now + bottomPauseMs;
          return;
        }
        if (scroller.direction < 0 && scroller.virtualTop <= 2) {
          scroller.virtualTop = 0;
          currentEl.scrollTop = 0;
          scroller.direction = 1;
          scroller.holdUntil = now + topPauseMs;
          return;
        }
        const stepPx = getStepPx(currentEl, currentMax);
        scroller.virtualTop = Math.max(0, Math.min(currentMax, scroller.virtualTop + stepPx * scroller.direction));
        currentEl.scrollTop = scroller.virtualTop;
      }, stepMs);
      ctx.overviewScrollers[key] = scroller;
    }
    scroller.el = el;
    if (typeof scroller.virtualTop !== 'number') scroller.virtualTop = el.scrollTop || 0;
    const currentMax = el.scrollHeight - el.clientHeight;
    if (currentMax <= 4) {
      el.scrollTop = 0;
      scroller.virtualTop = 0;
      scroller.direction = 1;
    } else if (el.scrollTop > currentMax) {
      el.scrollTop = currentMax;
      scroller.virtualTop = currentMax;
      scroller.direction = -1;
    }
  }

  function startSwissOverviewAutoScroll(root, ctx, state) {
    ensureOverviewTimerCleanup(ctx);
    const roundKey = `${state.tournamentId || ''}:${state.phase || ''}:${state.round || ''}`;
    const roundChanged = ctx.overviewRoundKey && ctx.overviewRoundKey !== roundKey;
    ctx.overviewRoundKey = roundKey;
    const playerList = $(root, '#ovPlayerList');
    const tableList = $(root, '#ovTableList');
    if (roundChanged) {
      if (playerList) playerList.scrollTop = 0;
      if (tableList) tableList.scrollTop = 0;
      if (ctx.overviewScrollers) {
        for (const scroller of Object.values(ctx.overviewScrollers)) {
          scroller.direction = 1;
          scroller.virtualTop = 0;
          scroller.holdUntil = Date.now() + 500;
        }
      }
    }
    autoScrollListInView(ctx, 'players', playerList, { stepMs: 32, itemsPerSecond: 1.5, topPauseMs: 7000, bottomPauseMs: 2000 });
    autoScrollListInView(ctx, 'tables', tableList, { stepMs: 32, travelMs: 5000, topPauseMs: 3000, bottomPauseMs: 3000 });
    if (ctx.overviewFollowUntil && ctx.overviewScrollers?.players) {
      ctx.overviewScrollers.players.holdUntil = Math.max(
        ctx.overviewScrollers.players.holdUntil || 0,
        ctx.overviewFollowUntil
      );
    }
  }

  function startSwissEndedAutoScroll(root, ctx) {
    const rankingList = $(root, '.se-ranking-list');
    autoScrollListInView(ctx, 'swiss-ended-ranking', rankingList, {
      stepMs: 32,
      itemsPerSecond: 0.7,
      topPauseMs: 5000,
      bottomPauseMs: 2500,
    });
  }

  function scheduleOverflowMeasure(root, ctx) {
    markOverflowingText(root);
    requestAnimationFrame(() => {
      if (ctx.destroyed) return;
      requestAnimationFrame(() => {
        if (!ctx.destroyed) markOverflowingText(root);
      });
    });
    if (ctx.overflowMeasureTimer) {
      window.clearTimeout(ctx.overflowMeasureTimer);
      ctx.overflowMeasureTimer = null;
    }
    ctx.overflowMeasureTimer = ctx.setTimeout(() => {
      ctx.overflowMeasureTimer = null;
      markOverflowingText(root);
    }, 250);
  }

  function registerView(viewKey, templateId, update) {
    PTSOverlay.registerView(viewKey, {
      templateId,
      init(root, state, ctx) {
        ctx.setInterval(() => updateClock(root), 1000);
      },
      update(root, state, ctx) {
        update(root, state, ctx);
        scheduleOverflowMeasure(root, ctx);
      },
      destroy() {},
    });
  }

  registerView('idle', 'tpl-idle', (root, state) => {
    setText(root, '#idleTitle', state.phase === 'done' ? '比赛结束' : (state.tournamentName || '等待开始'));
    setText(root, '#idleSub', state.phase === 'done' ? (state.tournamentName || '') : '报名阶段');
    const baseUrl = state.publicBaseUrl || location.origin;
    const tournamentId = state.tournamentId || overlayTournamentId;
    const playerUrl = `${baseUrl}/t/${encodeURIComponent(tournamentId)}/player-login`;
    renderQrElement($(root, '#idleQrImage'), playerUrl);
    show(root, '#state-idle', 'flex');
  });

  registerView('swiss-result', 'tpl-swiss-result', (root, state) => {
    updateTopBar(root, state);
    const info = state.lastResult || {};
    const isDraw = info.draw || info.winner === 'Draw';
    show(root, '#state-result', 'flex');
    setText(root, '.result-kicker', isDraw ? 'DRAW' : 'WINNER');
    setText(root, '#resultWinner', isDraw ? '平局' : (info.winner || '-'));
    setText(root, '#resultVs', `${info.p1 || '-'} vs ${info.p2 || '-'}`);
    setText(root, '#resultWinText', isDraw ? '握手言和' : '胜!');
  });

  registerView('swiss-live', 'tpl-swiss-live', (root, state) => {
    updateTopBar(root, state);
    const liveMatch = state.currentLiveMatch || state.lastLiveMatch || {};
    show(root, '#state-live', 'flex');
    setText(root, '#liveRoundTag', `Round ${liveMatch.round || state.round || '-'}`);
    const p1 = liveMatch.p1 || '-';
    const p2 = liveMatch.p2 || '-';
    const p1Rec = p1 !== '-' ? getRecord(p1, state.matches || []) : null;
    const p2Rec = p2 !== '-' ? getRecord(p2, state.matches || []) : null;
    setHtml(root, '#liveP1Name', renderMarqueeText(p1));
    setHtml(root, '#liveP1Record', renderRecordChips(p1Rec));
    setHtml(root, '#liveP2Name', renderMarqueeText(p2));
    setHtml(root, '#liveP2Record', renderRecordChips(p2Rec));
    updateClock(root);
  });

  registerView('swiss-overview', 'tpl-swiss-overview', (root, state, ctx) => {
    updateTopBar(root, state);
    show(root, '#state-overview', 'flex');
    renderOverviewInto(root, state, ctx);
    startSwissOverviewAutoScroll(root, ctx, state);
  });

  registerView('swiss-ended', 'tpl-swiss-ended', (root, state, ctx) => {
    const topBar = root.querySelector('#topBar');
    if (topBar) topBar.style.display = 'none';
    show(root, '#state-swiss-ended', 'flex');
    renderSwissEndedInto(root, state);
    startSwissEndedAutoScroll(root, ctx);
  });

  registerView('top8-result', 'tpl-top8-result', (root, state) => {
    updateTopBar(root, state);
    const info = resultInfo(state);
    const phase = inferTop8ResultPhase(info, state.matches || []);
    show(root, '#state-top8-result', 'flex');
    setText(root, '#top8ResultPhase', top8PhaseName(phase));
    setText(root, '#top8ResultWinner', info.winner || '-');
    setHtml(root, '#top8ResultScore', renderTop8ResultScore(info));
    setText(root, '#top8ResultWinText', '胜!');
  });

  registerView('top8-live', 'tpl-top8-live', (root, state) => {
    updateTopBar(root, state);
    const live = state.currentLiveMatch || {};
    show(root, '#state-top8-live', 'flex');
    setText(root, '#top8Phase', top8PhaseName(live.phase || '淘汰赛'));
    setHtml(root, '#top8P1', renderMarqueeText(live.p1 || '-'));
    setHtml(root, '#top8P2', renderMarqueeText(live.p2 || '-'));
    setText(root, '#top8P1Score', live.p1Wins || 0);
    setText(root, '#top8P2Score', live.p2Wins || 0);
    const p1Score = $(root, '#top8P1Score');
    const p2Score = $(root, '#top8P2Score');
    if (p1Score) {
      p1Score.className = 'top8-live-score' + ((live.p1Wins || 0) >= 2 ? ' winning' : '');
      p1Score.removeAttribute('style');
    }
    if (p2Score) {
      p2Score.className = 'top8-live-score' + ((live.p2Wins || 0) >= 2 ? ' winning' : '');
      p2Score.removeAttribute('style');
    }
  });

  registerView('top8-bracket', 'tpl-top8-bracket', (root, state, ctx) => {
    updateTopBar(root, state);
    show(root, '#state-top8-bracket', 'flex');
    if (!ctx.top8BracketRuntime) {
      ctx.top8BracketRuntime = {
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
      ctx.cleanup(() => {
        if (ctx.top8BracketRuntime.bridgeTimer) {
          window.clearTimeout(ctx.top8BracketRuntime.bridgeTimer);
          ctx.top8BracketRuntime.bridgeTimer = null;
        }
        if (ctx.top8BracketRuntime.queueTimer) {
          window.clearTimeout(ctx.top8BracketRuntime.queueTimer);
          ctx.top8BracketRuntime.queueTimer = null;
        }
      });
    }
    const runtime = ctx.top8BracketRuntime;
    const signature = typeof window.top8BracketStateSignature === 'function'
      ? window.top8BracketStateSignature(state)
      : '';
    const now = Date.now();
    const isBusy = runtime.animationBusyUntil && now < runtime.animationBusyUntil;
    const hasVisualChange = runtime.hasRendered && signature && signature !== runtime.signature;
    if (isBusy && runtime.hasRendered) {
      if (hasVisualChange) {
        runtime.queuedState = state;
        if (!runtime.queueTimer) {
          const delay = Math.max(80, runtime.animationBusyUntil - now + 40);
          runtime.queueTimer = ctx.setTimeout(() => {
            runtime.queueTimer = null;
            const queuedState = runtime.queuedState;
            runtime.queuedState = null;
            if (!queuedState) return;
            updateTopBar(root, queuedState);
            renderTop8BracketInto(root, queuedState, runtime);
            markOverflowingText(root);
          }, delay);
        }
      }
      return;
    }
    runtime.queuedState = null;
    renderTop8BracketInto(root, state, runtime);
  });

  registerView('podium', 'tpl-podium', (root, state) => {
    show(root, '#state-podium', 'flex');
    renderPodiumInto(root, state);
  });

  registerView('error', 'tpl-error', (root, state) => {
    setText(root, '#overlayErrorMessage', state.error || '叠加层加载失败');
  });

  PTSOverlay.registerView('top8-overview', {
    templateId: 'tpl-top8-overview',
    init(root, state, ctx) {
      ctx.setInterval(() => updateClock(root), 1000);
    },
    update(root, state) {
      updateTopBar(root, state);
      show(root, '#state-overview', 'flex');
      renderTop8OverviewInto(root, state);
      markOverflowingText(root);
    },
    destroy() {},
  });
})();
