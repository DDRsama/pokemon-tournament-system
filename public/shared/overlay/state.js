
let clockInterval;
const overlayRouteMatch = location.pathname.match(/^\/t\/([^/]+)\/overlay\/?$/);
const overlayTournamentId = overlayRouteMatch ? decodeURIComponent(overlayRouteMatch[1]) : '';
if (!overlayTournamentId) {
  document.body.innerHTML = '<div style="padding:40px;color:#fff;font-family:var(--pts-font-sans),sans-serif;">Tournament not found</div>';
}
let top8AnimatedPhase = null;
let top8BridgeTimer = null;
let top8BracketSignature = '';
let top8BracketHasRendered = false;
let top8BracketKnownRoutes = new Set();
let top8BracketKnownTargets = new Set();
let top8BracketLastTournamentId = '';

// ── 轮询 ─────────────────────────────────────────────────
const overlayParams = new URLSearchParams(window.location.search);
const holdResultPreview = overlayParams.get('holdResult') === '1';
let currentState = null;
let heldResultState = null;

async function poll() {
  try {
    const stateUrl = `/api/tournaments/${encodeURIComponent(overlayTournamentId)}/state`;
    const res = await fetch(stateUrl);
    const s = await res.json();
    let renderState = s;
    if (holdResultPreview && s.lastResult && !s.currentLiveMatch) {
      renderState = JSON.parse(JSON.stringify(s));
      renderState.overlayState = s.phase === 'top8' ? 'top8-result' : 'result';
      heldResultState = renderState;
    } else if (holdResultPreview && heldResultState && s.overlayState !== 'result' && s.overlayState !== 'top8-result') {
      renderState = heldResultState;
    }
    if (JSON.stringify(renderState) !== JSON.stringify(currentState)) {
      currentState = renderState;
      render(currentState);
    }
  } catch(e) {}
}
