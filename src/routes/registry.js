function parseStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item || '').trim()).filter(Boolean);
}

function registerRegistryRoutes(app, deps) {
  const {
    syncTournamentRequest,
    buildClientState,
    saveState,
    broadcast,
    listTournamentEntrants,
    createTournamentEntrant,
    updateTournamentEntrant,
    bindTournamentEntrantToGlobalProfile,
    listPlayerProfiles,
    createGlobalPlayerProfile,
    getGlobalPlayerProfileByName,
    updateGlobalPlayerProfile,
    deleteGlobalPlayerProfile,
    bindTournamentPlayerToGlobalProfile,
    listLeagues,
    createLeague,
    getLeagueById,
    updateLeague,
    deleteLeague,
    buildLeagueLeaderboard,
    includeTournamentInLeague,
    removeTournamentFromLeague,
    buildLeagueFinalQualification,
    listPointsProfiles,
    createPointsProfile,
    updatePointsProfile,
    deletePointsProfile,
    calculatePointAwardsForCurrentTournament,
    listPointAwardsForCurrentTournament,
  } = deps;

  app.get('/api/player-profiles', (req, res) => {
    res.json({ ok: true, players: listPlayerProfiles() });
  });

  app.post('/api/player-profiles', (req, res) => {
    const { action, displayName, name, aliases, bindings } = req.body || {};
    if (action !== 'create') return res.status(400).json({ ok: false, err: 'unknown action' });
    try {
      const profile = createGlobalPlayerProfile({
        displayName: displayName || name,
        aliases: parseStringArray(aliases),
        bindings: Array.isArray(bindings) ? bindings : [],
      });
      broadcast();
      return res.json({ ok: true, player: profile, state: buildClientState() });
    } catch (err) {
      return res.status(400).json({ ok: false, err: err.message || 'create player failed' });
    }
  });

  app.patch('/api/player-profiles/:playerId', (req, res) => {
    try {
      const patch = req.body || {};
      const profile = updateGlobalPlayerProfile(req.params.playerId, {
        displayName: patch.displayName || patch.name,
        aliases: parseStringArray(patch.aliases),
      });
      if (!profile) return res.status(404).json({ ok: false, err: 'player profile not found' });
      broadcast();
      return res.json({ ok: true, player: profile, state: buildClientState() });
    } catch (err) {
      return res.status(400).json({ ok: false, err: err.message || 'update player failed' });
    }
  });

  app.delete('/api/player-profiles/:playerId', (req, res) => {
    const result = deleteGlobalPlayerProfile(req.params.playerId);
    if (!result.ok) {
      const status = result.err === 'player profile not found' ? 404 : 400;
      return res.status(status).json(result);
    }
    broadcast();
    return res.json({ ...result, state: buildClientState() });
  });

  app.get('/api/tournaments/:tournamentId/entrants', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    return res.json({ ok: true, entrants: listTournamentEntrants() });
  });

  app.post('/api/tournaments/:tournamentId/entrants', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const { action, displayName, name, entrantType, teamName, teamRoster, profileId } = req.body || {};
    if (action !== 'create' && action !== 'bulk-create') return res.status(400).json({ ok: false, err: 'unknown action' });
    try {
      if (action === 'bulk-create') {
        const createMissingProfiles = (req.body?.createMissingProfiles === true || req.body?.registerProfiles === true)
          && entrantType !== 'team';
        const items = Array.isArray(req.body?.entrants)
          ? req.body.entrants
          : Array.isArray(req.body?.names)
            ? req.body.names.map(item => ({ displayName: item }))
            : [];
        if (!items.length) return res.status(400).json({ ok: false, err: 'missing entrants' });
        const profileActions = [];
        const entrants = items.map(item => {
          const itemType = item.entrantType || entrantType;
          const nameForProfile = String(item.displayName || item.name || '').trim();
          const isPlayer = itemType !== 'team';
          let itemProfileId = item.profileId;
          let profileAction = itemProfileId ? 'explicit' : 'guest';
          if (isPlayer && createMissingProfiles && itemProfileId === undefined && nameForProfile) {
            let profile = typeof getGlobalPlayerProfileByName === 'function'
              ? getGlobalPlayerProfileByName(nameForProfile)
              : null;
            if (profile) {
              profileAction = 'existing';
            } else if (typeof createGlobalPlayerProfile === 'function') {
              profile = createGlobalPlayerProfile({ displayName: nameForProfile });
              profileAction = 'created';
            }
            if (profile?.id) itemProfileId = profile.id;
          }
          const entrant = createTournamentEntrant({
            displayName: item.displayName || item.name,
            entrantType: itemType,
            teamName: item.teamName,
            teamRoster: item.teamRoster,
            profileId: itemProfileId,
            source: 'admin',
          });
          profileActions.push({
            displayName: entrant.displayName || nameForProfile || item.teamName,
            profileId: entrant.profileId || null,
            action: entrant.entryType === 'registered' && profileAction === 'guest' ? 'existing' : profileAction,
          });
          return entrant;
        });
        saveState();
        broadcast();
        return res.json({ ok: true, entrants, profileActions, state: buildClientState() });
      }
      const entrant = createTournamentEntrant({
        displayName: displayName || name,
        entrantType,
        teamName,
        teamRoster,
        profileId,
        source: 'admin',
      });
      saveState();
      broadcast();
      return res.json({ ok: true, entrant, state: buildClientState() });
    } catch (err) {
      return res.status(400).json({ ok: false, err: err.message || 'create entrant failed' });
    }
  });

  app.patch('/api/tournaments/:tournamentId/entrants/:entrantId', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    try {
      const entrant = updateTournamentEntrant(req.params.entrantId, req.body || {});
      if (!entrant) return res.status(404).json({ ok: false, err: 'entrant not found' });
      saveState();
      broadcast();
      return res.json({ ok: true, entrant, state: buildClientState() });
    } catch (err) {
      return res.status(400).json({ ok: false, err: err.message || 'update entrant failed' });
    }
  });

  app.post('/api/tournaments/:tournamentId/entrants/:entrantId/bind-profile', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const { playerId } = req.body || {};
    if (!playerId) return res.status(400).json({ ok: false, err: 'missing playerId' });
    const entrant = bindTournamentEntrantToGlobalProfile(req.params.entrantId, playerId);
    if (!entrant) return res.status(404).json({ ok: false, err: 'entrant or profile not found' });
    saveState();
    broadcast();
    return res.json({ ok: true, entrant, state: buildClientState() });
  });

  app.post('/api/tournaments/:tournamentId/player-bindings', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const { playerName, playerId } = req.body || {};
    if (!playerName || !playerId) {
      return res.status(400).json({ ok: false, err: 'missing playerName/playerId' });
    }
    const bound = bindTournamentPlayerToGlobalProfile(playerName, playerId);
    if (!bound) return res.status(404).json({ ok: false, err: 'player or profile not found' });
    saveState();
    broadcast();
    return res.json({ ok: true, player: bound, state: buildClientState() });
  });

  app.get('/api/leagues', (req, res) => {
    res.json({ ok: true, leagues: listLeagues() });
  });

  app.post('/api/leagues', (req, res) => {
    const {
      action,
      name,
      seasonLabel,
      game,
      divisions,
      regions,
      pointsProfileId,
      tournamentBindings,
      includedTournamentIds,
      finalTournamentIds,
      bestFinishLimit,
    } = req.body || {};
    if (action !== 'create') return res.status(400).json({ ok: false, err: 'unknown action' });
    try {
      const league = createLeague({
        name: String(name || '').trim() || '未命名联赛',
        seasonLabel: String(seasonLabel || '').trim(),
        game: String(game || 'vgc').trim() || 'vgc',
        divisions: parseStringArray(divisions),
        regions: parseStringArray(regions),
        pointsProfileId: pointsProfileId || null,
        tournamentBindings: Array.isArray(tournamentBindings) ? tournamentBindings : [],
        includedTournamentIds: parseStringArray(includedTournamentIds),
        finalTournamentIds: parseStringArray(finalTournamentIds),
        bestFinishLimit: Number.isInteger(Number(bestFinishLimit)) ? Number(bestFinishLimit) : null,
      });
      broadcast();
      return res.json({ ok: true, league, state: buildClientState() });
    } catch (err) {
      return res.status(400).json({ ok: false, err: err.message || 'create league failed' });
    }
  });

  app.get('/api/leagues/:leagueId', (req, res) => {
    const league = getLeagueById(req.params.leagueId);
    if (!league) return res.status(404).json({ ok: false, err: 'league not found' });
    return res.json({ ok: true, league });
  });

  app.patch('/api/leagues/:leagueId', (req, res) => {
    const league = updateLeague(req.params.leagueId, req.body || {});
    if (!league) return res.status(404).json({ ok: false, err: 'league not found' });
    broadcast();
    return res.json({ ok: true, league, state: buildClientState() });
  });

  app.delete('/api/leagues/:leagueId', (req, res) => {
    const result = deleteLeague(req.params.leagueId);
    if (!result.ok) {
      const status = result.err === 'league not found' ? 404 : 400;
      return res.status(status).json(result);
    }
    broadcast();
    return res.json({ ...result, state: buildClientState() });
  });

  app.get('/api/leagues/:leagueId/leaderboard', (req, res) => {
    const leaderboard = buildLeagueLeaderboard(req.params.leagueId);
    if (!leaderboard) return res.status(404).json({ ok: false, err: 'league not found' });
    return res.json({ ok: true, leaderboard });
  });

  app.get('/api/leagues/:leagueId/leaderboard.csv', (req, res) => {
    const league = getLeagueById(req.params.leagueId);
    const leaderboard = buildLeagueLeaderboard(req.params.leagueId);
    if (!league || !leaderboard) return res.status(404).send('league not found');
    const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['rank', 'profileId', 'displayName', 'points'],
      ...leaderboard.map(entry => [entry.rank, entry.profileId, entry.displayName, entry.points]),
    ];
    const csv = rows.map(row => row.map(escapeCsv).join(',')).join('\n');
    const safeName = String(league.name || league.id).replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').trim() || 'league';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}-leaderboard.csv"`);
    return res.send(`\uFEFF${csv}`);
  });

  app.post('/api/leagues/:leagueId/include-tournament', (req, res) => {
    const { tournamentId, pointsProfileId } = req.body || {};
    const league = includeTournamentInLeague(req.params.leagueId, tournamentId, { pointsProfileId });
    if (!league) return res.status(404).json({ ok: false, err: 'league or tournament not found' });
    broadcast();
    return res.json({ ok: true, league, state: buildClientState() });
  });

  app.post('/api/leagues/:leagueId/remove-tournament', (req, res) => {
    const { tournamentId } = req.body || {};
    const league = removeTournamentFromLeague(req.params.leagueId, tournamentId);
    if (!league) return res.status(404).json({ ok: false, err: 'league not found' });
    broadcast();
    return res.json({ ok: true, league, state: buildClientState() });
  });

  app.post('/api/leagues/:leagueId/final-qualification', (req, res) => {
    const count = Number(req.body?.count ?? 8);
    const qualifiers = buildLeagueFinalQualification(req.params.leagueId, Number.isInteger(count) ? count : 8);
    if (!qualifiers) return res.status(404).json({ ok: false, err: 'league not found' });
    return res.json({ ok: true, qualifiers });
  });

  app.get('/api/points-profiles', (req, res) => {
    res.json({ ok: true, pointsProfiles: listPointsProfiles() });
  });

  app.post('/api/points-profiles', (req, res) => {
    const { action, name, participationPoints, placementPoints, eventTierMultiplier, bestFinishLimit } = req.body || {};
    if (action !== 'create') return res.status(400).json({ ok: false, err: 'unknown action' });
    try {
      const profile = createPointsProfile({
        name: String(name || '').trim() || '未命名积分规则',
        participationPoints,
        placementPoints: Array.isArray(placementPoints) ? placementPoints : [],
        eventTierMultiplier,
        bestFinishLimit: Number.isInteger(Number(bestFinishLimit)) ? Number(bestFinishLimit) : null,
      });
      broadcast();
      return res.json({ ok: true, pointsProfile: profile, state: buildClientState() });
    } catch (err) {
      return res.status(400).json({ ok: false, err: err.message || 'create points profile failed' });
    }
  });

  app.patch('/api/points-profiles/:pointsProfileId', (req, res) => {
    try {
      const patch = req.body || {};
      const profile = updatePointsProfile(req.params.pointsProfileId, {
        name: String(patch.name || '').trim() || '未命名积分规则',
        participationPoints: patch.participationPoints,
        placementPoints: Array.isArray(patch.placementPoints) ? patch.placementPoints : [],
        eventTierMultiplier: patch.eventTierMultiplier,
        bestFinishLimit: Number.isInteger(Number(patch.bestFinishLimit)) ? Number(patch.bestFinishLimit) : null,
      });
      if (!profile) return res.status(404).json({ ok: false, err: 'points profile not found' });
      broadcast();
      return res.json({ ok: true, pointsProfile: profile, state: buildClientState() });
    } catch (err) {
      return res.status(400).json({ ok: false, err: err.message || 'update points profile failed' });
    }
  });

  app.delete('/api/points-profiles/:pointsProfileId', (req, res) => {
    const result = deletePointsProfile(req.params.pointsProfileId);
    if (!result.ok) {
      const status = result.err === 'points profile not found' ? 404 : 400;
      return res.status(status).json(result);
    }
    broadcast();
    return res.json({ ...result, state: buildClientState() });
  });

  app.post('/api/tournaments/:tournamentId/calculate-points', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const result = calculatePointAwardsForCurrentTournament(req.body?.pointsProfileId || null);
    if (!result.ok) return res.json({ ...result, state: buildClientState() });
    saveState();
    broadcast();
    return res.json({ ...result, state: buildClientState() });
  });

  app.get('/api/tournaments/:tournamentId/point-awards', (req, res) => {
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    return res.json({ ok: true, awards: listPointAwardsForCurrentTournament() });
  });
}

module.exports = { registerRegistryRoutes };
