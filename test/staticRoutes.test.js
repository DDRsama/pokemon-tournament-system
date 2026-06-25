const test = require('node:test');
const assert = require('node:assert/strict');

const { registerStaticRoutes } = require('../src/routes/static');

function makeApp() {
  const routes = [];
  return {
    routes,
    use(path, ...handlers) {
      routes.push({ method: 'use', path, handlers });
    },
    get(path, handler) {
      routes.push({ method: 'get', path, handler });
    },
  };
}

test('static routes expose admin assets before bare admin redirect', () => {
  const app = makeApp();
  const express = {
    static(dir, options) {
      return { type: 'static', dir, options };
    },
  };
  const path = {
    join(...parts) {
      return parts.join('/');
    },
  };

  registerStaticRoutes(app, {
    express,
    path,
    PUBLIC_DIR: 'public',
    sendTournamentPage: () => {},
  });

  const adminStaticIndex = app.routes.findIndex(route => route.method === 'use' && route.path === '/admin');
  const adminRedirectIndex = app.routes.findIndex(route =>
    route.method === 'get'
    && Array.isArray(route.path)
    && route.path.includes('/admin')
  );

  assert.notEqual(adminStaticIndex, -1);
  assert.notEqual(adminRedirectIndex, -1);
  assert.equal(typeof app.routes[adminStaticIndex].handlers[0], 'function');
  assert.equal(app.routes[adminStaticIndex].handlers[1].type, 'static');
  assert.equal(app.routes[adminStaticIndex].handlers[1].dir, 'public/admin');
  assert.equal(app.routes[adminStaticIndex].handlers[1].options.index, false);
  assert.equal(adminStaticIndex < adminRedirectIndex, true);
});

test('static routes expose player center instead of redirecting bare player entry', () => {
  const sentFiles = [];
  const app = makeApp();
  const express = {
    static(dir, options) {
      return { type: 'static', dir, options };
    },
  };
  const path = {
    join(...parts) {
      return parts.join('/');
    },
  };

  registerStaticRoutes(app, {
    express,
    path,
    PUBLIC_DIR: 'public',
    sendTournamentPage: () => {},
  });

  const playerStatic = app.routes.find(route => route.method === 'use' && route.path === '/player');
  const playerEntry = app.routes.find(route =>
    route.method === 'get'
    && Array.isArray(route.path)
    && route.path.includes('/player/')
  );
  const legacyRedirect = app.routes.find(route =>
    route.method === 'get'
    && Array.isArray(route.path)
    && route.path.includes('/player-login')
  );

  assert.equal(playerStatic.handlers[1].dir, 'public/player-center');
  assert.equal(playerStatic.handlers[1].options.index, false);
  assert.notEqual(playerEntry, undefined);
  assert.equal(legacyRedirect.path.includes('/player'), false);

  playerEntry.handler({}, { sendFile: file => sentFiles.push(file) });
  assert.deepEqual(sentFiles, ['public/player-center/index.html']);
});
