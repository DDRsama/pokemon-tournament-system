const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pts-full-flow-'));
}

function clearAppModuleCache() {
  const appPath = require.resolve('../src/app');
  const configPath = require.resolve('../src/config');
  delete require.cache[appPath];
  delete require.cache[configPath];
}

function byRank(standings, rank) {
  return standings.find(entry => entry.rank === rank);
}

test('3.0 league-bound swiss top cut flow awards points and feeds player profile views', async () => {
  const root = makeTempDir();
  process.env.PTS_DATA_DIR = path.join(root, 'tournaments');
  process.env.PTS_PLAYERS_DIR = path.join(root, 'players');
  process.env.PTS_LEAGUES_DIR = path.join(root, 'leagues');
  process.env.PTS_POINTS_DIR = path.join(root, 'points');
  process.env.PTS_REPORT_DIR = path.join(root, 'reports');
  clearAppModuleCache();

  const { app } = require('../src/app');
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, apiPath, body = null) {
    const response = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    assert.equal(response.status, 200, `${method} ${apiPath}: ${JSON.stringify(payload)}`);
    return payload;
  }

  try {
    const points = await api('POST', '/api/points-profiles', {
      action: 'create',
      name: '3.0 Flow Points',
      participationPoints: 1,
      eventTierMultiplier: 2,
      placementPoints: [
        { rank: 1, points: 10 },
        { rank: 2, points: 6 },
        { rankMin: 3, rankMax: 4, points: 3 },
      ],
    });
    const pointsProfileId = points.pointsProfile.id;
    const bonusPoints = await api('POST', '/api/points-profiles', {
      action: 'create',
      name: '3.0 Alternate Points',
      participationPoints: 0,
      eventTierMultiplier: 1,
      placementPoints: [
        { rank: 1, points: 50 },
      ],
    });
    const bonusPointsProfileId = bonusPoints.pointsProfile.id;

    const league = await api('POST', '/api/leagues', {
      action: 'create',
      name: '3.0 Flow League',
      bestFinishLimit: 2,
    });
    const leagueId = league.league.id;
    const bonusLeague = await api('POST', '/api/leagues', {
      action: 'create',
      name: '3.0 Bonus League',
    });
    const bonusLeagueId = bonusLeague.league.id;
    const pendingTopCutLeague = await api('POST', '/api/leagues', {
      action: 'create',
      name: '3.0 Pending Top Cut League',
    });
    const pendingTopCutLeagueId = pendingTopCutLeague.league.id;

    const created = await api('POST', '/api/tournaments', { action: 'create', name: '3.0 Full Flow' });
    const tournamentId = created.id;
    const preset = await api('POST', `/api/tournaments/${tournamentId}/settings/preset`, {
      presetId: 'vgc_swiss_top_cut',
      options: {
        topCutSize: 8,
        topCutBestOf: 3,
      },
    });
    assert.equal('ranked' in preset.settings, false);
    assert.equal('pointsProfileRef' in preset.settings, false);
    assert.equal(preset.settings.stages[0].swiss.roundPolicy, 'auto_by_entrant_count');
    assert.equal('rounds' in preset.settings.stages[0].swiss, false);
    assert.equal(preset.settings.stages[1].matchRules.bestOf, 3);

    const profiles = {};
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Guest One', 'Guest Two']) {
      const profile = await api('POST', '/api/player-profiles', { action: 'create', displayName: name });
      profiles[name] = profile.player.id;
      await api('POST', `/api/tournaments/${tournamentId}/entrants`, {
        action: 'create',
        displayName: name,
        profileId: name.startsWith('Guest') ? null : profile.player.id,
      });
    }
    const spareProfile = await api('POST', '/api/player-profiles', { action: 'create', displayName: 'Spare Profile' });
    const renamedSpare = await api('PATCH', `/api/player-profiles/${spareProfile.player.id}`, {
      displayName: 'Spare Profile 2',
      aliases: ['Spare'],
    });
    assert.equal(renamedSpare.player.displayName, 'Spare Profile 2');
    assert.deepEqual(renamedSpare.player.aliases.sort(), ['Spare', 'Spare Profile'].sort());
    const removedSpare = await api('DELETE', `/api/player-profiles/${spareProfile.player.id}`);
    assert.equal(removedSpare.ok, true);

    const entrants = await api('GET', `/api/tournaments/${tournamentId}/entrants`);
    assert.equal(entrants.entrants.length, 8);
    assert.equal(entrants.entrants.filter(entry => entry.rankedEligible).length, 6);
    assert.equal(entrants.entrants.filter(entry => entry.entryType === 'guest').length, 2);

    const stageList = await api('GET', `/api/tournaments/${tournamentId}/stages`);
    assert.equal(stageList.stages.map(stage => stage.id).join(','), 'stage_swiss_1,stage_top_cut_1');
    assert.equal(stageList.stages[0].type, 'swiss');
    assert.equal(stageList.stages[1].type, 'single_elimination');

    const started = await api('POST', `/api/tournaments/${tournamentId}/start-swiss`, { rounds: 1 });
    assert.equal(started.ok, true);
    let state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.equal(state.phase, 'swiss');
    assert.equal(state.matches.length, 4);

    for (const match of state.matches.filter(match => match.round === 1)) {
      const result = await api('POST', `/api/tournaments/${tournamentId}/result`, {
        matchId: match.id,
        winnerId: match.p1,
      });
      assert.equal(result.ok, true);
    }

    const completedSwiss = await api('POST', `/api/tournaments/${tournamentId}/end-swiss`);
    assert.equal(completedSwiss.ok, true);
    state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.equal(state.phase, 'swiss-ended');
    assert.equal(state.stageResults.stage_swiss_1.advancers.length, 8);
    assert.equal(byRank(state.stageResults.stage_swiss_1.standings, 1).player, 'Alpha');
    const prematureInclude = await api('POST', `/api/leagues/${pendingTopCutLeagueId}/include-tournament`, { tournamentId, pointsProfileId });
    assert.equal(prematureInclude.ok, true);
    const prematureLeaderboard = await api('GET', `/api/leagues/${pendingTopCutLeagueId}/leaderboard`);
    assert.equal(prematureLeaderboard.ok, true);
    assert.deepEqual(prematureLeaderboard.leaderboard, []);

    const topCut = await api('POST', `/api/tournaments/${tournamentId}/enter-top8`);
    assert.equal(topCut.ok, true);
    state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.equal(state.phase, 'top8');
    assert.equal(state.matches.filter(match => match.phase === 'Quarter Finals').length, 4);

    for (const match of state.matches.filter(match => match.phase === 'Quarter Finals')) {
      const result = await api('POST', `/api/tournaments/${tournamentId}/bo3-score`, {
        matchId: match.id,
        p1Wins: 2,
        p2Wins: 0,
      });
      assert.equal(result.ok, true);
    }
    state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.equal(state.matches.filter(match => match.phase === 'Semi Finals').length, 2);

    for (const match of state.matches.filter(match => match.phase === 'Semi Finals')) {
      const result = await api('POST', `/api/tournaments/${tournamentId}/bo3-score`, {
        matchId: match.id,
        p1Wins: 2,
        p2Wins: 1,
      });
      assert.equal(result.ok, true);
    }
    state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    const final = state.matches.find(match => match.phase === 'Finals');
    const bronze = state.matches.find(match => match.phase === 'Bronze Match');
    assert.ok(final);
    assert.ok(bronze);

    await api('POST', `/api/tournaments/${tournamentId}/bo3-score`, {
      matchId: final.id,
      p1Wins: 2,
      p2Wins: 0,
    });
    await api('POST', `/api/tournaments/${tournamentId}/bo3-score`, {
      matchId: bronze.id,
      p1Wins: 2,
      p2Wins: 1,
    });
    state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.equal(state.phase, 'done');
    assert.equal(state.overlayState, 'podium');
    assert.equal(state.stageResults.stage_top_cut_1.metadata.champion, final.p1);

    const include = await api('POST', `/api/leagues/${leagueId}/include-tournament`, { tournamentId, pointsProfileId });
    assert.equal(include.ok, true);
    assert.deepEqual(include.league.includedTournamentIds, [tournamentId]);
    assert.equal(include.league.tournamentBindings[0].pointsProfileId, pointsProfileId);

    const bonusInclude = await api('POST', `/api/leagues/${bonusLeagueId}/include-tournament`, { tournamentId, pointsProfileId: bonusPointsProfileId });
    assert.equal(bonusInclude.ok, true);
    assert.equal(bonusInclude.league.tournamentBindings[0].pointsProfileId, bonusPointsProfileId);

    const leaderboard = await api('GET', `/api/leagues/${leagueId}/leaderboard`);
    assert.equal(leaderboard.ok, true);
    assert.equal(leaderboard.leaderboard[0].profileId, profiles[final.p1]);
    assert.equal(leaderboard.leaderboard[0].points, 22);
    const bonusLeaderboard = await api('GET', `/api/leagues/${bonusLeagueId}/leaderboard`);
    assert.equal(bonusLeaderboard.leaderboard[0].profileId, profiles[final.p1]);
    assert.equal(bonusLeaderboard.leaderboard[0].points, 50);
    const finishedPendingLeaderboard = await api('GET', `/api/leagues/${pendingTopCutLeagueId}/leaderboard`);
    assert.equal(finishedPendingLeaderboard.leaderboard[0].profileId, profiles[final.p1]);
    assert.equal(finishedPendingLeaderboard.leaderboard[0].points, 22);

    const awards = await api('POST', `/api/tournaments/${tournamentId}/calculate-points`, { pointsProfileId });
    assert.equal(awards.ok, true);
    assert.equal(awards.awards.some(award => award.displayName === 'Guest One'), false);
    assert.equal(awards.awards.some(award => award.displayName === 'Guest Two'), false);
    const championAward = awards.awards.find(award => award.rank === 1);
    assert.equal(championAward.displayName, final.p1);
    assert.equal(championAward.points, 22);

    const summary = await api('GET', `/api/player-profiles/${profiles[final.p1]}/summary`);
    assert.equal(summary.ok, true);
    assert.equal(summary.summary.totalPoints, championAward.points + 50 + 22);
    assert.equal(summary.summary.tournaments[0].tournamentId, tournamentId);

    const playerView = await api('GET', `/api/tournaments/${tournamentId}/player-view/${encodeURIComponent(final.p1)}`);
    assert.equal(playerView.mode, 'final-result');
    assert.equal(playerView.canExportReport, true);
    assert.equal(playerView.record.wins, 1);
    assert.equal(playerView.history.some(item => item.phase === 'Finals'), true);

    const blockedDelete = await fetch(`${baseUrl}/api/player-profiles/${profiles[final.p1]}`, {
      method: 'DELETE',
    });
    const blockedPayload = await blockedDelete.json();
    assert.equal(blockedDelete.status, 400);
    assert.equal(blockedPayload.ok, false);
    assert.equal(blockedPayload.err, 'player profile is in use');
    assert.ok(blockedPayload.references.length > 0);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
    clearAppModuleCache();
  }
});

test('admin-created player entrants auto-bind existing player profiles by name', async () => {
  const root = makeTempDir();
  process.env.PTS_DATA_DIR = path.join(root, 'tournaments');
  process.env.PTS_PLAYERS_DIR = path.join(root, 'players');
  process.env.PTS_LEAGUES_DIR = path.join(root, 'leagues');
  process.env.PTS_POINTS_DIR = path.join(root, 'points');
  process.env.PTS_REPORT_DIR = path.join(root, 'reports');
  clearAppModuleCache();

  const { app } = require('../src/app');
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, apiPath, body = null) {
    const response = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    assert.equal(response.status, 200, `${method} ${apiPath}: ${JSON.stringify(payload)}`);
    return payload;
  }

  try {
    const created = await api('POST', '/api/tournaments', { action: 'create', name: 'Admin Bind Flow' });
    const tournamentId = created.id;
    const profile = await api('POST', '/api/player-profiles', { action: 'create', displayName: 'Registered Admin' });
    const playerId = profile.player.id;

    const cachedBeforeAdd = await api('GET', `/api/player-profiles/${playerId}/summary`);
    assert.deepEqual(cachedBeforeAdd.summary.tournaments, []);

    const added = await api('POST', `/api/tournaments/${tournamentId}/entrants`, {
      action: 'create',
      displayName: 'Registered Admin',
    });
    assert.equal(added.entrant.profileId, playerId);
    assert.equal(added.entrant.entryType, 'registered');
    assert.equal(added.entrant.rankedEligible, true);

    const state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.equal(state.playerProfiles['Registered Admin'].globalProfileId, playerId);

    const summaryAfterAdd = await api('GET', `/api/player-profiles/${playerId}/summary`);
    assert.equal(summaryAfterAdd.summary.tournaments[0].tournamentId, tournamentId);
    assert.equal(summaryAfterAdd.summary.tournaments[0].entrantName, 'Registered Admin');

    const renamed = await api('PATCH', `/api/player-profiles/${playerId}`, {
      displayName: 'Registered Admin 2',
    });
    assert.equal(renamed.player.displayName, 'Registered Admin 2');
    assert.equal(renamed.player.aliases.includes('Registered Admin'), true);

    const renamedState = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.equal(renamedState.players.includes('Registered Admin'), false);
    assert.equal(renamedState.players.includes('Registered Admin 2'), true);
    assert.equal(renamedState.entrants.find(entry => entry.profileId === playerId).displayName, 'Registered Admin 2');
    assert.equal(renamedState.playerProfiles['Registered Admin'], undefined);
    assert.equal(renamedState.playerProfiles['Registered Admin 2'].globalProfileId, playerId);

    const summaryAfterRename = await api('GET', `/api/player-profiles/${playerId}/summary`);
    assert.equal(summaryAfterRename.summary.tournaments[0].entrantName, 'Registered Admin 2');
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
    clearAppModuleCache();
  }
});

test('player center registration can use a tournament entry name without renaming profile-bound history', async () => {
  const root = makeTempDir();
  process.env.PTS_DATA_DIR = path.join(root, 'tournaments');
  process.env.PTS_PLAYERS_DIR = path.join(root, 'players');
  process.env.PTS_LEAGUES_DIR = path.join(root, 'leagues');
  process.env.PTS_POINTS_DIR = path.join(root, 'points');
  process.env.PTS_REPORT_DIR = path.join(root, 'reports');
  clearAppModuleCache();

  const { app } = require('../src/app');
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, apiPath, body = null) {
    const response = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    assert.equal(response.status, 200, `${method} ${apiPath}: ${JSON.stringify(payload)}`);
    return payload;
  }

  try {
    const created = await api('POST', '/api/tournaments', { action: 'create', name: 'Custom Entry Name Flow' });
    const tournamentId = created.id;
    const profile = await api('POST', '/api/player-profiles', { action: 'create', displayName: 'Profile Main' });
    const playerId = profile.player.id;

    const login = await api('POST', `/api/tournaments/${tournamentId}/player-login`, {
      playerName: 'Funny Match ID',
      entrantName: 'Funny Match ID',
      profileName: 'Profile Main',
      profileId: playerId,
    });
    assert.equal(login.ok, true);
    assert.equal(login.registeredProfile, true);
    assert.equal(login.player.playerName, 'Funny Match ID');
    assert.equal(login.player.globalProfileId, playerId);

    const state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    const entrant = state.entrants.find(entry => entry.profileId === playerId);
    assert.equal(entrant.displayName, 'Funny Match ID');
    assert.equal(entrant.displayNameSource, 'custom');
    assert.equal(state.playerProfiles['Funny Match ID'].globalProfileId, playerId);
    assert.equal(state.playerProfiles['Funny Match ID'].displayNameSource, 'custom');

    const summary = await api('GET', `/api/player-profiles/${playerId}/summary`);
    assert.equal(summary.summary.tournaments[0].entrantName, 'Funny Match ID');

    await api('PATCH', `/api/player-profiles/${playerId}`, {
      displayName: 'Profile Main 2',
    });

    const renamedState = await api('GET', `/api/tournaments/${tournamentId}/state`);
    const renamedEntrant = renamedState.entrants.find(entry => entry.profileId === playerId);
    assert.equal(renamedEntrant.displayName, 'Funny Match ID');
    assert.equal(renamedEntrant.displayNameSource, 'custom');
    assert.equal(renamedState.players.includes('Funny Match ID'), true);
    assert.equal(renamedState.players.includes('Profile Main 2'), false);
    assert.equal(renamedState.playerProfiles['Funny Match ID'].globalProfileId, playerId);
    assert.equal(renamedState.playerProfiles['Funny Match ID'].displayNameSource, 'custom');

    const summaryAfterRename = await api('GET', `/api/player-profiles/${playerId}/summary`);
    assert.equal(summaryAfterRename.summary.profile.displayName, 'Profile Main 2');
    assert.equal(summaryAfterRename.summary.tournaments[0].entrantName, 'Funny Match ID');
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
    clearAppModuleCache();
  }
});

test('swiss-only tournament finishes after swiss and can export report', async () => {
  const root = makeTempDir();
  process.env.PTS_DATA_DIR = path.join(root, 'tournaments');
  process.env.PTS_PLAYERS_DIR = path.join(root, 'players');
  process.env.PTS_LEAGUES_DIR = path.join(root, 'leagues');
  process.env.PTS_POINTS_DIR = path.join(root, 'points');
  process.env.PTS_REPORT_DIR = path.join(root, 'reports');
  clearAppModuleCache();

  const { app } = require('../src/app');
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, apiPath, body = null) {
    const response = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    assert.equal(response.status, 200, `${method} ${apiPath}: ${JSON.stringify(payload)}`);
    return payload;
  }

  try {
    const created = await api('POST', '/api/tournaments', {
      action: 'create',
      name: 'Swiss Only Flow',
      settings: {
        presetId: 'custom_structure',
        entrantType: 'player',
        stages: [
          {
            id: 'stage_swiss_1',
            role: 'qualification',
            type: 'swiss',
            name: '资格赛：瑞士轮',
            entrySource: { type: 'all_entrants' },
            matchRules: { bestOf: 1, allowDraw: true, scoreMode: 'match' },
            swiss: { roundPolicy: 'auto_by_entrant_count', pairingMethod: 'swiss', byePolicy: 'avoid_repeat' },
            advancement: { mode: 'none', count: 0, targetStageId: null },
          },
        ],
      },
    });
    const tournamentId = created.id;

    let playerAId = '';
    for (const displayName of ['A', 'B', 'C', 'D']) {
      const profile = await api('POST', '/api/player-profiles', { action: 'create', displayName });
      if (displayName === 'A') playerAId = profile.player.id;
      const added = await api('POST', `/api/tournaments/${tournamentId}/entrants`, {
        action: 'create',
        displayName,
      });
      assert.equal(added.ok, true);
    }

    const started = await api('POST', `/api/tournaments/${tournamentId}/start-swiss`, { rounds: 1 });
    assert.equal(started.ok, true);
    let state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.equal(state.phase, 'swiss');

    for (const match of state.matches.filter(match => match.round === 1)) {
      const result = await api('POST', `/api/tournaments/${tournamentId}/result`, {
        matchId: match.id,
        winnerId: match.p1,
      });
      assert.equal(result.ok, true);
    }

    const ended = await api('POST', `/api/tournaments/${tournamentId}/end-swiss`);
    assert.equal(ended.ok, true);
    state = ended.state;
    assert.equal(state.phase, 'done');
    assert.equal(state.overlayState, 'swiss-ended');
    assert.equal(state.pendingTop8, null);
    assert.equal(state.stageResults.stage_swiss_1.advancers.length, 0);
    assert.equal(state.stageResults.stage_swiss_1.metadata.advancementMode, 'none');
    assert.equal(state.stageResults.stage_swiss_1.standings.length, 4);

    const list = await api('GET', '/api/tournaments');
    assert.equal(list.find(item => item.id === tournamentId).phase, 'done');

    const reloaded = await api('POST', '/api/tournaments', {
      action: 'load',
      id: tournamentId,
    });
    assert.equal(reloaded.ok, true);
    assert.equal(reloaded.state.phase, 'done');
    assert.equal(reloaded.state.overlayState, 'swiss-ended');

    const playerSummary = await api('GET', `/api/player-profiles/${playerAId}/summary`);
    const summaryTournament = playerSummary.summary.tournaments.find(item => item.tournamentId === tournamentId);
    assert.equal(summaryTournament.phase, 'done');
    assert.equal(summaryTournament.rank, 1);

    const reportResponse = await fetch(`${baseUrl}/api/tournaments/${tournamentId}/export-report`);
    assert.equal(reportResponse.status, 200);
    assert.match(reportResponse.headers.get('content-type') || '', /pdf|octet-stream/);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
    clearAppModuleCache();
  }
});

test('BO5 top cut score route waits for three wins', async () => {
  const root = makeTempDir();
  process.env.PTS_DATA_DIR = path.join(root, 'tournaments');
  process.env.PTS_PLAYERS_DIR = path.join(root, 'players');
  process.env.PTS_LEAGUES_DIR = path.join(root, 'leagues');
  process.env.PTS_POINTS_DIR = path.join(root, 'points');
  process.env.PTS_REPORT_DIR = path.join(root, 'reports');
  clearAppModuleCache();

  const { app } = require('../src/app');
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, apiPath, body = null) {
    const response = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    assert.equal(response.status, 200, `${method} ${apiPath}: ${JSON.stringify(payload)}`);
    return payload;
  }

  try {
    const created = await api('POST', '/api/tournaments', {
      action: 'create',
      name: 'BO5 Route Flow',
      settings: {
        presetId: 'custom_structure',
        entrantType: 'player',
        stages: [
          {
            id: 'stage_top_cut_1',
            role: 'finals',
            type: 'single_elimination',
            name: 'BO5 淘汰赛',
            entrySource: { type: 'all_entrants' },
            matchRules: { bestOf: 5, allowDraw: false, scoreMode: 'games' },
            elimination: { bracketSize: 4, bronzeMatch: true },
          },
        ],
      },
    });
    const tournamentId = created.id;
    for (const displayName of ['A', 'B', 'C', 'D']) {
      const added = await api('POST', `/api/tournaments/${tournamentId}/entrants`, {
        action: 'create',
        displayName,
      });
      assert.equal(added.ok, true);
    }

    const started = await api('POST', `/api/tournaments/${tournamentId}/stages/stage_top_cut_1/start`);
    assert.equal(started.ok, true);
    let state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    const semi = state.matches.find(match => match.phase === 'Semi Finals');
    assert.ok(semi);

    const partial = await api('POST', `/api/tournaments/${tournamentId}/bo3-score`, {
      matchId: semi.id,
      p1Wins: 2,
      p2Wins: 0,
    });
    assert.equal(partial.ok, true);
    state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    const partialMatch = state.matches.find(match => match.id === semi.id);
    assert.equal(partialMatch.done, false);
    assert.equal(partialMatch.winner, null);
    assert.equal(state.matches.some(match => match.phase === 'Finals'), false);

    const finished = await api('POST', `/api/tournaments/${tournamentId}/bo3-score`, {
      matchId: semi.id,
      p1Wins: 3,
      p2Wins: 1,
    });
    assert.equal(finished.ok, true);
    state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    const finishedMatch = state.matches.find(match => match.id === semi.id);
    assert.equal(finishedMatch.done, true);
    assert.equal(finishedMatch.winner, semi.p1);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
    clearAppModuleCache();
  }
});

test('live table setup waits in pending state before switching overlay to live view', async () => {
  const root = makeTempDir();
  process.env.PTS_DATA_DIR = path.join(root, 'tournaments');
  process.env.PTS_PLAYERS_DIR = path.join(root, 'players');
  process.env.PTS_LEAGUES_DIR = path.join(root, 'leagues');
  process.env.PTS_POINTS_DIR = path.join(root, 'points');
  process.env.PTS_REPORT_DIR = path.join(root, 'reports');
  clearAppModuleCache();

  const { app } = require('../src/app');
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, apiPath, body = null) {
    const response = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    assert.equal(response.status, 200, `${method} ${apiPath}: ${JSON.stringify(payload)}`);
    return payload;
  }

  try {
    const created = await api('POST', '/api/tournaments', { action: 'create', name: 'Live Buffer Flow' });
    const tournamentId = created.id;
    for (const displayName of ['A', 'B', 'C', 'D']) {
      const added = await api('POST', `/api/tournaments/${tournamentId}/entrants`, {
        action: 'create',
        displayName,
      });
      assert.equal(added.ok, true);
    }
    await api('POST', `/api/tournaments/${tournamentId}/config`, { liveRoomCode: 'ROOM42' });
    await api('POST', `/api/tournaments/${tournamentId}/start-swiss`, { rounds: 1 });
    let state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    const match = state.matches.find(item => item.round === 1 && (item.p1 === 'A' || item.p2 === 'A')) || state.matches[0];
    assert.ok(match);

    const pending = await api('POST', `/api/tournaments/${tournamentId}/set-live`, { matchId: match.id });
    assert.equal(pending.state.overlayState, 'overview');
    assert.equal(pending.state.currentLiveMatch, null);
    assert.equal(pending.state.pendingLiveMatch.id, match.id);
    assert.equal(pending.state.matches.find(item => item.id === match.id).liveRoomCode, 'ROOM42');

    const playerView = await api('GET', `/api/tournaments/${tournamentId}/player-view/${encodeURIComponent(match.p1)}`);
    assert.equal(playerView.liveRoomCode, 'ROOM42');
    assert.equal(playerView.activeMatch.isLiveTable, false);

    const live = await api('POST', `/api/tournaments/${tournamentId}/start-live`, { matchId: match.id });
    assert.equal(live.state.pendingLiveMatch, null);
    assert.equal(live.state.currentLiveMatch.id, match.id);
    assert.equal(live.state.overlayState, 'live');
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
    clearAppModuleCache();
  }
});
