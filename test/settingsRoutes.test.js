const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSettingsRoutes } = require('../src/routes/settings');

function makeApp() {
  const routes = { get: new Map(), put: new Map(), post: new Map() };
  return {
    routes,
    get(path, handler) {
      routes.get.set(path, handler);
    },
    put(path, handler) {
      routes.put.set(path, handler);
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

test('settings routes expose read update and preset endpoints', () => {
  const calls = [];
  const app = makeApp();
  registerSettingsRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => ({ ok: true }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    getTournamentSettings: () => ({ presetId: 'current_pts_default' }),
    updateTournamentSettings: settings => ({ ...settings, normalized: true }),
    applyTournamentPreset: (presetId, options) => ({ presetId, options }),
    listTournamentPresets: () => [{ id: 'current_pts_default', name: '当前 PTS 默认赛制' }],
  });

  assert.equal(typeof app.routes.get.get('/api/tournaments/:tournamentId/settings'), 'function');
  assert.equal(typeof app.routes.put.get('/api/tournaments/:tournamentId/settings'), 'function');
  assert.equal(typeof app.routes.post.get('/api/tournaments/:tournamentId/settings/preset'), 'function');

  const getRes = makeRes();
  app.routes.get.get('/api/tournaments/:tournamentId/settings')({ params: { tournamentId: 't1' } }, getRes);
  assert.equal(getRes.body.ok, true);
  assert.equal(getRes.body.presets[0].id, 'current_pts_default');

  const putRes = makeRes();
  app.routes.put.get('/api/tournaments/:tournamentId/settings')({ params: { tournamentId: 't1' }, body: { settings: { entrantType: 'team' } } }, putRes);
  assert.equal(putRes.body.settings.entrantType, 'team');
  assert.equal(calls.includes('save'), true);
  assert.equal(calls.includes('broadcast'), true);
});

test('settings routes lock rule mutations after setup phase', () => {
  const calls = [];
  const app = makeApp();
  registerSettingsRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => ({ phase: 'double_elimination' }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    getTournamentSettings: () => ({ presetId: 'current_pts_default' }),
    updateTournamentSettings: () => {
      calls.push('update');
      return {};
    },
    applyTournamentPreset: () => {
      calls.push('preset');
      return {};
    },
    listTournamentPresets: () => [{ id: 'current_pts_default', name: '当前 PTS 默认赛制' }],
  });

  const putRes = makeRes();
  app.routes.put.get('/api/tournaments/:tournamentId/settings')(
    { params: { tournamentId: 't1' }, body: { settings: { entrantType: 'team' } } },
    putRes,
  );
  assert.equal(putRes.statusCode, 409);
  assert.equal(putRes.body.ok, false);
  assert.match(putRes.body.err, /赛事规则已锁定/);

  const presetRes = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/settings/preset')(
    { params: { tournamentId: 't1' }, body: { presetId: 'vgc_swiss_top_cut' } },
    presetRes,
  );
  assert.equal(presetRes.statusCode, 409);
  assert.equal(presetRes.body.ok, false);
  assert.deepEqual(calls, []);
});
