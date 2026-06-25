// Overlay polling bootstrap. Loaded last.

const POLL_INTERVAL = 2000;

function waitForImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
    if (img.decode) {
      img.decode().then(() => resolve(true)).catch(() => resolve(false));
    }
  });
}

async function waitForOverlayAssets() {
  const tasks = [];
  if (document.fonts && document.fonts.ready) {
    tasks.push(document.fonts.ready.catch(() => null));
  }
  tasks.push(waitForImage('/shared/pokemon-champions-title.png'));
  await Promise.all(tasks);
  document.documentElement.dataset.ptsOverlayBoot = 'ready';
}

try {
  if (!window.PTSOverlay) {
    throw new Error('PTSOverlay core is not loaded');
  }
  window.PTSOverlay.assertBootReady();
  document.documentElement.dataset.ptsOverlayCore = 'ready';

  waitForOverlayAssets().then(() => {
    setInterval(poll, POLL_INTERVAL);
    poll();
    setInterval(() => {
      const now = new Date();
      const t = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      document.getElementById('liveTime') && (document.getElementById('liveTime').textContent = t);
      document.getElementById('liveTime2') && (document.getElementById('liveTime2').textContent = t);
    }, 1000);
  });
} catch (err) {
  console.error(err);
  document.documentElement.dataset.ptsOverlayBoot = 'ready';
  if (window.PTSOverlay && typeof window.PTSOverlay.showError === 'function') {
    window.PTSOverlay.showError(err.message || 'Overlay boot failed');
  }
}
