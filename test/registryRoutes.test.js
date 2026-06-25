const test = require('node:test');
const assert = require('node:assert/strict');

const { registerRegistryRoutes } = require('../src/routes/registry');

function makeApp() {
  const routes = { get: new Map(), post: new Map(), patch: new Map(), delete: new Map() };
  return {
    routes,
    get(path, handler) {
      routes.get.set(path, handler);
    },
    post(path, handler) {
      routes.post.set(path, handler);
    },
    patch(path, handler) {
      routes.patch.set(path, handler);
    },
    delete(path, handler) {
      routes.delete.set(path, handler);
    },
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('registry routes expose create and list endpoints', () => {
  const calls = [];
  const app = makeApp();
  registerRegistryRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => ({ ok: true }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    listTournamentEntrants: () => [{ id: 'entry_a', displayName: 'A' }],
    createTournamentEntrant: input => ({ id: 'entry_b', displayName: input.displayName || input.teamName }),
    updateTournamentEntrant: (id, patch) => ({ id, ...patch }),
    bindTournamentEntrantToGlobalProfile: () => ({ id: 'entry_a', displayName: 'A' }),
    listPlayerProfiles: () => [{ id: 'pl_a', displayName: 'A' }],
    createGlobalPlayerProfile: input => ({ id: 'pl_a', displayName: input.displayName }),
    updateGlobalPlayerProfile: (id, patch) => ({ id, displayName: patch.displayName, aliases: patch.aliases }),
    deleteGlobalPlayerProfile: id => ({ ok: true, player: { id } }),
    bindTournamentPlayerToGlobalProfile: () => ({ playerId: 'bound' }),
    listLeagues: () => [{ id: 'league_a', name: 'League A' }],
    createLeague: input => ({ id: 'league_a', name: input.name }),
    getLeagueById: id => ({ id, name: 'League A' }),
    updateLeague: (id, patch) => ({ id, ...patch }),
    deleteLeague: id => ({ ok: true, league: { id } }),
    buildLeagueLeaderboard: () => [{ rank: 1, profileId: 'pl_a', displayName: 'A', points: 10 }],
    includeTournamentInLeague: (leagueId, tournamentId, options) => ({ id: leagueId, includedTournamentIds: [tournamentId], tournamentBindings: [{ tournamentId, pointsProfileId: options?.pointsProfileId || 'points_a' }] }),
    removeTournamentFromLeague: (leagueId, tournamentId) => ({ id: leagueId, includedTournamentIds: [], tournamentBindings: [], removed: tournamentId }),
    buildLeagueFinalQualification: () => [{ rank: 1, profileId: 'pl_a', displayName: 'A', points: 10 }],
    listPointsProfiles: () => [{ id: 'points_a', name: 'Points A' }],
    createPointsProfile: input => ({ id: 'points_a', name: input.name }),
    updatePointsProfile: (id, patch) => ({ id, ...patch }),
    deletePointsProfile: id => ({ ok: true, pointsProfile: { id } }),
    calculatePointAwardsForCurrentTournament: () => ({ ok: true, awards: [{ profileId: 'pl_a' }] }),
    listPointAwardsForCurrentTournament: () => [{ profileId: 'pl_a' }],
  });

  assert.equal(typeof app.routes.get.get('/api/player-profiles'), 'function');
  assert.equal(typeof app.routes.post.get('/api/player-profiles'), 'function');
  assert.equal(typeof app.routes.patch.get('/api/player-profiles/:playerId'), 'function');
  assert.equal(typeof app.routes.delete.get('/api/player-profiles/:playerId'), 'function');
  assert.equal(typeof app.routes.get.get('/api/tournaments/:tournamentId/entrants'), 'function');
  assert.equal(typeof app.routes.post.get('/api/tournaments/:tournamentId/entrants'), 'function');
  assert.equal(typeof app.routes.patch.get('/api/tournaments/:tournamentId/entrants/:entrantId'), 'function');
  assert.equal(typeof app.routes.post.get('/api/tournaments/:tournamentId/entrants/:entrantId/bind-profile'), 'function');
  assert.equal(typeof app.routes.post.get('/api/tournaments/:tournamentId/player-bindings'), 'function');
  assert.equal(typeof app.routes.get.get('/api/leagues'), 'function');
  assert.equal(typeof app.routes.get.get('/api/leagues/:leagueId'), 'function');
  assert.equal(typeof app.routes.patch.get('/api/leagues/:leagueId'), 'function');
  assert.equal(typeof app.routes.delete.get('/api/leagues/:leagueId'), 'function');
  assert.equal(typeof app.routes.get.get('/api/leagues/:leagueId/leaderboard'), 'function');
  assert.equal(typeof app.routes.get.get('/api/leagues/:leagueId/leaderboard.csv'), 'function');
  assert.equal(typeof app.routes.post.get('/api/leagues/:leagueId/include-tournament'), 'function');
  assert.equal(typeof app.routes.post.get('/api/leagues/:leagueId/remove-tournament'), 'function');
  assert.equal(typeof app.routes.post.get('/api/leagues/:leagueId/final-qualification'), 'function');
  assert.equal(typeof app.routes.post.get('/api/points-profiles'), 'function');
  assert.equal(typeof app.routes.patch.get('/api/points-profiles/:pointsProfileId'), 'function');
  assert.equal(typeof app.routes.delete.get('/api/points-profiles/:pointsProfileId'), 'function');
  assert.equal(typeof app.routes.post.get('/api/tournaments/:tournamentId/calculate-points'), 'function');
  assert.equal(typeof app.routes.get.get('/api/tournaments/:tournamentId/point-awards'), 'function');

  const listRes = makeRes();
  app.routes.get.get('/api/player-profiles')({} , listRes);
  assert.equal(listRes.body.ok, true);
  assert.equal(listRes.body.players[0].id, 'pl_a');

  const createRes = makeRes();
  app.routes.post.get('/api/player-profiles')({ body: { action: 'create', displayName: 'B' } }, createRes);
  assert.equal(createRes.body.ok, true);
  assert.equal(calls.includes('broadcast'), true);

  const updateProfileRes = makeRes();
  app.routes.patch.get('/api/player-profiles/:playerId')({
    params: { playerId: 'pl_a' },
    body: { displayName: 'A2', aliases: ['Alpha', ''] },
  }, updateProfileRes);
  assert.equal(updateProfileRes.body.ok, true);
  assert.equal(updateProfileRes.body.player.displayName, 'A2');
  assert.deepEqual(updateProfileRes.body.player.aliases, ['Alpha']);

  const deleteProfileRes = makeRes();
  app.routes.delete.get('/api/player-profiles/:playerId')({ params: { playerId: 'pl_a' } }, deleteProfileRes);
  assert.equal(deleteProfileRes.body.ok, true);

  const entrantListRes = makeRes();
  app.routes.get.get('/api/tournaments/:tournamentId/entrants')({ params: { tournamentId: 't1' } }, entrantListRes);
  assert.equal(entrantListRes.body.ok, true);
  assert.equal(entrantListRes.body.entrants[0].id, 'entry_a');

  const bulkEntrantRes = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/entrants')({
    params: { tournamentId: 't1' },
    body: { action: 'bulk-create', entrants: [{ displayName: 'B' }, { displayName: 'C' }] },
  }, bulkEntrantRes);
  assert.equal(bulkEntrantRes.body.ok, true);
  assert.equal(bulkEntrantRes.body.entrants.length, 2);
  assert.equal(bulkEntrantRes.body.entrants[0].displayName, 'B');

  const entrantPatchRes = makeRes();
  app.routes.patch.get('/api/tournaments/:tournamentId/entrants/:entrantId')({ params: { tournamentId: 't1', entrantId: 'entry_a' }, body: { displayName: 'A2' } }, entrantPatchRes);
  assert.equal(entrantPatchRes.body.ok, true);
  assert.equal(entrantPatchRes.body.entrant.displayName, 'A2');

  const leagueRes = makeRes();
  app.routes.get.get('/api/leagues/:leagueId')({ params: { leagueId: 'league_a' } }, leagueRes);
  assert.equal(leagueRes.body.ok, true);
  assert.equal(leagueRes.body.league.id, 'league_a');

  const removeLeagueTournamentRes = makeRes();
  app.routes.post.get('/api/leagues/:leagueId/remove-tournament')({ params: { leagueId: 'league_a' }, body: { tournamentId: 't1' } }, removeLeagueTournamentRes);
  assert.equal(removeLeagueTournamentRes.body.ok, true);
  assert.deepEqual(removeLeagueTournamentRes.body.league.includedTournamentIds, []);
  assert.deepEqual(removeLeagueTournamentRes.body.league.tournamentBindings, []);

  const includeLeagueTournamentRes = makeRes();
  app.routes.post.get('/api/leagues/:leagueId/include-tournament')({ params: { leagueId: 'league_a' }, body: { tournamentId: 't1', pointsProfileId: 'points_a' } }, includeLeagueTournamentRes);
  assert.equal(includeLeagueTournamentRes.body.ok, true);
  assert.equal(includeLeagueTournamentRes.body.league.tournamentBindings[0].pointsProfileId, 'points_a');

  const deleteLeagueRes = makeRes();
  app.routes.delete.get('/api/leagues/:leagueId')({ params: { leagueId: 'league_a' } }, deleteLeagueRes);
  assert.equal(deleteLeagueRes.body.ok, true);

  const csvRes = makeRes();
  app.routes.get.get('/api/leagues/:leagueId/leaderboard.csv')({ params: { leagueId: 'league_a' } }, csvRes);
  assert.match(csvRes.body, /displayName/);
  assert.match(csvRes.headers['Content-Type'], /text\/csv/);

  const calcRes = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/calculate-points')({ params: { tournamentId: 't1' }, body: {} }, calcRes);
  assert.equal(calcRes.body.ok, true);
});

test('bulk create keeps unmatched entrants temporary unless profile creation is requested', () => {
  const calls = [];
  const app = makeApp();
  registerRegistryRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => ({ ok: true }),
    saveState: () => {},
    broadcast: () => {},
    listTournamentEntrants: () => [],
    createTournamentEntrant: input => ({
      id: `entry_${input.displayName || input.teamName}`,
      displayName: input.displayName || input.teamName,
      profileId: input.profileId || null,
      entryType: input.profileId ? 'registered' : 'guest',
    }),
    updateTournamentEntrant: () => null,
    bindTournamentEntrantToGlobalProfile: () => null,
    listPlayerProfiles: () => [],
    getGlobalPlayerProfileByName: name => (name === 'Existing' ? { id: 'pl_existing', displayName: name } : null),
    createGlobalPlayerProfile: input => {
      calls.push(input.displayName);
      return { id: `pl_${input.displayName}`, displayName: input.displayName };
    },
    updateGlobalPlayerProfile: () => null,
    deleteGlobalPlayerProfile: id => ({ ok: true, player: { id } }),
    bindTournamentPlayerToGlobalProfile: () => null,
    listLeagues: () => [],
    createLeague: () => null,
    getLeagueById: () => null,
    updateLeague: () => null,
    deleteLeague: id => ({ ok: true, league: { id } }),
    buildLeagueLeaderboard: () => null,
    includeTournamentInLeague: () => null,
    removeTournamentFromLeague: () => null,
    buildLeagueFinalQualification: () => null,
    listPointsProfiles: () => [],
    createPointsProfile: () => null,
    updatePointsProfile: () => null,
    deletePointsProfile: id => ({ ok: true, pointsProfile: { id } }),
    calculatePointAwardsForCurrentTournament: () => ({ ok: true, awards: [] }),
    listPointAwardsForCurrentTournament: () => [],
  });

  const defaultRes = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/entrants')({
    params: { tournamentId: 't1' },
    body: { action: 'bulk-create', entrantType: 'player', entrants: [{ displayName: 'Fresh' }] },
  }, defaultRes);
  assert.equal(defaultRes.body.ok, true);
  assert.equal(defaultRes.body.entrants[0].entryType, 'guest');
  assert.equal(defaultRes.body.profileActions[0].action, 'guest');
  assert.deepEqual(calls, []);

  const createRes = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/entrants')({
    params: { tournamentId: 't1' },
    body: {
      action: 'bulk-create',
      entrantType: 'player',
      createMissingProfiles: true,
      entrants: [{ displayName: 'Existing' }, { displayName: 'Fresh' }],
    },
  }, createRes);
  assert.equal(createRes.body.ok, true);
  assert.equal(createRes.body.entrants[0].profileId, 'pl_existing');
  assert.equal(createRes.body.entrants[1].profileId, 'pl_Fresh');
  assert.deepEqual(createRes.body.profileActions.map(item => item.action), ['existing', 'created']);
  assert.deepEqual(calls, ['Fresh']);
});

test('bulk create profile mode is ignored for team tournaments', () => {
  const created = [];
  const app = makeApp();
  registerRegistryRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => ({ ok: true }),
    saveState: () => {},
    broadcast: () => {},
    listTournamentEntrants: () => [],
    createTournamentEntrant: input => ({
      id: `entry_${input.teamName}`,
      displayName: input.teamName,
      profileId: input.profileId || null,
      entryType: input.profileId ? 'registered' : 'guest',
    }),
    updateTournamentEntrant: () => null,
    bindTournamentEntrantToGlobalProfile: () => null,
    listPlayerProfiles: () => [],
    getGlobalPlayerProfileByName: () => null,
    createGlobalPlayerProfile: input => {
      created.push(input.displayName);
      return { id: `pl_${input.displayName}`, displayName: input.displayName };
    },
    updateGlobalPlayerProfile: () => null,
    deleteGlobalPlayerProfile: id => ({ ok: true, player: { id } }),
    bindTournamentPlayerToGlobalProfile: () => null,
    listLeagues: () => [],
    createLeague: () => null,
    getLeagueById: () => null,
    updateLeague: () => null,
    deleteLeague: id => ({ ok: true, league: { id } }),
    buildLeagueLeaderboard: () => null,
    includeTournamentInLeague: () => null,
    removeTournamentFromLeague: () => null,
    buildLeagueFinalQualification: () => null,
    listPointsProfiles: () => [],
    createPointsProfile: () => null,
    updatePointsProfile: () => null,
    deletePointsProfile: id => ({ ok: true, pointsProfile: { id } }),
    calculatePointAwardsForCurrentTournament: () => ({ ok: true, awards: [] }),
    listPointAwardsForCurrentTournament: () => [],
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/entrants')({
    params: { tournamentId: 't1' },
    body: {
      action: 'bulk-create',
      entrantType: 'team',
      createMissingProfiles: true,
      entrants: [{ entrantType: 'team', teamName: 'Team A', teamRoster: [] }],
    },
  }, res);

  assert.equal(res.body.ok, true);
  assert.equal(res.body.entrants[0].profileId, null);
  assert.equal(res.body.profileActions[0].action, 'guest');
  assert.deepEqual(created, []);
});
