const test = require('node:test');
const assert = require('node:assert/strict');

const { registerStagesRoutes } = require('../src/routes/stages');

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

test('stage routes expose stage operations', () => {
  const calls = [];
  const app = makeApp();
  registerStagesRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => ({ ok: true }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    listTournamentStages: () => [{ id: 'stage_swiss_1', type: 'swiss' }],
    startTournamentStage: stageId => ({ ok: true, stage: { id: stageId } }),
    generateStageMatches: stageId => ({ ok: true, stage: { id: stageId } }),
    completeTournamentStage: stageId => ({ ok: true, stage: { id: stageId } }),
    advanceTournamentStage: stageId => ({ ok: true, stage: { id: stageId }, advanced: true }),
  });

  assert.equal(typeof app.routes.get.get('/api/tournaments/:tournamentId/stages'), 'function');
  assert.equal(typeof app.routes.post.get('/api/tournaments/:tournamentId/stages/:stageId/start'), 'function');
  assert.equal(typeof app.routes.post.get('/api/tournaments/:tournamentId/stages/:stageId/generate-matches'), 'function');
  assert.equal(typeof app.routes.post.get('/api/tournaments/:tournamentId/stages/:stageId/complete'), 'function');
  assert.equal(typeof app.routes.post.get('/api/tournaments/:tournamentId/stages/:stageId/advance'), 'function');

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/stages/:stageId/start')({
    params: { tournamentId: 't1', stageId: 'stage_swiss_1' },
  }, res);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.stage.id, 'stage_swiss_1');
  assert.deepEqual(calls, ['save', 'broadcast']);
});

test('advance route calls advance stage operation', () => {
  const calls = [];
  const app = makeApp();
  registerStagesRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => ({ ok: true }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    listTournamentStages: () => [],
    startTournamentStage: () => ({ ok: false }),
    generateStageMatches: () => ({ ok: false }),
    completeTournamentStage: () => {
      throw new Error('advance route should not complete the stage');
    },
    advanceTournamentStage: stageId => {
      calls.push(`advance:${stageId}`);
      return { ok: true, stage: { id: stageId } };
    },
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/stages/:stageId/advance')({
    params: { tournamentId: 't1', stageId: 'stage_top_cut_1' },
  }, res);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.stage.id, 'stage_top_cut_1');
  assert.deepEqual(calls, ['advance:stage_top_cut_1', 'save', 'broadcast']);
});
