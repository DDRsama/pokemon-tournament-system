const test = require('node:test');
const assert = require('node:assert/strict');

const { registerPlayersRoutes } = require('../src/routes/players');

function makeApp() {
  const routes = { post: new Map() };
  return {
    routes,
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

test('player report win follows game-score stage rules', () => {
  const app = makeApp();
  const state = {
    phase: 'double_elimination',
    matches: [
      { id: 'm1', stageId: 'stage_double_1', stagePhase: 'double_elimination', p1: 'A', p2: 'B', p1Wins: 0, p2Wins: 0, done: false },
    ],
    playerReports: {},
  };
  const calls = [];
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    addPlayer: () => {},
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {
      throw new Error('game-score match should not use whole-match result');
    },
    applyBo3Score: (matchId, p1Wins, p2Wins) => {
      const match = state.matches.find(item => item.id === matchId);
      match.p1Wins = p1Wins;
      match.p2Wins = p2Wins;
      match.done = p1Wins >= 2 || p2Wins >= 2;
      match.winner = p1Wins >= 2 ? match.p1 : p2Wins >= 2 ? match.p2 : null;
      return true;
    },
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => ({
      type: 'double_elimination',
      matchRules: { bestOf: 3, scoreMode: 'games', allowDraw: false },
    }),
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-report-win')({
    params: { tournamentId: 't1' },
    body: { playerName: 'A' },
  }, res);

  assert.equal(res.body.ok, true);
  assert.equal(state.matches[0].p1Wins, 1);
  assert.equal(state.matches[0].done, false);
  assert.equal(state.playerReports.A.type, 'game-win');
  assert.equal(state.playerReports.B.type, 'opponent-scored');
  assert.deepEqual(calls, ['save', 'broadcast']);
});

test('player report win treats BO3 swiss as game-score match', () => {
  const app = makeApp();
  const state = {
    phase: 'swiss',
    matches: [
      { id: 'm1', stageId: 'stage_swiss_1', round: 1, table: 1, p1: 'A', p2: 'B', p1Wins: 0, p2Wins: 0, done: false },
    ],
    playerReports: {},
  };
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name }),
    saveState: () => {},
    broadcast: () => {},
    addPlayer: () => {},
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {
      throw new Error('BO3 swiss should use game score');
    },
    applyBo3Score: (matchId, p1Wins, p2Wins) => {
      const match = state.matches.find(item => item.id === matchId);
      match.p1Wins = p1Wins;
      match.p2Wins = p2Wins;
      match.done = p1Wins >= 2 || p2Wins >= 2;
      match.winner = p1Wins >= 2 ? match.p1 : p2Wins >= 2 ? match.p2 : null;
      return true;
    },
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => ({
      type: 'swiss',
      matchRules: { bestOf: 3, scoreMode: 'match', allowDraw: true },
    }),
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-report-win')({
    params: { tournamentId: 't1' },
    body: { playerName: 'A' },
  }, res);

  assert.equal(res.body.ok, true);
  assert.equal(state.matches[0].p1Wins, 1);
  assert.equal(state.matches[0].done, false);
  assert.equal(state.playerReports.A.type, 'game-win');
});

test('player login asks before creating an unregistered entrant', () => {
  const app = makeApp();
  const state = {
    phase: 'setup',
    players: [],
    matches: [],
    playerReports: {},
  };
  const calls = [];
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    addPlayer: name => state.players.push(name),
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    getGlobalPlayerProfileByName: () => null,
    createGlobalPlayerProfile: () => {
      throw new Error('profile should not be created before confirmation');
    },
    bindTournamentPlayerToGlobalProfile: () => null,
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {},
    applyBo3Score: () => {},
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => null,
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-login')({
    params: { tournamentId: 't1' },
    body: { playerName: 'New Player' },
  }, res);

  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'PROFILE_NOT_FOUND');
  assert.deepEqual(state.players, []);
  assert.deepEqual(calls, []);
});

test('player login can register a missing profile before joining', () => {
  const app = makeApp();
  const state = {
    phase: 'setup',
    players: [],
    matches: [],
    playerReports: {},
  };
  const calls = [];
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name, globalProfileId: state.boundProfileId || null }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    addPlayer: name => state.players.push(name),
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    getGlobalPlayerProfileByName: () => null,
    createGlobalPlayerProfile: input => ({ id: 'global_new', displayName: input.displayName }),
    bindTournamentPlayerToGlobalProfile: (name, id) => {
      state.boundProfileId = id;
      return { playerId: `local_${name}`, globalProfileId: id };
    },
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {},
    applyBo3Score: () => {},
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => null,
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-login')({
    params: { tournamentId: 't1' },
    body: { playerName: 'New Player', registerProfile: true },
  }, res);

  assert.equal(res.body.ok, true);
  assert.equal(res.body.registeredProfile, true);
  assert.equal(res.body.guest, false);
  assert.equal(res.body.player.globalProfileId, 'global_new');
  assert.deepEqual(state.players, ['New Player']);
  assert.deepEqual(calls, ['save', 'broadcast']);
});

test('player login joins directly when a matching global profile already exists', () => {
  const app = makeApp();
  const state = {
    phase: 'setup',
    players: [],
    matches: [],
    playerReports: {},
    boundProfileId: null,
  };
  const calls = [];
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name, globalProfileId: state.boundProfileId }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    addPlayer: name => state.players.push(name),
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    getGlobalPlayerProfileByName: name => (
      name === 'Existing Player'
        ? { id: 'global_existing', displayName: name }
        : null
    ),
    createGlobalPlayerProfile: () => {
      throw new Error('existing profile login should not create a new profile');
    },
    bindTournamentPlayerToGlobalProfile: (name, id) => {
      state.boundProfileId = id;
      return { playerId: `local_${name}`, globalProfileId: id };
    },
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {},
    applyBo3Score: () => {},
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => null,
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-login')({
    params: { tournamentId: 't1' },
    body: { playerName: 'Existing Player' },
  }, res);

  assert.equal(res.body.ok, true);
  assert.equal(res.body.registeredProfile, true);
  assert.equal(res.body.guest, false);
  assert.equal(res.body.player.globalProfileId, 'global_existing');
  assert.deepEqual(state.players, ['Existing Player']);
  assert.deepEqual(calls, ['save', 'broadcast']);
});

test('player login binds the selected player-center profile id', () => {
  const app = makeApp();
  const state = {
    phase: 'setup',
    players: [],
    matches: [],
    playerReports: {},
    boundProfileId: null,
  };
  const calls = [];
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name, inPool: state.players.includes(name), globalProfileId: state.boundProfileId }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    addPlayer: name => state.players.push(name),
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    getGlobalPlayerProfileById: id => (
      id === 'global_selected'
        ? { id, displayName: 'Selected Profile' }
        : null
    ),
    getGlobalPlayerProfileByName: () => null,
    createGlobalPlayerProfile: () => {
      throw new Error('selected profile login should not create another profile');
    },
    bindTournamentPlayerToGlobalProfile: (name, id) => {
      state.boundProfileId = id;
      return { playerId: `local_${name}`, globalProfileId: id };
    },
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {},
    applyBo3Score: () => {},
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => null,
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-login')({
    params: { tournamentId: 't1' },
    body: { playerName: 'Selected Profile', profileId: 'global_selected' },
  }, res);

  assert.equal(res.body.ok, true);
  assert.equal(res.body.registeredProfile, true);
  assert.equal(res.body.guest, false);
  assert.equal(res.body.player.globalProfileId, 'global_selected');
  assert.deepEqual(state.players, ['Selected Profile']);
  assert.deepEqual(calls, ['save', 'broadcast']);
});

test('player login ignores a stale selected profile id when the name does not match', () => {
  const app = makeApp();
  const state = {
    phase: 'setup',
    players: [],
    matches: [],
    playerReports: {},
    boundProfileId: null,
  };
  const calls = [];
  const bindCalls = [];
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name, inPool: state.players.includes(name), globalProfileId: state.boundProfileId }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    addPlayer: name => state.players.push(name),
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    getGlobalPlayerProfileById: id => (
      id === 'global_old'
        ? { id, displayName: 'Old Player', aliases: [] }
        : null
    ),
    getGlobalPlayerProfileByName: () => null,
    createGlobalPlayerProfile: () => {
      throw new Error('stale profile login should not create before confirmation');
    },
    bindTournamentPlayerToGlobalProfile: (name, id) => {
      bindCalls.push({ name, id });
      state.boundProfileId = id;
      return { playerId: `local_${name}`, globalProfileId: id };
    },
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {},
    applyBo3Score: () => {},
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => null,
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-login')({
    params: { tournamentId: 't1' },
    body: { playerName: 'New Player', profileId: 'global_old' },
  }, res);

  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'PROFILE_NOT_FOUND');
  assert.deepEqual(state.players, []);
  assert.deepEqual(bindCalls, []);
  assert.deepEqual(calls, []);
});

test('player login registers a new profile instead of using a stale selected profile id', () => {
  const app = makeApp();
  const state = {
    phase: 'setup',
    players: [],
    matches: [],
    playerReports: {},
    boundProfileId: null,
  };
  const calls = [];
  const createdProfiles = [];
  const bindCalls = [];
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name, inPool: state.players.includes(name), globalProfileId: state.boundProfileId }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    addPlayer: name => state.players.push(name),
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    getGlobalPlayerProfileById: id => (
      id === 'global_old'
        ? { id, displayName: 'Old Player', aliases: [] }
        : null
    ),
    getGlobalPlayerProfileByName: () => null,
    createGlobalPlayerProfile: input => {
      createdProfiles.push(input);
      return { id: 'global_new', displayName: input.displayName };
    },
    bindTournamentPlayerToGlobalProfile: (name, id) => {
      bindCalls.push({ name, id });
      state.boundProfileId = id;
      return { playerId: `local_${name}`, globalProfileId: id };
    },
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {},
    applyBo3Score: () => {},
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => null,
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-login')({
    params: { tournamentId: 't1' },
    body: { playerName: 'New Player', profileId: 'global_old', registerProfile: true },
  }, res);

  assert.equal(res.body.ok, true);
  assert.equal(res.body.registeredProfile, true);
  assert.equal(res.body.guest, false);
  assert.equal(res.body.player.globalProfileId, 'global_new');
  assert.deepEqual(state.players, ['New Player']);
  assert.deepEqual(createdProfiles, [{ displayName: 'New Player' }]);
  assert.deepEqual(bindCalls, [{ name: 'New Player', id: 'global_new' }]);
  assert.deepEqual(calls, ['save', 'broadcast']);
});

test('player login can continue as guest without profile points eligibility', () => {
  const app = makeApp();
  const state = {
    phase: 'setup',
    players: [],
    matches: [],
    playerReports: {},
  };
  const calls = [];
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name, globalProfileId: null }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    addPlayer: name => state.players.push(name),
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    getGlobalPlayerProfileByName: () => null,
    createGlobalPlayerProfile: () => {
      throw new Error('guest login should not create profile');
    },
    bindTournamentPlayerToGlobalProfile: () => null,
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {},
    applyBo3Score: () => {},
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => null,
  });

  const res = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-login')({
    params: { tournamentId: 't1' },
    body: { playerName: 'Guest Player', continueAsGuest: true },
  }, res);

  assert.equal(res.body.ok, true);
  assert.equal(res.body.registeredProfile, false);
  assert.equal(res.body.guest, true);
  assert.equal(res.body.player.globalProfileId, null);
  assert.deepEqual(state.players, ['Guest Player']);
  assert.deepEqual(calls, ['save', 'broadcast']);
});

test('guest player upgrade asks before binding an existing global profile', () => {
  const app = makeApp();
  const state = {
    phase: 'swiss',
    players: ['Guest Player'],
    matches: [],
    playerReports: {},
    boundProfileId: null,
    playerProfiles: {
      'Guest Player': { playerId: 'local_guest', name: 'Guest Player', globalProfileId: null },
    },
  };
  const calls = [];
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name, inPool: true, globalProfileId: state.boundProfileId }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    addPlayer: () => {},
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    getGlobalPlayerProfileByName: name => (
      name === 'Guest Player'
        ? { id: 'global_existing', displayName: name }
        : null
    ),
    createGlobalPlayerProfile: () => {
      throw new Error('existing profile upgrade should not create a profile');
    },
    bindTournamentPlayerToGlobalProfile: (name, id) => {
      state.boundProfileId = id;
      return { playerId: `local_${name}`, globalProfileId: id };
    },
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {},
    applyBo3Score: () => {},
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => null,
  });

  const first = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-upgrade-profile')({
    params: { tournamentId: 't1' },
    body: { playerName: 'Guest Player' },
  }, first);

  assert.equal(first.body.ok, false);
  assert.equal(first.body.code, 'PROFILE_EXISTS');
  assert.equal(state.boundProfileId, null);
  assert.deepEqual(calls, []);

  const second = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-upgrade-profile')({
    params: { tournamentId: 't1' },
    body: { playerName: 'Guest Player', confirmBind: true },
  }, second);

  assert.equal(second.body.ok, true);
  assert.equal(second.body.boundProfile, true);
  assert.equal(second.body.player.globalProfileId, 'global_existing');
  assert.equal(state.boundProfileId, 'global_existing');
  assert.deepEqual(calls, ['save', 'broadcast']);
});

test('guest player upgrade asks before creating a new global profile', () => {
  const app = makeApp();
  const state = {
    phase: 'swiss',
    players: ['Guest Player'],
    matches: [],
    playerReports: {},
    boundProfileId: null,
    playerProfiles: {
      'Guest Player': { playerId: 'local_guest', name: 'Guest Player', globalProfileId: null },
    },
  };
  const calls = [];
  const createdProfiles = [];
  registerPlayersRoutes(app, {
    syncTournamentRequest: () => true,
    buildClientState: () => state,
    buildPlayerView: name => ({ playerName: name, inPool: true, globalProfileId: state.boundProfileId }),
    saveState: () => calls.push('save'),
    broadcast: () => calls.push('broadcast'),
    addPlayer: () => {},
    removePlayer: () => {},
    ensurePlayerSession: name => ({ playerId: `local_${name}` }),
    getGlobalPlayerProfileByName: () => null,
    createGlobalPlayerProfile: input => {
      createdProfiles.push(input);
      return { id: 'global_new', displayName: input.displayName };
    },
    bindTournamentPlayerToGlobalProfile: (name, id) => {
      state.boundProfileId = id;
      return { playerId: `local_${name}`, globalProfileId: id };
    },
    dropPlayer: () => {},
    dropPlayerFromMatch: () => true,
    applyResult: () => {},
    applyBo3Score: () => {},
    current: () => state,
    isLoopbackHost: () => false,
    normalizePublicBaseUrlCandidate: value => value,
    validatePublicBaseUrlAccess: () => ({ ok: true }),
    getMatchStage: () => null,
  });

  const first = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-upgrade-profile')({
    params: { tournamentId: 't1' },
    body: { playerName: 'Guest Player' },
  }, first);

  assert.equal(first.body.ok, false);
  assert.equal(first.body.code, 'CONFIRM_CREATE_PROFILE');
  assert.deepEqual(createdProfiles, []);
  assert.deepEqual(calls, []);

  const second = makeRes();
  app.routes.post.get('/api/tournaments/:tournamentId/player-upgrade-profile')({
    params: { tournamentId: 't1' },
    body: { playerName: 'Guest Player', confirmCreate: true },
  }, second);

  assert.equal(second.body.ok, true);
  assert.equal(second.body.registeredProfile, true);
  assert.equal(second.body.player.globalProfileId, 'global_new');
  assert.deepEqual(createdProfiles, [{ displayName: 'Guest Player' }]);
  assert.deepEqual(calls, ['save', 'broadcast']);
});
