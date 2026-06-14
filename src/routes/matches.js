function registerMatchesRoutes(app, deps) {
  const {
    syncTournamentRequest,
    buildClientState,
    saveState,
    broadcast,
    swapMatchSeats,
    applyResult,
    applyDraw,
    applyBo3Score,
  } = deps;

app.post('/api/tournaments/:tournamentId/swap-seats', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = swapMatchSeats(req.body.matchId);
  if (!ok) return res.json({ ok: false, err: 'match not found' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/result', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = applyResult(req.body.matchId, req.body.winnerId);
  if (!ok) return res.json({ ok: false, err: 'match not found' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/draw', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = applyDraw(req.body.matchId);
  if (!ok) return res.json({ ok: false, err: 'match not found' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/bo3-score', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = applyBo3Score(req.body.matchId, req.body.p1Wins, req.body.p2Wins);
  if (!ok) return res.json({ ok: false, err: 'match not found' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});
}

module.exports = { registerMatchesRoutes };
