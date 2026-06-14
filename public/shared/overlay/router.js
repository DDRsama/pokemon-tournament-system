// Overlay state entrypoint. Real routing lives in state-router.js and transition-manager.js.

function render(state) {
  try {
    if (!window.PTSOverlay || typeof window.PTSOverlay.updateView !== 'function') {
      throw new Error('PTSOverlay core is not ready');
    }
    window.PTSOverlay.updateView(state);
  } catch (err) {
    console.error(err);
    if (window.PTSOverlay && typeof window.PTSOverlay.showError === 'function') {
      window.PTSOverlay.showError(err.message || 'Overlay render failed');
    }
  }
}
