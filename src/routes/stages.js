function registerStagesRoutes(app, deps) {
  const {
    syncTournamentRequest,
    buildClientState,
    saveState,
    broadcast,
    listTournamentStages,
    startTournamentStage,
    generateStageMatches,
    completeTournamentStage,
    advanceTournamentStage,
  } = deps;

  app.get('/api/tournaments/:tournamentId/stages', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    return res.json({ ok: true, stages: listTournamentStages() });
  });

  app.post('/api/tournaments/:tournamentId/stages/:stageId/start', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const result = startTournamentStage(req.params.stageId);
    if (!result.ok) return res.json({ ...result, state: buildClientState() });
    saveState();
    broadcast();
    return res.json({ ...result, state: buildClientState() });
  });

  app.post('/api/tournaments/:tournamentId/stages/:stageId/generate-matches', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const result = generateStageMatches(req.params.stageId);
    if (!result.ok) return res.json({ ...result, state: buildClientState() });
    saveState();
    broadcast();
    return res.json({ ...result, state: buildClientState() });
  });

  app.post('/api/tournaments/:tournamentId/stages/:stageId/complete', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const result = completeTournamentStage(req.params.stageId);
    if (!result.ok) return res.json({ ...result, state: buildClientState() });
    saveState();
    broadcast();
    return res.json({ ...result, state: buildClientState() });
  });

  app.post('/api/tournaments/:tournamentId/stages/:stageId/advance', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const result = advanceTournamentStage(req.params.stageId);
    if (!result.ok) return res.json({ ...result, state: buildClientState() });
    saveState();
    broadcast();
    return res.json({ ...result, state: buildClientState() });
  });
}

module.exports = { registerStagesRoutes };
