const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadConfigWithEnv(env) {
  const configPath = require.resolve('../src/config');
  const previous = {};
  for (const key of [
    'PTS_DATA_ROOT',
    'DATA_ROOT',
    'PTS_DATA_DIR',
    'DATA_DIR',
    'PTS_PLAYERS_DIR',
    'PLAYERS_DIR',
    'PTS_LEAGUES_DIR',
    'LEAGUES_DIR',
    'PTS_POINTS_DIR',
    'POINTS_DIR',
    'PTS_REPORT_DIR',
    'REPORTS_DIR',
  ]) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, env);
  delete require.cache[configPath];
  const config = require('../src/config');
  delete require.cache[configPath];
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return config;
}

test('data root maps all persistent stores under one directory', () => {
  const root = path.join('tmp', 'pts-data-root');
  const config = loadConfigWithEnv({ DATA_ROOT: root });

  assert.equal(config.DATA_ROOT, root);
  assert.equal(config.DATA_DIR, path.join(root, 'tournaments'));
  assert.equal(config.PLAYERS_DIR, path.join(root, 'players'));
  assert.equal(config.LEAGUES_DIR, path.join(root, 'leagues'));
  assert.equal(config.POINTS_DIR, path.join(root, 'points'));
  assert.equal(config.REPORTS_DIR, path.join(root, 'reports'));
});

test('specific persistent store env vars override data root for compatibility', () => {
  const config = loadConfigWithEnv({
    DATA_ROOT: path.join('tmp', 'root'),
    DATA_DIR: path.join('tmp', 'legacy-tournaments'),
    PLAYERS_DIR: path.join('tmp', 'legacy-players'),
    PTS_REPORT_DIR: path.join('tmp', 'pts-reports'),
  });

  assert.equal(config.DATA_DIR, path.join('tmp', 'legacy-tournaments'));
  assert.equal(config.PLAYERS_DIR, path.join('tmp', 'legacy-players'));
  assert.equal(config.LEAGUES_DIR, path.join('tmp', 'root', 'leagues'));
  assert.equal(config.POINTS_DIR, path.join('tmp', 'root', 'points'));
  assert.equal(config.REPORTS_DIR, path.join('tmp', 'pts-reports'));
});
