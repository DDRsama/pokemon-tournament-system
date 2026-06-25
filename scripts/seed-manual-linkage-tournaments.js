const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.PTS_BASE_URL || 'http://127.0.0.1:18765';
const PREFIX = '联调-';
const SUMMARY_PATH = path.join(__dirname, '..', 'data', 'manual-linkage-tournaments.json');

function request(method, route, body = null) {
  const url = new URL(route, BASE_URL);
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
          const error = new Error(`${method} ${route} failed: ${res.statusCode}`);
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

const get = route => request('GET', route);
const post = (route, body) => request('POST', route, body);

function playerNames(count) {
  return Array.from({ length: count }, (_, index) => `联调选手${String(index + 1).padStart(2, '0')}`);
}

function teamNames(count) {
  return Array.from({ length: count }, (_, index) => `联调队伍${String(index + 1).padStart(2, '0')}`);
}

let profileCache = null;

async function getProfileCache() {
  if (profileCache) return profileCache;
  const res = await get('/api/player-profiles');
  profileCache = new Map((res.players || []).map(profile => [profile.displayName, profile]));
  return profileCache;
}

async function ensurePlayerProfile(displayName) {
  const cache = await getProfileCache();
  const current = cache.get(displayName);
  if (current) return current;
  const res = await post('/api/player-profiles', { action: 'create', displayName });
  if (!res.ok || !res.player) throw new Error(`create player profile failed: ${displayName}`);
  cache.set(res.player.displayName, res.player);
  return res.player;
}

async function clearOldManualTournaments() {
  const tournaments = await get('/api/tournaments');
  for (const item of tournaments || []) {
    if (String(item.name || '').startsWith(PREFIX)) {
      await post('/api/tournaments', { action: 'delete', id: item.id });
    }
  }
}

async function createTournament(name, settings) {
  const res = await post('/api/tournaments', { action: 'create', name, settings });
  if (!res.ok || !res.id) throw new Error(`create tournament failed: ${name}`);
  return res.id;
}

async function addPlayerEntrants(id, count, { registered = true } = {}) {
  const entrants = [];
  for (const displayName of playerNames(count)) {
    const profile = registered ? await ensurePlayerProfile(displayName) : null;
    entrants.push({
      entrantType: 'player',
      displayName,
      profileId: profile?.id || null,
    });
  }
  await post(`/api/tournaments/${id}/entrants`, { action: 'bulk-create', entrantType: 'player', entrants });
}

async function addTeamEntrants(id, count) {
  const entrants = teamNames(count).map(teamName => ({
    entrantType: 'team',
    teamName,
    teamRoster: [`${teamName}-A`, `${teamName}-B`, `${teamName}-C`],
  }));
  await post(`/api/tournaments/${id}/entrants`, { action: 'bulk-create', entrantType: 'team', entrants });
}

async function readState(id) {
  return get(`/api/tournaments/${id}/state`);
}

function describeStages(state) {
  return (state.tournamentSettings?.stages || []).map(stage => ({
    id: stage.id,
    name: stage.name,
    type: stage.type,
    role: stage.role,
    bestOf: stage.matchRules?.bestOf || null,
    advancement: stage.advancement || null,
  }));
}

async function seedOne(definition) {
  const id = await createTournament(definition.name, definition.settings);
  if (definition.entrantType === 'team') await addTeamEntrants(id, definition.entrantCount);
  else await addPlayerEntrants(id, definition.entrantCount, { registered: definition.registered !== false });
  const state = await readState(id);
  return {
    id,
    name: state.tournamentName,
    phase: state.phase,
    entrantType: state.tournamentSettings?.entrantType,
    entrants: (state.entrants || []).length,
    players: (state.players || []).length,
    stages: describeStages(state),
    admin: `${BASE_URL}/t/${id}/admin`,
    overlay: `${BASE_URL}/t/${id}/overlay`,
    playerLogin: `${BASE_URL}/t/${id}/player-login`,
  };
}

async function seed() {
  await clearOldManualTournaments();

  const definitions = [
    {
      name: `${PREFIX}01 个人瑞士轮单场 32人 BO1`,
      entrantType: 'player',
      entrantCount: 32,
      settings: {
        presetId: 'custom_structure',
        entrantType: 'player',
        game: 'vgc',
        qualificationType: 'swiss',
        qualificationBestOf: 1,
        finalsType: 'none',
      },
    },
    {
      name: `${PREFIX}02 个人瑞士轮Top8 32人 瑞士BO1 淘汰BO3`,
      entrantType: 'player',
      entrantCount: 32,
      settings: {
        presetId: 'custom_structure',
        entrantType: 'player',
        game: 'vgc',
        qualificationType: 'swiss',
        qualificationBestOf: 1,
        finalsType: 'single_elimination',
        topCutSize: 8,
        finalsBestOf: 3,
        bronzeMatch: true,
      },
    },
    {
      name: `${PREFIX}03 个人瑞士轮双败Top8 32人`,
      entrantType: 'player',
      entrantCount: 32,
      settings: {
        presetId: 'custom_structure',
        entrantType: 'player',
        game: 'vgc',
        qualificationType: 'swiss',
        qualificationBestOf: 1,
        finalsType: 'double_elimination',
        topCutSize: 8,
        finalsBestOf: 3,
        grandFinalReset: true,
      },
    },
    {
      name: `${PREFIX}04 个人小组赛Top8 32人 8组出1`,
      entrantType: 'player',
      entrantCount: 32,
      settings: {
        presetId: 'custom_structure',
        entrantType: 'player',
        game: 'vgc',
        qualificationType: 'groups',
        groupCount: 8,
        advancePerGroup: 1,
        qualificationBestOf: 1,
        finalsType: 'single_elimination',
        topCutSize: 8,
        finalsBestOf: 3,
        bronzeMatch: true,
      },
    },
    {
      name: `${PREFIX}05 个人小组赛纯排名 24人 6组`,
      entrantType: 'player',
      entrantCount: 24,
      settings: {
        presetId: 'custom_structure',
        entrantType: 'player',
        game: 'vgc',
        qualificationType: 'groups',
        groupCount: 6,
        advancePerGroup: 1,
        qualificationBestOf: 1,
        finalsType: 'none',
      },
    },
    {
      name: `${PREFIX}06 个人纯单败 16人 BO3`,
      entrantType: 'player',
      entrantCount: 16,
      settings: {
        presetId: 'custom_structure',
        entrantType: 'player',
        game: 'vgc',
        qualificationType: 'none',
        finalsType: 'single_elimination',
        bracketSize: 16,
        finalsBestOf: 3,
        bronzeMatch: true,
      },
    },
    {
      name: `${PREFIX}07 个人纯双败 16人 BO3`,
      entrantType: 'player',
      entrantCount: 16,
      settings: {
        presetId: 'custom_structure',
        entrantType: 'player',
        game: 'vgc',
        qualificationType: 'none',
        finalsType: 'double_elimination',
        bracketSize: 16,
        finalsBestOf: 3,
        grandFinalReset: true,
      },
    },
    {
      name: `${PREFIX}08 团队瑞士轮 16队 BO1`,
      entrantType: 'team',
      entrantCount: 16,
      settings: {
        presetId: 'custom_structure',
        entrantType: 'team',
        game: 'vgc',
        qualificationType: 'swiss',
        qualificationBestOf: 1,
        finalsType: 'none',
      },
    },
    {
      name: `${PREFIX}09 团队小组赛双败Top8 16队 4组出2`,
      entrantType: 'team',
      entrantCount: 16,
      settings: {
        presetId: 'custom_structure',
        entrantType: 'team',
        game: 'vgc',
        qualificationType: 'groups',
        groupCount: 4,
        advancePerGroup: 2,
        qualificationBestOf: 1,
        finalsType: 'double_elimination',
        topCutSize: 8,
        finalsBestOf: 3,
        grandFinalReset: true,
      },
    },
  ];

  const summary = [];
  for (const definition of definitions) {
    summary.push(await seedOne(definition));
  }

  fs.mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    tournaments: summary,
  }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

seed().catch(err => {
  console.error(err.stack || err.message);
  if (err.response) console.error(JSON.stringify(err.response, null, 2));
  process.exitCode = 1;
});
