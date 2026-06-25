function registerSettingsRoutes(app, deps) {
  const {
    syncTournamentRequest,
    buildClientState,
    saveState,
    broadcast,
    getTournamentSettings,
    updateTournamentSettings,
    applyTournamentPreset,
    listTournamentPresets,
  } = deps;

  function lockedSettingsResponse(res) {
    const state = buildClientState();
    const phase = state && state.phase;
    if (phase && phase !== 'setup') {
      res.status(409).json({
        ok: false,
        err: '赛事规则已锁定，请在新建比赛或开赛前设置',
        state,
      });
      return true;
    }
    return false;
  }

  app.get('/api/tournaments/:tournamentId/settings', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    return res.json({ ok: true, settings: getTournamentSettings(), presets: listTournamentPresets() });
  });

  app.put('/api/tournaments/:tournamentId/settings', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    if (lockedSettingsResponse(res)) return;
    try {
      const settings = updateTournamentSettings(req.body?.settings || req.body || {});
      saveState();
      broadcast();
      return res.json({ ok: true, settings, state: buildClientState() });
    } catch (err) {
      return res.status(400).json({ ok: false, err: err.message || 'invalid settings' });
    }
  });

  app.post('/api/tournaments/:tournamentId/settings/preset', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    if (lockedSettingsResponse(res)) return;
    const { presetId, options } = req.body || {};
    try {
      const settings = applyTournamentPreset(presetId, options || {});
      saveState();
      broadcast();
      return res.json({ ok: true, settings, state: buildClientState() });
    } catch (err) {
      return res.status(400).json({ ok: false, err: err.message || 'apply preset failed' });
    }
  });
}

module.exports = { registerSettingsRoutes };
