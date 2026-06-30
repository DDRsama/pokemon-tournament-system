const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('docker deployment persists every data store through a single data mount', () => {
  const dockerfile = readUtf8('Dockerfile');
  const compose = readUtf8('docker-compose.yml');
  const deployCompose = readUtf8('docker-compose.deploy.yml');
  const source = `${dockerfile}\n${compose}\n${deployCompose}`;

  [
    'ENV DATA_ROOT=/data',
    'ENV PLAYERS_DIR=/data/players',
    'ENV LEAGUES_DIR=/data/leagues',
    'ENV POINTS_DIR=/data/points',
    'ENV FONTS_DIR=/data/fonts',
    'ENV REPORTS_DIR=/data/reports',
    'RUN mkdir -p /data/tournaments /data/players /data/leagues /data/points /data/fonts/zh /data/fonts/en /data/fonts/ja /data/reports',
    'DATA_ROOT: /data',
    '- ./data:/data',
  ].forEach(token => assert.equal(source.includes(token), true, `docker config should contain: ${token}`));

  [
    '- ./data/tournaments:/data/tournaments',
    '- ./data/reports:/data/reports',
  ].forEach(token => assert.equal(source.includes(token), false, `docker config should not use split mounts: ${token}`));
});

test('readmes document every persistent data directory', () => {
  for (const relativePath of ['README.md', 'README.en.md', 'README.ja.md']) {
    const text = readUtf8(relativePath);
    [
      './data/tournaments',
      './data/players',
      './data/leagues',
      './data/points',
      './data/fonts',
      './data/reports',
      'DATA_ROOT',
      'PLAYERS_DIR',
      'LEAGUES_DIR',
      'POINTS_DIR',
      'FONTS_DIR',
    ].forEach(token => assert.equal(text.includes(token), true, `${relativePath} should document: ${token}`));
  }
});
