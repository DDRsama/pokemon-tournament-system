(function () {
  'use strict';

  const PTSOverlay = window.PTSOverlay || (window.PTSOverlay = {});

  function hasDonePhase(matches, phase) {
    return Array.isArray(matches) && matches.some(match => match && match.phase === phase && match.done);
  }

  function isPodiumReady(state) {
    try {
      const matches = Array.isArray(state?.matches) ? state.matches : [];
      const finalDone = hasDonePhase(matches, 'Finals');
      const bronzeDone = hasDonePhase(matches, 'Bronze Match');
      return finalDone && bronzeDone;
    } catch (err) {
      console.error(err);
      return false;
    }
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
      if (phase === 'done' && isPodiumReady(state)) return 'podium';
      if (phase === 'swiss-ended') return 'swiss-ended';

      if (phase === 'swiss') {
        if (overlayState === 'result') return 'swiss-result';
        if (overlayState === 'live') return 'swiss-live';
        return 'swiss-overview';
      }

      if (phase === 'top8') {
        if (overlayState === 'top8-result') return 'top8-result';
        if (overlayState === 'top8-live') return 'top8-live';
        if (isPodiumReady(state)) return 'podium';
        return 'top8-bracket';
      }

      if (phase === 'done') return 'idle';
      return 'idle';
    } catch (err) {
      console.error(err);
      return 'error';
    }
  }

  PTSOverlay.preprocessState = preprocessState;
  PTSOverlay.resolveViewKey = resolveViewKey;
  PTSOverlay.isPodiumReady = isPodiumReady;
})();
