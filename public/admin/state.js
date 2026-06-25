window.PTSAdmin = window.PTSAdmin || {};
// ── 比赛管理 ─────────────────────────────────────────────
const routeMatch = location.pathname.match(/^\/t\/([^/]+)\/admin\/?$/);
const currentTourId = routeMatch ? decodeURIComponent(routeMatch[1]) : '';
let currentState = null;
let pendingSocketState = null;
let committedPublicBaseUrlInput = '';
let publicBaseUrlConfirming = false;
const OVERLAY_CANVAS_WIDTH = 1920;
const OVERLAY_CANVAS_HEIGHT = 1080;
const overlayPreviewEl = document.querySelector('.overlay-preview');
if (!currentTourId) {
  location.replace('/');
}

function removeLegacySwissControlsFromDom(root = document) {
  const legacyIds = [
    'swiss' + 'Arena',
    'swiss' + 'Hint',
    'swiss' + 'HintText',
    'round' + 'HeaderArea',
    'round' + 'Header',
    'match' + 'List',
    'btn' + 'Start',
    'btn' + 'Next',
    'btn' + 'EndSwiss',
    'btn' + 'Revert',
    'swiss' + 'Rounds',
  ];
  legacyIds.forEach(id => root.getElementById?.(id)?.remove());

  const legacyText = [
    '瑞士轮' + '轮数',
    '当前' + '人数',
    '进入' + '淘汰赛',
    '开始' + '瑞士轮',
    '结束' + '瑞士轮',
    '下一' + '轮',
    '← ' + '回退',
  ];
  const legacySelectors = ['button', '.config-row', '.side-module', '.config-box', '.phase-hint']
    .concat(legacyIds.map(id => `#${id}`))
    .join(', ');
  root.querySelectorAll?.(legacySelectors).forEach(el => {
    if (el.closest('[data-admin-modern]')) return;
    const text = (el.textContent || '').trim();
    const hits = legacyText.filter(token => text.includes(token));
    if (hits.length === 0) return;
    const block = el.closest('.config-box, .side-module');
    (block || el).remove();
  });
}

function installLegacySwissGuard() {
  removeLegacySwissControlsFromDom();
  if (!('MutationObserver' in window)) return;
  const observer = new MutationObserver(() => removeLegacySwissControlsFromDom());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function updateOverlayPreviewScale() {
  if (!overlayPreviewEl) return;
  const scale = Math.min(
    overlayPreviewEl.clientWidth / OVERLAY_CANVAS_WIDTH,
    overlayPreviewEl.clientHeight / OVERLAY_CANVAS_HEIGHT
  );
  overlayPreviewEl.style.setProperty('--overlay-preview-scale', String(scale || 0.2));
}

function renderOrQueue(state) {
  if (typeof window.render === 'function') {
    window.render(state);
    return;
  }
  pendingSocketState = state;
}

function flushPendingSocketState() {
  if (!pendingSocketState || typeof window.render !== 'function') return;
  const state = pendingSocketState;
  pendingSocketState = null;
  window.render(state);
}

if (overlayPreviewEl && 'ResizeObserver' in window) {
  new ResizeObserver(updateOverlayPreviewScale).observe(overlayPreviewEl);
}
window.addEventListener('resize', updateOverlayPreviewScale);
updateOverlayPreviewScale();
installLegacySwissGuard();

Object.assign(window.PTSAdmin, { updateOverlayPreviewScale, renderOrQueue, flushPendingSocketState, removeLegacySwissControlsFromDom });
