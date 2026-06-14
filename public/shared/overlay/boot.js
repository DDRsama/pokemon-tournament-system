// Overlay polling bootstrap. Loaded last.

const POLL_INTERVAL = 2000;

try {
  if (!window.PTSOverlay) {
    throw new Error('PTSOverlay core is not loaded');
  }
  window.PTSOverlay.assertBootReady();
  document.documentElement.dataset.ptsOverlayCore = 'ready';

  setInterval(poll, POLL_INTERVAL);
  poll();
  setInterval(() => {
    const now = new Date();
    const t = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    document.getElementById('liveTime') && (document.getElementById('liveTime').textContent = t);
    document.getElementById('liveTime2') && (document.getElementById('liveTime2').textContent = t);
  }, 1000);
} catch (err) {
  console.error(err);
  if (window.PTSOverlay && typeof window.PTSOverlay.showError === 'function') {
    window.PTSOverlay.showError(err.message || 'Overlay boot failed');
  }
}
