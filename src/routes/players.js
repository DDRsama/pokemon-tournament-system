function registerPlayersRoutes(app, deps) {
  const {
    syncTournamentRequest,
    buildClientState,
    buildPlayerView,
    saveState,
    broadcast,
    addPlayer,
    removePlayer,
    ensurePlayerSession,
    dropPlayer,
    dropPlayerFromMatch,
    applyBo3Score,
    applyResult,
    current,
    isLoopbackHost,
    normalizePublicBaseUrlCandidate,
    validatePublicBaseUrlAccess,
  } = deps;

  app.post('/api/tournaments/:tournamentId/players', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const { action, name } = req.body || {};
    if (action === 'add') addPlayer(name);
    else if (action === 'remove') removePlayer(name);
    saveState();
    broadcast();
    res.json({ ok: true, state: buildClientState() });
  });

  app.post('/api/tournaments/:tournamentId/validate-base-url', async (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    let candidate = '';
    try {
      candidate = normalizePublicBaseUrlCandidate(req.body.publicBaseUrlOverride || '');
      if (!candidate) return res.json({ ok: true, publicBaseUrlOverride: '' });
      const parsed = new URL(candidate);
      if (isLoopbackHost(parsed.hostname)) {
        return res.json({ ok: false, err: '不能使用 localhost 或 127.0.0.1 这类自机地址' });
      }
    } catch (err) {
      return res.json({ ok: false, err: err.message || '地址格式不正确' });
    }

    const result = await validatePublicBaseUrlAccess(candidate, req.params.tournamentId);
    if (!result.ok) return res.json({ ok: false, err: result.err || '地址无法访问' });
    res.json({ ok: true, publicBaseUrlOverride: candidate, checkedUrl: result.checkedUrl });
  });

  app.post('/api/tournaments/:tournamentId/config', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    current().publicBaseUrlOverride = (req.body.publicBaseUrlOverride || '').trim();
    current().liveRoomCode = (req.body.liveRoomCode || '').trim();
    if (current().currentLiveMatch) {
      current().currentLiveMatch.liveRoomCode = current().liveRoomCode || null;
    }
    if (current().lastLiveMatch && current().lastLiveMatch.id) {
      current().lastLiveMatch.liveRoomCode = current().liveRoomCode || null;
    }
    current().matches = current().matches.map(match =>
      match.wasLive ? { ...match, liveRoomCode: current().liveRoomCode || null } : match,
    );
    saveState();
    broadcast();
    res.json({ ok: true, state: buildClientState() });
  });

  app.post('/api/tournaments/:tournamentId/player-login', (req, res) => {
    const { playerName, confirmExisting } = req.body || {};
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const name = (playerName || '').trim();
    if (!name) return res.status(400).json({ ok: false, err: 'missing name' });

    const exists = current().players.includes(name);
    if (current().phase === 'setup') {
      if (!exists) {
        addPlayer(name);
        const session = ensurePlayerSession(name);
        saveState();
        broadcast();
        return res.json({ ok: true, created: true, ...session, player: buildPlayerView(name), state: buildClientState() });
      }
      if (confirmExisting) {
        const session = ensurePlayerSession(name);
        return res.json({ ok: true, existing: true, ...session, player: buildPlayerView(name), state: buildClientState() });
      }
      return res.json({ ok: false, code: 'NAME_EXISTS', message: '名称已存在，请确认是否为本人。' });
    }

    if (exists) {
      const session = ensurePlayerSession(name);
      return res.json({ ok: true, existing: true, ...session, player: buildPlayerView(name), state: buildClientState() });
    }

    return res.json({ ok: false, code: 'REGISTRATION_CLOSED', message: '比赛已经开始，报名已结束。' });
  });

  app.post('/api/tournaments/:tournamentId/player-report-win', (req, res) => {
    const { playerName } = req.body || {};
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const name = (playerName || '').trim();
    if (!name) return res.status(400).json({ ok: false, err: 'missing playerName' });
    const match = current().matches.find(m => !m.done && (m.p1 === name || m.p2 === name));
    if (!match) return res.json({ ok: false, err: 'active match not found' });
    current().playerReports = { ...(current().playerReports || {}), [name]: { type: current().phase === 'top8' ? 'game-win' : 'win', at: Date.now(), matchId: match.id } };
    if (current().phase === 'top8') {
      const nextP1Wins = (match.p1Wins || 0) + (match.p1 === name ? 1 : 0);
      const nextP2Wins = (match.p2Wins || 0) + (match.p2 === name ? 1 : 0);
      applyBo3Score(match.id, nextP1Wins, nextP2Wins);
    } else {
      applyResult(match.id, name);
    }
    const other = match.p1 === name ? match.p2 : match.p1;
    if (other && other !== 'BYE') {
      current().playerReports[other] = { type: current().phase === 'top8' ? 'opponent-scored' : 'opponent-reported', at: Date.now(), matchId: match.id };
    }
    saveState();
    broadcast();
    res.json({ ok: true, player: buildPlayerView(name), state: buildClientState() });
  });

  app.post('/api/tournaments/:tournamentId/drop-player', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    dropPlayer(req.body.name);
    saveState();
    broadcast();
    res.json({ ok: true, state: buildClientState() });
  });

  app.post('/api/tournaments/:tournamentId/drop-player-from-match', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const applied = dropPlayerFromMatch(req.body.matchId, req.body.playerName);
    if (!applied) return res.json({ ok: false, err: 'match or player not found' });
    saveState();
    broadcast();
    res.json({ ok: true, state: buildClientState() });
  });
}

module.exports = { registerPlayersRoutes };
