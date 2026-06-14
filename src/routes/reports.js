function registerReportsRoutes(app, deps) {
  const {
    path,
    syncTournamentRequest,
    exportTournamentReportFile,
    exportPlayerReportFile,
    current,
  } = deps;

app.get('/api/tournaments/:tournamentId/export-report', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  try {
    const filePath = exportTournamentReportFile(current());
    if (!filePath) return res.status(400).json({ ok: false, err: 'tournament not finished' });
    return res.download(filePath, path.basename(filePath));
  } catch (err) {
    return res.status(500).json({ ok: false, err: err.message || 'export failed' });
  }
});

app.get('/api/tournaments/:tournamentId/export-player-report', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const playerName = decodeURIComponent(req.query.playerName || '').trim();
  if (!playerName) return res.status(400).json({ ok: false, err: 'missing playerName' });
  try {
    const filePath = exportPlayerReportFile(playerName, current());
    if (!filePath) return res.status(400).json({ ok: false, err: 'player not finished' });
    return res.download(filePath, path.basename(filePath));
  } catch (err) {
    return res.status(500).json({ ok: false, err: err.message || 'export failed' });
  }
});
}

module.exports = { registerReportsRoutes };
