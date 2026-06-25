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
      groups: '小组赛',
      'groups-ended': '小组赛结束',
      top8: '淘汰赛',
      double_elimination: '双败淘汰',
      'double_elimination-ended': '双败结束',
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

  function livePhaseLabel(match, state) {
    const raw = match.phase || match.groupLabel || match.bracket || match.stagePhase || '';
    const labels = {
      groups: '小组赛',
      double_elimination: '双败淘汰',
      winners: '胜者组',
      losers: '败者组',
      grand_final: '总决赛',
      'Quarter Finals': '八强赛',
      'Semi Finals': '半决赛',
      'Bronze Match': '季军赛',
      Finals: '决赛',
    };
    if (raw) return labels[raw] || raw;
    if (match.round || state.round) return `Round ${match.round || state.round}`;
    return labels[state.phase] || state.phase || '-';
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

  function stopSwissOverviewAutoScroll(ctx) {
    ensureOverviewTimerCleanup(ctx);
    if (!ctx.overviewScrollers) return;
    for (const scroller of Object.values(ctx.overviewScrollers)) {
      if (scroller.timer) window.clearInterval(scroller.timer);
    }
    ctx.overviewScrollers = {};
  }

  function autoScrollListInView(ctx, key, el, options = {}) {
    if (!el) return;
    if (!ctx.overviewScrollers) ctx.overviewScrollers = {};
    const scrollOptions = {
      stepMs: options.stepMs || 34,
      travelMs: options.travelMs || 45000,
      edgePauseMs: options.edgePauseMs || 650,
      topPauseMs: options.topPauseMs || options.edgePauseMs || 650,
      bottomPauseMs: options.bottomPauseMs || options.edgePauseMs || 650,
      itemsPerSecond: options.itemsPerSecond,
      stepPx: options.stepPx,
    };
    const getStepPx = (currentEl, currentMax, currentOptions) => {
      if (currentOptions.itemsPerSecond) {
        const firstItem = currentEl.children && currentEl.children[0];
        const styles = window.getComputedStyle(currentEl);
        const rowGap = parseFloat(styles.rowGap || styles.gap || '0') || 0;
        const itemHeight = firstItem ? firstItem.getBoundingClientRect().height : 0;
        const pxPerSecond = Math.max(1, (itemHeight + rowGap) * currentOptions.itemsPerSecond);
        return pxPerSecond * currentOptions.stepMs / 1000;
      }
      return currentOptions.stepPx || (currentMax / Math.max(1, currentOptions.travelMs / currentOptions.stepMs));
    };
    let scroller = ctx.overviewScrollers[key];
    if (!scroller) {
      scroller = { direction: 1, holdUntil: 0, el, timer: null, virtualTop: el.scrollTop || 0 };
      ctx.overviewScrollers[key] = scroller;
    }
    scroller.options = scrollOptions;
    if (scroller.timer && scroller.stepMs !== scrollOptions.stepMs) {
      window.clearInterval(scroller.timer);
      scroller.timer = null;
    }
    if (!scroller.timer) {
      scroller.stepMs = scrollOptions.stepMs;
      scroller.timer = window.setInterval(() => {
        const now = Date.now();
        const currentEl = scroller.el;
        const currentOptions = scroller.options || scrollOptions;
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
          scroller.holdUntil = now + currentOptions.bottomPauseMs;
          return;
        }
        if (scroller.direction < 0 && scroller.virtualTop <= 2) {
          scroller.virtualTop = 0;
          currentEl.scrollTop = 0;
          scroller.direction = 1;
          scroller.holdUntil = now + currentOptions.topPauseMs;
          return;
        }
        const stepPx = getStepPx(currentEl, currentMax, currentOptions);
        scroller.virtualTop = Math.max(0, Math.min(currentMax, scroller.virtualTop + stepPx * scroller.direction));
        currentEl.scrollTop = scroller.virtualTop;
      }, scrollOptions.stepMs);
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

  function isGroupOverviewAutoScrollState(state) {
    const stage = state?.activeStage || state?.stage || {};
    return state?.phase === 'groups'
      || state?.phase === 'groups-ended'
      || stage.type === 'groups'
      || stage.type === 'group_round_robin';
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
    const isGroupOverview = isGroupOverviewAutoScrollState(state);
    autoScrollListInView(ctx, 'players', playerList, {
      stepMs: 32,
      itemsPerSecond: isGroupOverview ? 0.5 : 1.5,
      topPauseMs: 7000,
      bottomPauseMs: 2000,
    });
    autoScrollListInView(ctx, 'tables', tableList, {
      stepMs: 32,
      travelMs: isGroupOverview ? 15000 : 5000,
      topPauseMs: 3000,
      bottomPauseMs: 3000,
    });
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
    setText(root, '#liveRoundTag', livePhaseLabel(liveMatch, state));
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
    if (state.phase === 'double_elimination') {
      stopSwissOverviewAutoScroll(ctx);
    } else {
      startSwissOverviewAutoScroll(root, ctx, state);
    }
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
    setText(root, '#top8Phase', top8PhaseName(live.phase || live.bracket || live.stagePhase || '淘汰赛'));
    setHtml(root, '#top8P1', renderMarqueeText(live.p1 || '-'));
    setHtml(root, '#top8P2', renderMarqueeText(live.p2 || '-'));
    setText(root, '#top8P1Score', live.p1Wins || 0);
    setText(root, '#top8P2Score', live.p2Wins || 0);
    setText(root, '#top8BoLabel', `BO${Number(live.bestOf || state.activeStage?.matchRules?.bestOf || 3)}`);
    const p1Score = $(root, '#top8P1Score');
    const p2Score = $(root, '#top8P2Score');
    if (p1Score) {
      const bestOf = Number(live.bestOf || state.activeStage?.matchRules?.bestOf || 3);
      const required = Math.max(1, Math.floor(bestOf / 2) + 1);
      p1Score.className = 'top8-live-score' + ((live.p1Wins || 0) >= required ? ' winning' : '');
      p1Score.removeAttribute('style');
    }
    if (p2Score) {
      const bestOf = Number(live.bestOf || state.activeStage?.matchRules?.bestOf || 3);
      const required = Math.max(1, Math.floor(bestOf / 2) + 1);
      p2Score.className = 'top8-live-score' + ((live.p2Wins || 0) >= required ? ' winning' : '');
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
