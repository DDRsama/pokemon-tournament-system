const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pts-stage-flow-'));
}

test('groups can complete and advance into a scaled single elimination final', async () => {
  const root = makeTempDir();
  process.env.PTS_DATA_DIR = path.join(root, 'tournaments');
  process.env.PTS_PLAYERS_DIR = path.join(root, 'players');
  process.env.PTS_LEAGUES_DIR = path.join(root, 'leagues');
  process.env.PTS_POINTS_DIR = path.join(root, 'points');
  process.env.PTS_REPORT_DIR = path.join(root, 'reports');

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
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload;
  }

  try {
    const created = await api('POST', '/api/tournaments', { action: 'create', name: 'Stage Flow' });
    const tournamentId = created.id;
    await api('POST', `/api/tournaments/${tournamentId}/settings/preset`, {
      presetId: 'groups_top_cut',
      options: { groupCount: 2, advancePerGroup: 1, topCutSize: 2 },
    });

    for (const name of ['Alice', 'Bob', 'Cathy', 'Dylan']) {
      await api('POST', `/api/tournaments/${tournamentId}/entrants`, { action: 'create', displayName: name });
    }

    const started = await api('POST', `/api/tournaments/${tournamentId}/stages/stage_groups_1/start`);
    assert.equal(started.ok, true);
    let state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.equal(state.phase, 'groups');
    assert.equal(state.matches.length, 2);

    for (const match of state.matches.filter(item => item.stageId === 'stage_groups_1')) {
      const result = await api('POST', `/api/tournaments/${tournamentId}/result`, {
        matchId: match.id,
        winnerId: match.p1,
      });
      assert.equal(result.ok, true);
    }

    const completed = await api('POST', `/api/tournaments/${tournamentId}/stages/stage_groups_1/complete`);
    assert.equal(completed.ok, true);
    state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.deepEqual(state.stageResults.stage_groups_1.advancers, ['Alice', 'Bob']);
    let playerView = await api('GET', `/api/tournaments/${tournamentId}/player-view/${encodeURIComponent('Alice')}`);
    assert.equal(playerView.mode, 'top8-waiting');
    assert.equal(playerView.history.length, 1);
    playerView = await api('GET', `/api/tournaments/${tournamentId}/player-view/${encodeURIComponent('Cathy')}`);
    assert.equal(playerView.mode, 'final-result');
    assert.equal(playerView.history.length, 1);

    const advanced = await api('POST', `/api/tournaments/${tournamentId}/stages/stage_groups_1/advance`);
    assert.equal(advanced.ok, true);
    state = await api('GET', `/api/tournaments/${tournamentId}/state`);
    assert.equal(state.phase, 'top8');
    assert.deepEqual(state.top8, ['Alice', 'Bob']);
    const final = state.matches.find(match => match.stageId === 'stage_top_cut_1' && match.phase === 'Finals');
    assert.ok(final);
    assert.equal(final.p1, 'Alice');
    assert.equal(final.p2, 'Bob');
    playerView = await api('GET', `/api/tournaments/${tournamentId}/player-view/${encodeURIComponent('Alice')}`);
    assert.equal(playerView.mode, 'active-match');
    assert.equal(playerView.history.length, 1);
    assert.equal(playerView.history[0].phase, 'A组');
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
