const http = require('http');

const BASE_URL = process.env.PTS_BASE_URL || 'http://127.0.0.1:18765';

function request(method, path, body = null) {
  const url = new URL(path, BASE_URL);
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: `${url.pathname}${url.search}`,
      headers: payload ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      } : {},
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = data ? JSON.parse(data) : null; } catch (err) {}
        if (res.statusCode >= 400) {
          const error = new Error(`${method} ${path} failed: ${res.statusCode}`);
          error.response = parsed;
          reject(error);
          return;
        }
        resolve(parsed);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get = path => request('GET', path);
const post = (path, body) => request('POST', path, body);

let playerProfileCache = null;

function playerNames(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);
}

function teamNames(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);
}

function pickWinner(match, salt = 0) {
  if (match.p1 === 'BYE') return match.p2;
  if (match.p2 === 'BYE') return match.p1;
  return ((match.table || 1) + (match.round || match.doubleEliminationRound || match.bracketRound || 0) + salt) % 3 === 0
    ? match.p2
    : match.p1;
}

async function createTournament(name, settings) {
  const res = await post('/api/tournaments', { action: 'create', name, settings });
  if (!res.ok || !res.id) throw new Error(`create failed: ${name}`);
  return res.id;
}

async function getPlayerProfileCache() {
  if (playerProfileCache) return playerProfileCache;
  const res = await get('/api/player-profiles');
  playerProfileCache = new Map((res.players || []).map(profile => [profile.displayName, profile]));
  return playerProfileCache;
}

async function ensurePlayerProfile(displayName) {
  const cache = await getPlayerProfileCache();
  const current = cache.get(displayName);
  if (current) return current;
  const res = await post('/api/player-profiles', { action: 'create', displayName });
  if (!res.ok || !res.player) throw new Error(`create player profile failed: ${displayName}`);
  cache.set(res.player.displayName, res.player);
  return res.player;
}

async function addEntrants(id, names, entrantType = 'player', options = {}) {
  const entrants = [];
  for (const name of names) {
    if (entrantType === 'team') {
      entrants.push({
        entrantType: 'team',
        teamName: name,
        teamRoster: [`${name}-A`, `${name}-B`, `${name}-C`],
      });
      continue;
    }
    const profile = options.registerProfiles ? await ensurePlayerProfile(name) : null;
    entrants.push({ entrantType: 'player', displayName: name, profileId: profile?.id || null });
  }
  await post(`/api/tournaments/${id}/entrants`, { action: 'bulk-create', entrantType, entrants });
}

async function state(id) {
  return get(`/api/tournaments/${id}/state`);
}

async function startStage(id, stageId) {
  const res = await post(`/api/tournaments/${id}/stages/${stageId}/start`, {});
  if (!res.ok) throw new Error(`start stage failed: ${id} ${stageId} ${res.err || ''}`);
  return state(id);
}

async function finishRound(id, salt = 0) {
  const s = await state(id);
  const round = s.round;
  const matches = (s.matches || []).filter(match => match.round === round && !match.done);
  for (const match of matches) {
    const winner = pickWinner(match, salt);
    await post(`/api/tournaments/${id}/result`, { matchId: match.id, winnerId: winner });
  }
  return state(id);
}

async function advanceStage(id, stageId) {
  const res = await post(`/api/tournaments/${id}/stages/${stageId}/advance`, {});
  if (!res.ok) throw new Error(`advance stage failed: ${id} ${stageId} ${res.err || ''}`);
  return state(id);
}

async function completeStage(id, stageId) {
  const res = await post(`/api/tournaments/${id}/stages/${stageId}/complete`, {});
  if (!res.ok) throw new Error(`complete stage failed: ${id} ${stageId} ${res.err || ''}`);
  return state(id);
}

async function scoreOpenMatches(id, limit = Infinity, salt = 0) {
  let s = await state(id);
  const matches = (s.matches || []).filter(match => !match.done && match.p1 && match.p2);
  let count = 0;
  for (const match of matches) {
    if (count >= limit) break;
    const winner = pickWinner(match, salt + count);
    const p1Wins = winner === match.p1 ? 2 : 1;
    const p2Wins = winner === match.p2 ? 2 : 0;
    await post(`/api/tournaments/${id}/bo3-score`, { matchId: match.id, p1Wins, p2Wins });
    count++;
  }
  return state(id);
}

async function runSwissRounds(id, roundsToFinish, salt = 0) {
  let s = await state(id);
  const stageId = s.activeStageId || 'stage_swiss_1';
  for (let i = 0; i < roundsToFinish; i++) {
    s = await finishRound(id, salt + i);
    if (i < roundsToFinish - 1) {
      s = await advanceStage(id, stageId);
    }
  }
  return state(id);
}

async function clearOldQa() {
  const tournaments = await get('/api/tournaments');
  for (const item of tournaments) {
    if (String(item.name || '').startsWith('QA-')) {
      await post('/api/tournaments', { action: 'delete', id: item.id });
    }
  }
}

async function seed() {
  await clearOldQa();
  const created = [];

  let id = await createTournament('QA-01 64人瑞士轮TopCut16 已进入淘汰赛', {
    presetId: 'custom_structure',
    entrantType: 'player',
    game: 'vgc',
    qualificationType: 'swiss',
    qualificationBestOf: 1,
    finalsType: 'single_elimination',
    topCutSize: 16,
    finalsBestOf: 3,
    bronzeMatch: true,
  });
  await addEntrants(id, playerNames('红莲选手', 64));
  await startStage(id, 'stage_swiss_1');
  await runSwissRounds(id, 5, 1);
  await completeStage(id, 'stage_swiss_1');
  await advanceStage(id, 'stage_swiss_1');
  created.push(id);

  id = await createTournament('QA-02 64人瑞士轮 进行中第3轮', {
    presetId: 'custom_structure',
    entrantType: 'player',
    game: 'vgc',
    qualificationType: 'swiss',
    qualificationBestOf: 1,
    finalsType: 'none',
  });
  await addEntrants(id, playerNames('白银选手', 64));
  await startStage(id, 'stage_swiss_1');
  await runSwissRounds(id, 2, 4);
  await advanceStage(id, 'stage_swiss_1');
  created.push(id);

  id = await createTournament('QA-03 32人小组赛TopCut 决赛桌', {
    presetId: 'custom_structure',
    entrantType: 'player',
    game: 'vgc',
    qualificationType: 'groups',
    groupCount: 8,
    advancePerGroup: 2,
    qualificationBestOf: 1,
    finalsType: 'single_elimination',
    topCutSize: 16,
    finalsBestOf: 3,
    bronzeMatch: true,
  });
  await addEntrants(id, playerNames('琉璃选手', 32));
  await startStage(id, 'stage_groups_1');
  {
    let s = await state(id);
    for (const match of (s.matches || []).filter(match => !match.done)) {
      await post(`/api/tournaments/${id}/result`, { matchId: match.id, winnerId: pickWinner(match, 7) });
    }
    await completeStage(id, 'stage_groups_1');
    await advanceStage(id, 'stage_groups_1');
    for (let guard = 0; guard < 5; guard++) {
      s = await state(id);
      const open = (s.matches || []).filter(match => !match.done);
      if (open.length <= 2 && open.some(match => match.phase === 'Finals' || match.phase === 'Bronze Match')) break;
      await scoreOpenMatches(id, open.length, guard);
    }
  }
  created.push(id);

  id = await createTournament('QA-04 32人双败淘汰 进行中', {
    presetId: 'custom_structure',
    entrantType: 'player',
    game: 'vgc',
    qualificationType: 'none',
    finalsType: 'double_elimination',
    bracketSize: 32,
    finalsBestOf: 3,
    grandFinalReset: true,
  });
  await addEntrants(id, playerNames('紫堇选手', 32));
  await startStage(id, 'stage_double_elimination_1');
  await scoreOpenMatches(id, 16, 1);
  created.push(id);

  id = await createTournament('QA-05 32队团队瑞士轮 待开始', {
    presetId: 'custom_structure',
    entrantType: 'team',
    game: 'vgc',
    qualificationType: 'swiss',
    qualificationBestOf: 1,
    finalsType: 'none',
  });
  await addEntrants(id, teamNames('道馆队伍', 32), 'team');
  created.push(id);

  id = await createTournament('QA-06 64人纯单败 已完赛', {
    presetId: 'custom_structure',
    entrantType: 'player',
    game: 'vgc',
    qualificationType: 'none',
    finalsType: 'single_elimination',
    bracketSize: 64,
    finalsBestOf: 3,
    bronzeMatch: true,
  });
  await addEntrants(id, playerNames('冠军之路', 64), 'player', { registerProfiles: true });
  await startStage(id, 'stage_top_cut_1');
  for (let guard = 0; guard < 8; guard++) {
    const s = await state(id);
    const open = (s.matches || []).filter(match => !match.done);
    if (open.length === 0) break;
    await scoreOpenMatches(id, open.length, guard);
  }
  await completeStage(id, 'stage_top_cut_1');
  created.push(id);

  id = await createTournament('QA-07 128人瑞士轮 大规模第1轮', {
    presetId: 'custom_structure',
    entrantType: 'player',
    game: 'vgc',
    qualificationType: 'swiss',
    qualificationBestOf: 1,
    finalsType: 'none',
  });
  await addEntrants(id, playerNames('满编选手', 128));
  await startStage(id, 'stage_swiss_1');
  created.push(id);

  const summary = [];
  for (const tournamentId of created) {
    const s = await state(tournamentId);
    summary.push({
      id: tournamentId,
      name: s.tournamentName,
      phase: s.phase,
      entrants: (s.entrants || []).length,
      players: (s.players || []).length,
      matches: (s.matches || []).length,
      openMatches: (s.matches || []).filter(match => !match.done).length,
      admin: `${BASE_URL}/t/${tournamentId}/admin`,
      overlay: `${BASE_URL}/t/${tournamentId}/overlay`,
    });
  }
  console.log(JSON.stringify(summary, null, 2));
}

seed().catch(err => {
  console.error(err.stack || err.message);
  if (err.response) console.error(JSON.stringify(err.response, null, 2));
  process.exitCode = 1;
});
