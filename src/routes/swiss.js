function registerSwissRoutes(app, deps) {
  const {
    syncTournamentRequest,
    buildClientState,
    saveState,
    broadcast,
    startSwiss,
    nextRound,
    generateRoundMatches,
    endSwiss,
    revertRound,
  } = deps;

app.post('/api/tournaments/:tournamentId/start-swiss', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = startSwiss(req.body.rounds || 5);
  if (!ok) return res.json({ ok: false, err: 'not enough players' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/next-round', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const result = nextRound();
  if (!result.ok) return res.json({ ok: false, err: result.err, state: buildClientState() });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/generate-matches', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/end-swiss', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  endSwiss();
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/revert-round', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const result = revertRound();
  if (!result.ok) return res.json({ ok: false, err: result.err, state: buildClientState() });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});
}

module.exports = { registerSwissRoutes };
