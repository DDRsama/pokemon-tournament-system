const { applySharedLiveRoomCodeToTopCut } = require('../core/matches');

function registerTop8Routes(app, deps) {
  const {
    syncTournamentRequest,
    buildClientState,
    saveState,
    broadcast,
    enterTop8,
    cancelTop8Confirm,
    getPostMatchOverlayState,
    getLiveOverlayStateForMatch,
    current,
  } = deps;

app.post('/api/tournaments/:tournamentId/enter-top8', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = enterTop8();
  if (!ok) return res.json({ ok: false, err: 'not enough top8 players' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/cancel-top8', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  cancelTop8Confirm();
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/set-live', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const { matchId } = req.body || {};
  if (current().currentLiveMatch && current().currentLiveMatch.id === matchId) {
    current().currentLiveMatch = null;
    current().pendingLiveMatch = null;
    current().lastLiveMatch = null;
    current().overlayState = getPostMatchOverlayState();
    saveState();
    broadcast();
    return res.json({ ok: true, state: buildClientState() });
  }
  if (current().pendingLiveMatch && current().pendingLiveMatch.id === matchId) {
    current().pendingLiveMatch = null;
    const pendingMatch = current().matches.find(m => m.id === matchId);
    if (pendingMatch && !pendingMatch.done) {
      pendingMatch.wasLive = false;
      pendingMatch.liveRoomCode = null;
      applySharedLiveRoomCodeToTopCut(current(), pendingMatch);
    }
    saveState();
    broadcast();
    return res.json({ ok: true, state: buildClientState() });
  }
  const match = current().matches.find(m => m.id === matchId);
  if (!match) return res.json({ ok: false, err: 'match not found' });
  match.wasLive = true;
  match.liveRoomCode = current().liveRoomCode || null;
  applySharedLiveRoomCodeToTopCut(current(), match);
  match.liveRoomCode = current().liveRoomCode || null;
  current().pendingLiveMatch = { id: match.id, p1: match.p1, p2: match.p2, table: match.table, round: match.round || current().round, phase: match.phase || match.groupLabel || match.bracket || match.stagePhase || null, liveRoomCode: match.liveRoomCode || null };
  current().currentLiveMatch = null;
  current().lastLiveMatch = current().pendingLiveMatch;
  current().overlayState = getPostMatchOverlayState();
  if (current().phase === 'swiss') {
    const featured = new Set(current()._featuredSwissPlayers || []);
    if (match.p1 && match.p1 !== 'BYE') featured.add(match.p1);
    if (match.p2 && match.p2 !== 'BYE') featured.add(match.p2);
    current()._featuredSwissPlayers = [...featured];
  }
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/start-live', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const { matchId } = req.body || {};
  const match = current().matches.find(m => m.id === matchId);
  if (!match) return res.json({ ok: false, err: 'match not found' });
  match.wasLive = true;
  match.liveRoomCode = current().liveRoomCode || match.liveRoomCode || null;
  applySharedLiveRoomCodeToTopCut(current(), match);
  match.liveRoomCode = current().liveRoomCode || match.liveRoomCode || null;
  current().pendingLiveMatch = null;
  current().currentLiveMatch = match;
  current().lastLiveMatch = { id: match.id, p1: match.p1, p2: match.p2, table: match.table, round: match.round || current().round, phase: match.phase || match.groupLabel || match.bracket || match.stagePhase || null, liveRoomCode: match.liveRoomCode || null };
  current().overlayState = typeof getLiveOverlayStateForMatch === 'function'
    ? getLiveOverlayStateForMatch(match)
    : (current().phase === 'top8' ? 'top8-live' : 'live');
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});
}

module.exports = { registerTop8Routes };
