const test = require('node:test');
const assert = require('node:assert/strict');

const { registerTournamentsRoutes } = require('../src/routes/tournaments');

function makeApp() {
  const routes = { get: new Map(), post: new Map() };
  return {
    routes,
    get(path, handler) {
      routes.get.set(path, handler);
    },
    post(path, handler) {
      routes.post.set(path, handler);
    },
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('tournament routes expose global player summary', () => {
  const app = makeApp();
  registerTournamentsRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => ({ phase: 'setup' }),
    listTournaments: () => [],
    buildPlayerView: () => ({ playerName: 'A' }),
    buildGlobalPlayerSummary: id => ({ profile: { id, displayName: 'A' }, totalPoints: 10, tournaments: [] }),
    createTournament: () => 't1',
    loadTournament: () => true,
    saveState: () => {},
    broadcast: () => {},
    freshState: () => ({}),
    resetCurrentState: () => {},
    loadLatestTournamentIfAny: () => {},
    setCurrentTournamentId: () => {},
    current: () => ({ _id: 't1' }),
    tournamentStore: { remove: () => {} },
    saveCurrentAsCache: () => {},
  });

  assert.equal(typeof app.routes.get.get('/api/player-profiles/:playerId/summary'), 'function');
  const res = makeRes();
  app.routes.get.get('/api/player-profiles/:playerId/summary')({ params: { playerId: 'pl_a' } }, res);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.summary.totalPoints, 10);
});

test('player view by id rejects stale scoped player identity', () => {
  const app = makeApp();
  registerTournamentsRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => ({ phase: 'setup' }),
    listTournaments: () => [],
    buildPlayerView: () => {
      throw new Error('stale id should not fall back to name view');
    },
    buildPlayerViewById: id => ({
      ok: false,
      code: 'PLAYER_ID_NOT_FOUND',
      message: `stale ${id}`,
    }),
    buildGlobalPlayerSummary: () => null,
    createTournament: () => 't1',
    loadTournament: () => true,
    saveState: () => {},
    broadcast: () => {},
    freshState: () => ({}),
    resetCurrentState: () => {},
    loadLatestTournamentIfAny: () => {},
    setCurrentTournamentId: () => {},
    current: () => ({ _id: 't1' }),
    tournamentStore: { remove: () => {} },
    saveCurrentAsCache: () => {},
  });

  const res = makeRes();
  app.routes.get.get('/api/tournaments/:tournamentId/player-view-by-id/:playerId')({
    params: { tournamentId: 't1', playerId: 'pl_old' },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'PLAYER_ID_NOT_FOUND');
});


test('tournament create route forwards initial settings', () => {
  const app = makeApp();
  let created = null;
  registerTournamentsRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => ({ phase: 'setup' }),
    listTournaments: () => [],
    buildPlayerView: () => ({ playerName: 'A' }),
    buildGlobalPlayerSummary: () => null,
    createTournament: (name, options) => {
      created = { name, options };
      return 't2';
    },
    loadTournament: () => true,
    saveState: () => {},
    broadcast: () => {},
    freshState: () => ({}),
    resetCurrentState: () => {},
    loadLatestTournamentIfAny: () => {},
    setCurrentTournamentId: () => {},
    current: () => ({ _id: 't1' }),
    tournamentStore: { remove: () => {} },
    saveCurrentAsCache: () => {},
  });

  const settings = {
    presetId: 'custom_structure',
    stages: [
      { id: 'stage_swiss_1', type: 'swiss', swiss: { rounds: 6 }, advancement: { targetStageId: null } },
    ],
  };
  const res = makeRes();
  app.routes.post.get('/api/tournaments')({ body: { action: 'create', name: '测试赛', settings } }, res);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.id, 't2');
  assert.equal(created.name, '测试赛');
  assert.deepEqual(created.options.settings, settings);
});
