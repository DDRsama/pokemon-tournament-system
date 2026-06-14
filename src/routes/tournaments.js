function registerTournamentsRoutes(app, deps) {
  const {
    syncTournamentRequest,
    buildClientState,
    listTournaments,
    buildPlayerView,
    createTournament,
    loadTournament,
    saveState,
    broadcast,
    freshState,
    resetCurrentState,
    loadLatestTournamentIfAny,
    setCurrentTournamentId,
    current,
    tournamentStore,
    saveCurrentAsCache,
  } = deps;

app.get('/api/tournaments/:tournamentId/state', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  res.json(buildClientState());
});
app.get('/api/tournaments', (req, res) => res.json(listTournaments()));
app.get('/api/tournaments/:tournamentId/player-view/:playerName', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const playerName = decodeURIComponent(req.params.playerName || '').trim();
  res.json(buildPlayerView(playerName));
});
app.get('/api/tournaments/:tournamentId/player-view-by-id/:playerId', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const playerId = decodeURIComponent(req.params.playerId || '').trim();
  res.json(buildPlayerView(playerId));
});

app.post('/api/tournaments', (req, res) => {
  const { action, name, id } = req.body || {};
  if (action === 'create') {
    const nextId = createTournament(name);
    broadcast();
    return res.json({ ok: true, id: nextId, state: buildClientState() });
  }
  if (action === 'load') {
    if (!loadTournament(id)) return res.status(404).json({ ok: false, err: 'not found' });
    broadcast();
    return res.json({ ok: true, state: buildClientState() });
  }
  if (action === 'rename') {
    const targetId = id || req.body.tournamentId;
    if (!targetId) return res.status(400).json({ ok: false, err: 'missing tournament id' });
    if (!syncTournamentRequest(targetId)) return res.status(404).json({ ok: false, err: 'tournament not found' });
    current().tournamentName = (name || '未命名比赛').trim();
    saveState();
    broadcast();
    return res.json({ ok: true, state: buildClientState() });
  }
  if (action === 'delete') {
    if (!id) return res.status(400).json({ ok: false, err: 'missing tournament id' });
    tournamentStore.remove(id);
    if (current()._id === id) {
      setCurrentTournamentId(null);
      resetCurrentState(freshState());
      loadLatestTournamentIfAny();
      saveCurrentAsCache();
    }
    broadcast();
    return res.json({ ok: true, state: buildClientState() });
  }
  return res.status(400).json({ ok: false, err: 'unknown action' });
});
}

module.exports = { registerTournamentsRoutes };
