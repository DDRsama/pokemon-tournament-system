const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createJsonStore, isSafeTournamentId } = require('../src/storage/jsonStore');

function makeTempStore() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-store-'));
  const store = createJsonStore({
    dataDir,
    displayPhaseForTournament: state => state.phase,
  });
  return { dataDir, store };
}

test('safe tournament id only allows expected characters', () => {
  assert.equal(isSafeTournamentId('t_123-abc'), true);
  assert.equal(isSafeTournamentId('../evil'), false);
  assert.equal(isSafeTournamentId('a/b'), false);
  assert.equal(isSafeTournamentId(''), false);
});

test('json store saves and loads tournament data', () => {
  const { store } = makeTempStore();
  const state = { _id: 't_demo', tournamentName: 'Demo', phase: 'setup', _createdAt: 10 };
  store.save('t_demo', state);
  assert.deepEqual(store.load('t_demo'), state);
  assert.equal(store.exists('t_demo'), true);
});

test('json store rejects unsafe tournament ids', () => {
  const { store } = makeTempStore();
  assert.throws(() => store.save('../evil', {}), /invalid tournament id/);
  assert.equal(store.exists('../evil'), false);
});

test('list skips bad json files without crashing', () => {
  const { dataDir, store } = makeTempStore();
  store.save('t_good', { tournamentName: 'Good', phase: 'setup', _createdAt: 20 });
  fs.writeFileSync(path.join(dataDir, 't_bad.json'), '{bad json', 'utf8');
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 't_good');
});
