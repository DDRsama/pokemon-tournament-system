(function () {
  'use strict';

  const PTSOverlay = window.PTSOverlay || (window.PTSOverlay = {});

  function hasDonePhase(matches, phase) {
    return Array.isArray(matches) && matches.some(match => match && match.phase === phase && match.done);
  }

  function hasPhase(matches, phase) {
    return Array.isArray(matches) && matches.some(match => match && match.phase === phase);
  }

  function isPodiumReady(state) {
    try {
      const matches = Array.isArray(state?.matches) ? state.matches : [];
      const finalDone = hasDonePhase(matches, 'Finals');
      const bronzeDone = hasDonePhase(matches, 'Bronze Match');
      const hasBronze = hasPhase(matches, 'Bronze Match');
      if (finalDone && (!hasBronze || bronzeDone)) return true;
      const stageResults = state?.stageResults || {};
      const activeStageId = state?.activeStage?.id || state?.activeStageId || '';
      const candidateResults = activeStageId
        ? (stageResults[activeStageId] ? [stageResults[activeStageId]] : [])
        : Object.values(stageResults);
      return candidateResults.some(result =>
        result && Array.isArray(result.standings) && result.standings.some(entry => entry && Number(entry.rank) === 1 && entry.player)
      );
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  function normalizeBracketSize(value, fallback = 8) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 2 && 2 ** Math.round(Math.log2(number)) === number
      ? number
      : fallback;
  }

  function topCutBracketSize(state) {
    const stage = state?.activeStage || state?.stage || {};
    const explicit = stage?.elimination?.bracketSize
      ?? stage?.doubleElimination?.bracketSize
      ?? state?.activeStage?.advancement?.count;
    if (explicit) return normalizeBracketSize(explicit, 8);
    if (Array.isArray(state?.top8) && state.top8.length > 0) return normalizeBracketSize(state.top8.length, 8);
    const firstRound = Array.isArray(state?.matches)
      ? state.matches.filter(match => match && Number(match.bracketRound || 0) === 1 && match.phase)
      : [];
    if (firstRound.length > 0) return normalizeBracketSize(firstRound.length * 2, 8);
    return 8;
  }

  function shouldUseTop8Bracket(state) {
    const stage = state?.activeStage || state?.stage || {};
    if (stage && stage.type && stage.type !== 'single_elimination') return false;
    return topCutBracketSize(state) === 8;
  }

  function preprocessState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return {
        phase: 'error',
        overlayState: 'error',
        error: 'Invalid overlay state',
      };
    }
    return rawState;
  }

  function resolveViewKey(rawState) {
    const state = preprocessState(rawState);
    try {
      const phase = state.phase || state.status || '';
      const overlayState = state.overlayState || '';

      if (overlayState === 'error' || phase === 'error') return 'error';
      if (phase === 'setup' || phase === 'idle' || overlayState === 'idle') return 'idle';
      if (overlayState === 'swiss-ended') return 'swiss-ended';
      if (phase === 'done' && overlayState === 'top8-result') return 'top8-result';
      if (phase === 'done' && isPodiumReady(state)) return 'podium';
      if (phase === 'done') return 'idle';
      if (phase === 'swiss-ended') return 'swiss-ended';
      if (phase === 'groups-ended' || phase === 'double_elimination-ended') return 'swiss-overview';

      if (phase === 'swiss') {
        if (overlayState === 'result') return 'swiss-result';
        if (overlayState === 'live') return 'swiss-live';
        return 'swiss-overview';
      }

      if (phase === 'groups' || phase === 'double_elimination') {
        if (overlayState === 'top8-result') return 'top8-result';
        if (overlayState === 'top8-live') return 'top8-live';
        if (overlayState === 'result') return 'swiss-result';
        if (overlayState === 'live') return 'swiss-live';
        return 'swiss-overview';
      }

      if (phase === 'top8') {
        if (overlayState === 'top8-result') return 'top8-result';
        if (overlayState === 'top8-live') return 'top8-live';
        if (isPodiumReady(state)) return 'podium';
        return shouldUseTop8Bracket(state) ? 'top8-bracket' : 'swiss-overview';
      }

      return 'idle';
    } catch (err) {
      console.error(err);
      return 'error';
    }
  }

  PTSOverlay.preprocessState = preprocessState;
  PTSOverlay.resolveViewKey = resolveViewKey;
  PTSOverlay.isPodiumReady = isPodiumReady;
  PTSOverlay.topCutBracketSize = topCutBracketSize;
  PTSOverlay.shouldUseTop8Bracket = shouldUseTop8Bracket;
})();
