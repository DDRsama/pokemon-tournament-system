const { isMatchReady, applySharedLiveRoomCodeToTopCut } = require('../core/matches');
const { usesGameScore } = require('../core/rules');

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
    getGlobalPlayerProfileById,
    getGlobalPlayerProfileByName,
    createGlobalPlayerProfile,
    bindTournamentPlayerToGlobalProfile,
    dropPlayer,
    dropPlayerFromMatch,
    applyBo3Score,
    applyResult,
    current,
    isLoopbackHost,
    normalizePublicBaseUrlCandidate,
    validatePublicBaseUrlAccess,
    getMatchStage,
  } = deps;

  const profileMatchesName = (profile, name) => (
    !!profile
    && !!name
    && (
      profile.displayName === name
      || (Array.isArray(profile.aliases) && profile.aliases.includes(name))
    )
  );

  function isGameScoreMatch(match) {
    const stage = typeof getMatchStage === 'function' ? getMatchStage(match) : null;
    const rules = stage && stage.matchRules ? stage.matchRules : {};
    return usesGameScore(rules, stage);
  }

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
    if (current().pendingLiveMatch && current().pendingLiveMatch.id) {
      current().pendingLiveMatch.liveRoomCode = current().liveRoomCode || null;
    }
    if (current().currentLiveMatch) {
      current().currentLiveMatch.liveRoomCode = current().liveRoomCode || null;
    }
    if (current().lastLiveMatch && current().lastLiveMatch.id) {
      current().lastLiveMatch.liveRoomCode = current().liveRoomCode || null;
    }
    const sharedTopCutMatches = applySharedLiveRoomCodeToTopCut(current());
    current().matches = current().matches.map(match =>
      match.wasLive || sharedTopCutMatches.some(item => item.id === match.id)
        ? { ...match, liveRoomCode: current().liveRoomCode || null }
        : match,
    );
    saveState();
    broadcast();
    res.json({ ok: true, state: buildClientState() });
  });

  app.post('/api/tournaments/:tournamentId/player-login', (req, res) => {
    const { playerName, entrantName, profileName, profileId, confirmExisting, registerProfile, continueAsGuest } = req.body || {};
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const name = (entrantName || playerName || '').trim();
    if (!name) return res.status(400).json({ ok: false, err: 'missing name' });
    const profileLookupName = String(profileName || playerName || name || '').trim();
    const requestedProfileId = String(profileId || '').trim();
    const requestedProfile = requestedProfileId && typeof getGlobalPlayerProfileById === 'function'
      ? getGlobalPlayerProfileById(requestedProfileId)
      : null;
    if (requestedProfileId && !requestedProfile) {
      return res.json({
        ok: false,
        code: 'PROFILE_ID_NOT_FOUND',
        message: '选手档案不存在或已被删除，请返回选手中心重新选择。',
      });
    }
    const requestedProfileMatchesName = requestedProfile
      && (
        profileMatchesName(requestedProfile, profileLookupName)
        || (!profileName && !playerName)
      );
    const getEntryDisplayNameSource = profile => (
      profile && name === profile.displayName ? 'profile' : 'custom'
    );

    const buildLoginResponse = (flags = {}) => {
      const session = ensurePlayerSession(name);
      return { ok: true, ...flags, ...session, player: buildPlayerView(name), state: buildClientState() };
    };

    const exists = current().players.includes(name);
    if (current().phase === 'setup') {
      if (!exists) {
        let globalProfile = requestedProfileMatchesName ? requestedProfile : (typeof getGlobalPlayerProfileByName === 'function'
          ? getGlobalPlayerProfileByName(profileLookupName || name)
          : null);
        if (!globalProfile && !registerProfile && !continueAsGuest) {
          return res.json({
            ok: false,
            code: 'PROFILE_NOT_FOUND',
            message: '未找到这个名字的选手档案。你可以登记为长期档案，也可以临时参赛；临时参赛不会获得联赛积分。',
          });
        }
        if (!globalProfile && registerProfile && typeof createGlobalPlayerProfile === 'function') {
          globalProfile = createGlobalPlayerProfile({ displayName: profileLookupName || name });
        }
        addPlayer(name);
        if (globalProfile && typeof bindTournamentPlayerToGlobalProfile === 'function') {
          bindTournamentPlayerToGlobalProfile(name, globalProfile.id, {
            displayNameSource: getEntryDisplayNameSource(globalProfile),
          });
        }
        saveState();
        broadcast();
        return res.json(buildLoginResponse({
          created: true,
          registeredProfile: !!globalProfile,
          guest: !globalProfile,
        }));
      }
      if (requestedProfileMatchesName) {
        const currentProfile = current().playerProfiles && current().playerProfiles[name]
          ? current().playerProfiles[name]
          : null;
        if (!currentProfile?.globalProfileId || currentProfile.globalProfileId === requestedProfile.id) {
          if (typeof bindTournamentPlayerToGlobalProfile === 'function') {
            bindTournamentPlayerToGlobalProfile(name, requestedProfile.id, {
              displayNameSource: getEntryDisplayNameSource(requestedProfile),
            });
            saveState();
            broadcast();
          }
          return res.json(buildLoginResponse({ existing: true, registeredProfile: true, guest: false }));
        }
      }
      if (confirmExisting) {
        return res.json(buildLoginResponse({ existing: true }));
      }
      return res.json({ ok: false, code: 'NAME_EXISTS', message: '名称已存在，请确认是否为本人。' });
    }

    if (exists) {
      return res.json(buildLoginResponse({ existing: true }));
    }

    return res.json({ ok: false, code: 'REGISTRATION_CLOSED', message: '比赛已经开始，报名已结束。' });
  });

  app.post('/api/tournaments/:tournamentId/player-upgrade-profile', (req, res) => {
    const { playerName, confirmCreate, confirmBind } = req.body || {};
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const name = (playerName || '').trim();
    if (!name) return res.status(400).json({ ok: false, err: 'missing playerName' });
    if (!current().players.includes(name)) {
      return res.status(404).json({ ok: false, err: 'player not found' });
    }
    const currentProfile = current().playerProfiles && current().playerProfiles[name]
      ? current().playerProfiles[name]
      : null;
    if (currentProfile?.globalProfileId) {
      return res.json({
        ok: true,
        alreadyBound: true,
        player: buildPlayerView(name),
        state: buildClientState(),
      });
    }
    const existingGlobalProfile = typeof getGlobalPlayerProfileByName === 'function'
      ? getGlobalPlayerProfileByName(name)
      : null;
    if (existingGlobalProfile && !confirmBind) {
      return res.json({
        ok: false,
        code: 'PROFILE_EXISTS',
        profile: {
          id: existingGlobalProfile.id,
          displayName: existingGlobalProfile.displayName,
        },
        message: `后台已有「${existingGlobalProfile.displayName || name}」的选手档案。`,
      });
    }
    let globalProfile = existingGlobalProfile;
    if (!globalProfile) {
      if (!confirmCreate) {
        return res.json({
          ok: false,
          code: 'CONFIRM_CREATE_PROFILE',
          message: `将为「${name}」登记长期选手档案。`,
        });
      }
      if (typeof createGlobalPlayerProfile !== 'function') {
        return res.status(500).json({ ok: false, err: 'profile registry unavailable' });
      }
      globalProfile = createGlobalPlayerProfile({ displayName: name });
    }
    if (!globalProfile || typeof bindTournamentPlayerToGlobalProfile !== 'function') {
      return res.status(500).json({ ok: false, err: 'profile binding unavailable' });
    }
    const bound = bindTournamentPlayerToGlobalProfile(name, globalProfile.id, {
      displayNameSource: name === globalProfile.displayName ? 'profile' : 'custom',
    });
    if (!bound) return res.status(404).json({ ok: false, err: 'player or profile not found' });
    saveState();
    broadcast();
    return res.json({
      ok: true,
      registeredProfile: !existingGlobalProfile,
      boundProfile: !!existingGlobalProfile,
      profile: {
        id: globalProfile.id,
        displayName: globalProfile.displayName,
      },
      player: buildPlayerView(name),
      state: buildClientState(),
    });
  });

  app.post('/api/tournaments/:tournamentId/player-report-win', (req, res) => {
    const { playerName } = req.body || {};
    const ok = syncTournamentRequest(req.params.tournamentId);
    if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
    const name = (playerName || '').trim();
    if (!name) return res.status(400).json({ ok: false, err: 'missing playerName' });
    const playerMatches = current().matches.filter(m => !m.done && (m.p1 === name || m.p2 === name));
    const match = playerMatches.find(isMatchReady) || playerMatches[0] || null;
    if (!match) return res.json({ ok: false, err: 'active match not found' });
    if (!isMatchReady(match)) return res.json({ ok: false, err: '对局尚未就绪，请等待对手确认。' });
    const usesGameScore = isGameScoreMatch(match);
    let applied = false;
    if (usesGameScore) {
      const nextP1Wins = (match.p1Wins || 0) + (match.p1 === name ? 1 : 0);
      const nextP2Wins = (match.p2Wins || 0) + (match.p2 === name ? 1 : 0);
      applied = applyBo3Score(match.id, nextP1Wins, nextP2Wins);
    } else {
      applied = applyResult(match.id, name);
    }
    if (!applied) return res.json({ ok: false, err: '对局尚未就绪，请等待对手确认。' });
    current().playerReports = { ...(current().playerReports || {}), [name]: { type: usesGameScore ? 'game-win' : 'win', at: Date.now(), matchId: match.id } };
    const other = match.p1 === name ? match.p2 : match.p1;
    if (other && other !== 'BYE') {
      current().playerReports[other] = { type: usesGameScore ? 'opponent-scored' : 'opponent-reported', at: Date.now(), matchId: match.id };
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
