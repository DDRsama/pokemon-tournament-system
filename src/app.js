const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const express = require('express');
const { createJsonStore } = require('./storage/jsonStore');
const swissCore = require('./core/swiss');
const top8Core = require('./core/top8');
const reportsData = require('./core/reportsData');
const pdfReport = require('./reports/pdfReport');
const playersCore = require('./core/players');
const entrantsCore = require('./core/entrants');
const leaguesCore = require('./core/leagues');
const pointsCore = require('./core/points');
const advancementCore = require('./core/advancement');
const groupsCore = require('./core/groups');
const doubleEliminationCore = require('./core/doubleElimination');
const { createBroadcaster } = require('./realtime/broadcaster');
const { attachTournamentWebSocket } = require('./realtime/websocket');
const { buildPlayerView: buildPlayerViewCore } = require('./core/playerView');
const { PORT, DATA_DIR, PLAYERS_DIR, LEAGUES_DIR, POINTS_DIR, FONTS_DIR, PUBLIC_DIR, PUBLIC_BASE_URL, REPORTS_DIR, PYTHON_BIN, ROOT_DIR } = require('./config');
const stateCore = require('./core/state');
const recordsCore = require('./core/records');
const standingsCore = require('./core/standings');
const stagesCore = require('./core/stages');
const matchesCore = require('./core/matches');
const rulesCore = require('./core/rules');
const presetsCore = require('./core/presets');
const fontsCore = require('./core/fonts');
const finalPlacementsCore = require('./core/finalPlacements');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PLAYERS_DIR, { recursive: true });
fs.mkdirSync(LEAGUES_DIR, { recursive: true });
fs.mkdirSync(POINTS_DIR, { recursive: true });
fs.mkdirSync(FONTS_DIR, { recursive: true });
fs.mkdirSync(REPORTS_DIR, { recursive: true });
const tournamentStore = createJsonStore({ dataDir: DATA_DIR, displayPhaseForTournament });
const playerStore = createJsonStore({
  dataDir: PLAYERS_DIR,
  displayPhaseForTournament: () => 'player',
  getListItemName: data => data.displayName || data.name,
  getListItemDate: data => data.updatedAt || data.createdAt || data._createdAt,
});
const leagueStore = createJsonStore({
  dataDir: LEAGUES_DIR,
  displayPhaseForTournament: () => 'league',
  getListItemName: data => data.name,
  getListItemDate: data => data.updatedAt || data.createdAt || data._createdAt,
});
const pointsStore = createJsonStore({
  dataDir: POINTS_DIR,
  displayPhaseForTournament: () => 'points',
  getListItemName: data => data.name,
  getListItemDate: data => data.updatedAt || data.createdAt || data._createdAt,
});

const app = express();
app.use(express.json());

let wss = null;
let currentTournamentId = null;
let tournaments = new Map();
let playerRegistry = new Map();
let leagueRegistry = new Map();
let pointsRegistry = new Map();
let playerSummaryCache = null;
let playerListWithSummaryCache = null;
let leaguePointAwardsCache = null;

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function invalidateDerivedCaches() {
  playerSummaryCache = null;
  playerListWithSummaryCache = null;
  leaguePointAwardsCache = null;
}

function invalidatePlayerCaches() {
  playerSummaryCache = null;
  playerListWithSummaryCache = null;
}

function getLocalNetworkHost() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry && entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return '127.0.0.1';
}

function getPublicBaseUrl(req = null) {
  if (currentState && currentState.publicBaseUrlOverride) return currentState.publicBaseUrlOverride.replace(/\/$/, '');
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL.replace(/\/$/, '');
  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) return `${proto}://${host}`;
  }
  return `http://${getLocalNetworkHost()}:${PORT}`;
}

function normalizePublicBaseUrlCandidate(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:') throw new Error('目前只支持 http:// 地址');
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/$/, '');
}

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || host === '::1'
    || host === '0:0:0:0:0:0:0:1'
    || host === '127.0.0.1'
    || /^127\./.test(host);
}

function requestJson(url, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 1024 * 1024) req.destroy(new Error('response too large'));
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          resolve({ ok: false, err: `访问失败：HTTP ${res.statusCode}` });
          return;
        }
        try {
          resolve({ ok: true, json: JSON.parse(body) });
        } catch (err) {
          resolve({ ok: false, err: '访问成功，但返回内容不是有效状态数据' });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', err => {
      resolve({ ok: false, err: err.message === 'timeout' ? '访问超时' : `访问失败：${err.message}` });
    });
  });
}

async function validatePublicBaseUrlAccess(baseUrl, tournamentId) {
  const stateUrl = `${baseUrl}/api/tournaments/${encodeURIComponent(tournamentId)}/state`;
  const result = await requestJson(stateUrl);
  if (!result.ok) return result;
  if (!result.json || result.json.tournamentId !== tournamentId) {
    return { ok: false, err: '访问成功，但没有返回当前比赛的状态' };
  }
  return { ok: true, checkedUrl: stateUrl };
}

function getActiveFontConfig() {
  return fontsCore.getActiveFontConfig({ fontsDir: FONTS_DIR, rootDir: ROOT_DIR });
}

function getPdfFontCandidates(language = 'zh-CN') {
  return fontsCore.getPdfFontCandidates({ fontsDir: FONTS_DIR, rootDir: ROOT_DIR, language });
}

function normalizeTop8MatchTables(state = currentState) {
  stateCore.normalizeTop8MatchTables(state);
}

function freshState(overrides = {}) {
  return stateCore.freshState(overrides);
}

let currentState = freshState();
let _dropped = new Set();

function setCurrentTournamentId(id) {
  currentTournamentId = id;
}

function clearResultTimer() {
  if (currentState._resultTimer) {
    clearTimeout(currentState._resultTimer);
    currentState._resultTimer = null;
  }
}

function restoreByeSet(rawByeSet) {
  return stateCore.restoreByeSet(rawByeSet);
}

function restoreState(rawState) {
  return stateCore.restoreState(rawState);
}

function loadPlayerRegistry() {
  const next = new Map();
  for (const item of playerStore.list()) {
    const raw = playerStore.load(item.id);
    if (!raw) continue;
    const profile = playersCore.createPlayerProfile({
      id: item.id,
      displayName: raw.displayName || raw.name || item.name || item.id,
      aliases: raw.aliases || [],
      bindings: raw.bindings || [],
      stats: raw.stats || {},
    });
    profile.createdAt = raw.createdAt || raw._createdAt || Date.now();
    profile.updatedAt = raw.updatedAt || profile.createdAt;
    next.set(item.id, profile);
  }
  playerRegistry = next;
  invalidatePlayerCaches();
}

function savePlayerProfile(profile) {
  const now = Date.now();
  profile.createdAt = profile.createdAt || now;
  profile.updatedAt = now;
  playerStore.save(profile.id, profile);
  playerRegistry.set(profile.id, profile);
  invalidatePlayerCaches();
  return profile;
}

function buildLightPlayerProfile(profile) {
  return {
    ...profile,
    totalPoints: Number(profile.stats?.leaguePoints || 0),
    rankedEvents: Number(profile.stats?.rankedTournamentsPlayed || 0),
  };
}

function listPlayerProfiles(options = {}) {
  const includeSummary = options.includeSummary !== false;
  if (!includeSummary) {
    return [...playerRegistry.values()].map(buildLightPlayerProfile);
  }
  if (playerListWithSummaryCache) return clonePlain(playerListWithSummaryCache);
  const summaries = getPlayerSummaryCache();
  playerListWithSummaryCache = [...playerRegistry.values()].map(profile => {
    const summary = summaries.get(profile.id);
    return {
      ...profile,
      totalPoints: summary ? summary.totalPoints : Number(profile.stats?.leaguePoints || 0),
      rankedEvents: summary ? summary.rankedEvents : Number(profile.stats?.rankedTournamentsPlayed || 0),
    };
  });
  return clonePlain(playerListWithSummaryCache);
}

function createGlobalPlayerProfile(input = {}) {
  assertGlobalPlayerDisplayNameAvailable(input.displayName || input.name);
  return savePlayerProfile(playersCore.createPlayerProfile(input));
}

function getGlobalPlayerProfileById(playerId) {
  return playerRegistry.get(playerId) || null;
}

function getGlobalPlayerProfileByName(name) {
  const target = String(name || '').trim();
  if (!target) return null;
  for (const profile of playerRegistry.values()) {
    if (profile.displayName === target) return profile;
    if (Array.isArray(profile.aliases) && profile.aliases.includes(target)) return profile;
  }
  return null;
}

function assertGlobalPlayerDisplayNameAvailable(displayName, exceptPlayerId = null) {
  const target = String(displayName || '').trim();
  if (!target) throw new Error('missing player displayName');
  const exceptId = String(exceptPlayerId || '').trim();
  for (const profile of playerRegistry.values()) {
    if (exceptId && profile.id === exceptId) continue;
    if (profile.displayName === target || (Array.isArray(profile.aliases) && profile.aliases.includes(target))) {
      throw new Error('player displayName already exists');
    }
  }
}

function replaceExactStringsDeep(value, oldName, newName, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return { value: value === oldName ? newName : value, changed: value === oldName };
  }
  if (!value || typeof value !== 'object') return { value, changed: false };
  if (seen.has(value)) return { value, changed: false };
  seen.add(value);

  let changed = false;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const next = replaceExactStringsDeep(value[index], oldName, newName, seen);
      if (next.changed) {
        value[index] = next.value;
        changed = true;
      }
    }
    return { value, changed };
  }

  for (const key of Object.keys(value)) {
    const next = replaceExactStringsDeep(value[key], oldName, newName, seen);
    const nextKey = key === oldName ? newName : key;
    if (nextKey !== key) {
      delete value[key];
      if (Object.prototype.hasOwnProperty.call(value, nextKey)
        && value[nextKey]
        && typeof value[nextKey] === 'object'
        && next.value
        && typeof next.value === 'object'
        && !Array.isArray(value[nextKey])
        && !Array.isArray(next.value)) {
        value[nextKey] = { ...next.value, ...value[nextKey] };
      } else {
        value[nextKey] = next.value;
      }
      changed = true;
    } else if (next.changed) {
      value[key] = next.value;
      changed = true;
    }
  }
  return { value, changed };
}

function collectProfileBoundNamesInState(state = {}, playerId, fallbackNames = []) {
  const id = String(playerId || '').trim();
  const names = new Set(
    (Array.isArray(fallbackNames) ? fallbackNames : [])
      .map(value => String(value || '').trim())
      .filter(Boolean),
  );
  if (!id) return names;

  for (const entrant of entrantsCore.migrateLegacyEntrants(state)) {
    if (entrant.profileId === id && entrant.displayName) names.add(entrant.displayName);
  }
  for (const [name, entry] of Object.entries(state.playerProfiles || {})) {
    if (entry && entry.globalProfileId === id) {
      if (name) names.add(name);
      if (entry.name) names.add(entry.name);
    }
  }
  for (const award of Array.isArray(state.pointAwards) ? state.pointAwards : []) {
    if (award && award.profileId === id && award.displayName) names.add(award.displayName);
  }
  return names;
}

function getProfileBoundEntrantsInState(state = {}, playerId) {
  const id = String(playerId || '').trim();
  if (!id) return [];
  return entrantsCore.migrateLegacyEntrants(state).filter(entrant => entrant.profileId === id);
}

function normalizeDisplayNameSourceValue(value, fallback = 'profile') {
  const source = String(value || '').trim();
  return ['profile', 'custom', 'manual'].includes(source) ? source : fallback;
}

function profileEntryUsesProfileName(entry = {}) {
  return normalizeDisplayNameSourceValue(entry.displayNameSource, 'profile') === 'profile';
}

function entrantUsesProfileName(entrant = {}) {
  return normalizeDisplayNameSourceValue(entrant.displayNameSource, entrant.profileId ? 'profile' : 'manual') === 'profile';
}

function collectProfileControlledNamesInState(state = {}, playerId, fallbackNames = []) {
  const id = String(playerId || '').trim();
  const fallbackNameSet = new Set(
    (Array.isArray(fallbackNames) ? fallbackNames : [])
      .map(value => String(value || '').trim())
      .filter(Boolean),
  );
  const names = new Set();
  if (!id) return names;

  for (const entrant of entrantsCore.migrateLegacyEntrants(state)) {
    if (entrant.profileId === id && entrant.displayName && entrantUsesProfileName(entrant)) {
      names.add(entrant.displayName);
    }
  }
  for (const [name, entry] of Object.entries(state.playerProfiles || {})) {
    if (entry && entry.globalProfileId === id && profileEntryUsesProfileName(entry)) {
      if (name) names.add(name);
      if (entry.name) names.add(entry.name);
    }
  }
  for (const award of Array.isArray(state.pointAwards) ? state.pointAwards : []) {
    if (award && award.profileId === id && fallbackNameSet.has(award.displayName)) {
      names.add(award.displayName);
    }
  }
  return names;
}

function assertTournamentDisplayNameAvailableForProfile(state = {}, playerId, nextDisplayName) {
  const id = String(playerId || '').trim();
  const nextName = String(nextDisplayName || '').trim();
  if (!id || !nextName) return;
  const hasProfileControlledEntry = getProfileBoundEntrantsInState(state, id).some(entrantUsesProfileName)
    || Object.values(state.playerProfiles || {}).some(entry => entry?.globalProfileId === id && profileEntryUsesProfileName(entry));
  if (!hasProfileControlledEntry) return;
  const collision = entrantsCore.migrateLegacyEntrants(state).find(entrant =>
    entrant.displayName === nextName && entrant.profileId !== id
  );
  if (collision) throw new Error(`player displayName already used in tournament: ${nextName}`);
}

function assertProfileRenameCanSyncAcrossTournaments(playerId, nextDisplayName) {
  if (currentState && currentState._id) {
    assertTournamentDisplayNameAvailableForProfile(currentState, playerId, nextDisplayName);
  }
  for (const item of tournamentStore.list()) {
    if (currentState && currentState._id === item.id) continue;
    const raw = tournamentStore.load(item.id);
    if (!raw) continue;
    const restored = restoreState({ ...raw, _id: raw._id || item.id });
    assertTournamentDisplayNameAvailableForProfile(restored, playerId, nextDisplayName);
  }
}

function replacePlayerNameInState(state = {}, oldName, newName) {
  const from = String(oldName || '').trim();
  const to = String(newName || '').trim();
  if (!state || !from || !to || from === to) return false;
  let changed = false;

  const stringArrayKeys = ['players', 'top8', 'pendingTop8', '_dropped', '_featuredSwissPlayers'];
  for (const key of stringArrayKeys) {
    if (!Array.isArray(state[key])) continue;
    const next = [];
    let localChanged = false;
    for (const value of state[key]) {
      const renamed = value === from ? to : value;
      if (renamed !== value) localChanged = true;
      if (!next.includes(renamed)) next.push(renamed);
    }
    if (localChanged || next.length !== state[key].length) {
      state[key] = next;
      changed = true;
    }
  }

  const deepKeys = [
    'matches',
    'swissMatchHistory',
    'swissMatchesArchive',
    'groupMatchHistory',
    'swissRanking',
    'swissRankingArchive',
    'stageResults',
    'groupAssignments',
    'doubleElimination',
    'pointAwards',
    'playerReports',
    'currentLiveMatch',
    'pendingLiveMatch',
    'lastLiveMatch',
    'lastResult',
    'swissRollbackSnapshots',
  ];
  for (const key of deepKeys) {
    if (state[key] == null) continue;
    const next = replaceExactStringsDeep(state[key], from, to);
    if (next.changed) {
      state[key] = next.value;
      changed = true;
    }
  }

  if (state._dropAfterRound && typeof state._dropAfterRound === 'object') {
    const next = replaceExactStringsDeep(state._dropAfterRound, from, to);
    if (next.changed) {
      state._dropAfterRound = next.value;
      changed = true;
    }
  }

  if (Array.isArray(state.entrants)) {
    state.entrants = state.entrants.map(entrant => {
      if (!entrant || entrant.displayName !== from) return entrant;
      changed = true;
      return entrantsCore.normalizeEntrant({ ...entrant, displayName: to, updatedAt: Date.now() });
    });
  }

  return changed;
}

function syncPlayerProfileRecordInState(state = {}, playerId, displayName, options = {}) {
  const id = String(playerId || '').trim();
  const name = String(displayName || '').trim();
  if (!id || !name) return false;
  if (!state.playerProfiles || typeof state.playerProfiles !== 'object') state.playerProfiles = {};
  const profiles = state.playerProfiles;
  const removeOtherNames = options.removeOtherNames !== false;
  const displayNameSource = normalizeDisplayNameSourceValue(options.displayNameSource, 'profile');
  const existingTarget = profiles[name] || {};
  if (existingTarget.globalProfileId && existingTarget.globalProfileId !== id) {
    throw new Error(`player displayName already used in tournament: ${name}`);
  }

  const matchingEntries = [];
  if (removeOtherNames) {
    for (const [key, entry] of Object.entries(profiles)) {
      if (key === name) continue;
      if (entry && entry.globalProfileId === id) {
        matchingEntries.push({ key, entry });
        delete profiles[key];
      }
    }
  }

  const localPlayerId = existingTarget.playerId
    || matchingEntries.find(item => item.entry?.playerId)?.entry.playerId
    || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  profiles[name] = {
    ...matchingEntries.reduce((acc, item) => ({ ...acc, ...(item.entry || {}) }), {}),
    ...existingTarget,
    playerId: localPlayerId,
    name,
    globalProfileId: id,
    rankedEligible: true,
    displayNameSource,
  };
  return matchingEntries.length > 0
    || existingTarget.name !== name
    || existingTarget.globalProfileId !== id
    || existingTarget.displayNameSource !== displayNameSource;
}

function syncPlayerProfileDisplayNameInState(state = {}, playerId, nextDisplayName, fallbackNames = []) {
  const id = String(playerId || '').trim();
  const nextName = String(nextDisplayName || '').trim();
  if (!state || !id || !nextName) return false;
  assertTournamentDisplayNameAvailableForProfile(state, id, nextName);

  const names = collectProfileControlledNamesInState(state, id, fallbackNames);
  let changed = false;
  for (const oldName of names) {
    if (oldName !== nextName) changed = replacePlayerNameInState(state, oldName, nextName) || changed;
  }

  let profileRecordSeed = null;
  if (state.playerProfiles && typeof state.playerProfiles === 'object') {
    for (const oldName of names) {
      if (oldName === nextName) continue;
      const entry = state.playerProfiles[oldName];
      if (entry && entry.globalProfileId === id && profileEntryUsesProfileName(entry)) {
        profileRecordSeed = profileRecordSeed || entry;
        delete state.playerProfiles[oldName];
        changed = true;
      }
    }
    if (profileRecordSeed && !state.playerProfiles[nextName]) {
      state.playerProfiles[nextName] = {
        ...profileRecordSeed,
        name: nextName,
      };
      changed = true;
    }
  }

  const entrants = entrantsCore.migrateLegacyEntrants(state);
  const boundEntrants = entrants.filter(entrant => entrant.profileId === id);
  const hasProfileControlledEntrant = boundEntrants.some(entrantUsesProfileName);
  if (boundEntrants.length > 0) {
    state.entrants = entrants.map(entrant => {
      if (entrant.profileId !== id) return entrant;
      const shouldFollowProfileName = entrantUsesProfileName(entrant);
      const displayName = shouldFollowProfileName ? nextName : entrant.displayName;
      const displayNameSource = shouldFollowProfileName ? 'profile' : 'custom';
      if (
        entrant.displayName === displayName
        && entrant.displayNameSource === displayNameSource
        && entrant.entryType === 'registered'
        && entrant.rankedEligible
      ) return entrant;
      changed = true;
      return entrantsCore.normalizeEntrant({
        ...entrant,
        displayName,
        displayNameSource,
        entryType: 'registered',
        rankedEligible: true,
        updatedAt: Date.now(),
      });
    });
    if (!Array.isArray(state.players)) state.players = [];
    if (hasProfileControlledEntrant && !state.players.includes(nextName)) {
      state.players.push(nextName);
      changed = true;
    }
  }

  if (hasProfileControlledEntrant || names.size > 0) {
    changed = syncPlayerProfileRecordInState(state, id, nextName, {
      removeOtherNames: false,
      displayNameSource: 'profile',
    }) || changed;
  }
  for (const entrant of boundEntrants) {
    if (entrantUsesProfileName(entrant)) continue;
    changed = syncPlayerProfileRecordInState(state, id, entrant.displayName, {
      removeOtherNames: false,
      displayNameSource: 'custom',
    }) || changed;
  }

  return changed;
}

function syncPlayerProfileDisplayNameAcrossTournaments(playerId, nextDisplayName, fallbackNames = []) {
  const id = String(playerId || '').trim();
  const nextName = String(nextDisplayName || '').trim();
  if (!id || !nextName) return { changed: false, tournaments: [] };
  const changedTournamentIds = [];

  if (currentState && currentState._id && syncPlayerProfileDisplayNameInState(currentState, id, nextName, fallbackNames)) {
    _dropped = new Set(currentState._dropped || []);
    saveState();
    saveCurrentAsCache();
    changedTournamentIds.push(currentState._id);
  }

  for (const item of tournamentStore.list()) {
    if (currentState && currentState._id === item.id) continue;
    const raw = tournamentStore.load(item.id);
    if (!raw) continue;
    const restored = restoreState({ ...raw, _id: raw._id || item.id });
    if (!syncPlayerProfileDisplayNameInState(restored, id, nextName, fallbackNames)) continue;
    const serialized = stateCore.serializeState(restored);
    tournamentStore.save(item.id, serialized);
    tournaments.set(item.id, serialized);
    changedTournamentIds.push(item.id);
  }

  if (changedTournamentIds.length > 0) invalidateDerivedCaches();
  return { changed: changedTournamentIds.length > 0, tournaments: changedTournamentIds };
}

function getGlobalPlayerProfileReferences(playerId) {
  const id = String(playerId || '').trim();
  if (!id) return [];
  const refs = [];
  const seen = new Set();
  const push = (type, refId, name) => {
    const key = `${type}:${refId}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ type, id: refId, name });
  };

  const profile = getGlobalPlayerProfileById(id);
  if (profile && Array.isArray(profile.bindings) && profile.bindings.length > 0) {
    push('binding', id, profile.displayName || id);
  }

  for (const [name, entry] of Object.entries(currentState.playerProfiles || {})) {
    if (entry && entry.globalProfileId === id) {
      push('current', currentState._id || '', currentState.tournamentName || name);
      break;
    }
  }

  const summary = buildGlobalPlayerSummary(id);
  if (summary) {
    for (const item of Array.isArray(summary.tournaments) ? summary.tournaments : []) {
      push('tournament', item.tournamentId || '', item.tournamentName || item.tournamentId || id);
    }
    for (const award of Array.isArray(summary.awards) ? summary.awards : []) {
      push('award', award.tournamentId || '', award.tournamentName || award.tournamentId || id);
    }
  }

  return refs;
}

function updateGlobalPlayerProfile(playerId, patch = {}) {
  const current = getGlobalPlayerProfileById(playerId);
  if (!current) return null;
  const nextDisplayName = String(patch.displayName || patch.name || current.displayName || '').trim();
  if (!nextDisplayName) throw new Error('missing player displayName');
  assertGlobalPlayerDisplayNameAvailable(nextDisplayName, current.id);
  if (current.displayName !== nextDisplayName) {
    assertProfileRenameCanSyncAcrossTournaments(current.id, nextDisplayName);
  }
  const sourceAliases = Array.isArray(patch.aliases) ? patch.aliases : current.aliases;
  const aliases = new Set((Array.isArray(sourceAliases) ? sourceAliases : [])
    .map(value => String(value || '').trim())
    .filter(Boolean));
  if (current.displayName && current.displayName !== nextDisplayName) {
    aliases.add(current.displayName);
  }
  aliases.delete(nextDisplayName);
  const updated = playersCore.createPlayerProfile({
    id: current.id,
    displayName: nextDisplayName,
    aliases: [...aliases],
    bindings: Array.isArray(current.bindings) ? current.bindings : [],
    stats: current.stats || {},
  });
  updated.createdAt = current.createdAt || updated.createdAt;
  const saved = savePlayerProfile(updated);
  if (current.displayName !== nextDisplayName) {
    syncPlayerProfileDisplayNameAcrossTournaments(current.id, nextDisplayName, [
      current.displayName,
      ...(Array.isArray(current.aliases) ? current.aliases : []),
    ]);
  }
  return saved;
}

function deleteGlobalPlayerProfile(playerId) {
  const current = getGlobalPlayerProfileById(playerId);
  if (!current) return { ok: false, err: 'player profile not found' };
  const refs = getGlobalPlayerProfileReferences(playerId);
  if (refs.length > 0) {
    return { ok: false, err: 'player profile is in use', references: refs };
  }
  playerRegistry.delete(current.id);
  playerStore.remove(current.id);
  invalidatePlayerCaches();
  return { ok: true, player: current };
}

function bindGuestEntrantToGlobalProfile(entrant, playerId) {
  const profile = getGlobalPlayerProfileById(playerId);
  if (!profile) return null;
  return playersCore.bindEntrantToProfile(entrant, profile);
}

function loadLeagueRegistry() {
  const next = new Map();
  for (const item of leagueStore.list()) {
    const raw = leagueStore.load(item.id);
    if (!raw) continue;
    const league = leaguesCore.createLeague({
      id: item.id,
      name: raw.name || item.name || item.id,
      seasonLabel: raw.seasonLabel || '',
      game: raw.game || 'vgc',
      divisions: raw.divisions || ['open'],
      regions: raw.regions || [],
      pointsProfileId: raw.pointsProfileId || null,
      tournamentBindings: raw.tournamentBindings || [],
      includedTournamentIds: raw.includedTournamentIds || [],
      finalTournamentIds: raw.finalTournamentIds || [],
      bestFinishLimit: raw.bestFinishLimit || null,
    });
    league.createdAt = raw.createdAt || raw._createdAt || Date.now();
    league.updatedAt = raw.updatedAt || league.createdAt;
    next.set(item.id, league);
  }
  leagueRegistry = next;
  invalidateDerivedCaches();
}

function saveLeague(league) {
  const now = Date.now();
  league.createdAt = league.createdAt || now;
  league.updatedAt = now;
  leagueStore.save(league.id, league);
  leagueRegistry.set(league.id, league);
  invalidateDerivedCaches();
  return league;
}

function listLeagues() {
  return [...leagueRegistry.values()].map(league => ({ ...league }));
}

function getLeagueById(leagueId) {
  const id = String(leagueId || '').trim();
  return id ? leagueRegistry.get(id) || null : null;
}

function createLeague(input = {}) {
  return saveLeague(leaguesCore.createLeague(input));
}

function updateLeague(leagueId, patch = {}) {
  const current = getLeagueById(leagueId);
  if (!current) return null;
  return saveLeague(leaguesCore.createLeague({
    ...current,
    ...patch,
    id: current.id,
  }));
}

function deleteLeague(leagueId) {
  const league = getLeagueById(leagueId);
  if (!league) return { ok: false, err: 'league not found' };
  leagueRegistry.delete(league.id);
  leagueStore.remove(league.id);
  invalidateDerivedCaches();
  return { ok: true, league };
}

function loadPointsRegistry() {
  const next = new Map();
  for (const item of pointsStore.list()) {
    const raw = pointsStore.load(item.id);
    if (!raw) continue;
    const profile = pointsCore.createPointsProfile({
      id: item.id,
      name: raw.name || item.name || item.id,
      participationPoints: raw.participationPoints,
      placementPoints: raw.placementPoints,
      eventTierMultiplier: raw.eventTierMultiplier,
      bestFinishLimit: raw.bestFinishLimit,
    });
    profile.createdAt = raw.createdAt || raw._createdAt || Date.now();
    profile.updatedAt = raw.updatedAt || profile.createdAt;
    next.set(item.id, profile);
  }
  if (!next.size) {
    const defaultProfile = pointsCore.createPointsProfile({
      id: 'default_ranked',
      name: 'Default Ranked Points',
      participationPoints: 1,
      placementPoints: [
        { rank: 1, points: 30 },
        { rank: 2, points: 24 },
        { rankMin: 3, rankMax: 4, points: 18 },
        { rankMin: 5, rankMax: 8, points: 12 },
      ],
    });
    defaultProfile.createdAt = Date.now();
    defaultProfile.updatedAt = defaultProfile.createdAt;
    pointsStore.save(defaultProfile.id, defaultProfile);
    next.set(defaultProfile.id, defaultProfile);
  }
  pointsRegistry = next;
  invalidateDerivedCaches();
}

function savePointsProfile(profile) {
  const now = Date.now();
  profile.createdAt = profile.createdAt || now;
  profile.updatedAt = now;
  pointsStore.save(profile.id, profile);
  pointsRegistry.set(profile.id, profile);
  invalidateDerivedCaches();
  return profile;
}

function createPointsProfile(input = {}) {
  return savePointsProfile(pointsCore.createPointsProfile(input));
}

function updatePointsProfile(profileId, patch = {}) {
  const current = getPointsProfileById(profileId);
  if (!current) return null;
  return savePointsProfile(pointsCore.createPointsProfile({
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
  }));
}

function getPointsProfileReferences(profileId) {
  const id = String(profileId || '').trim();
  if (!id) return [];
  const refs = [];
  for (const league of listLeagues()) {
    if (league.pointsProfileId === id) {
      refs.push({ type: 'league', id: league.id, name: league.name || league.id });
    }
    for (const binding of leaguesCore.normalizeTournamentBindings(league)) {
      if (binding.pointsProfileId === id) {
        refs.push({ type: 'leagueTournament', id: league.id, name: `${league.name || league.id} / ${binding.tournamentId}` });
      }
    }
  }
  return refs;
}

function deletePointsProfile(profileId) {
  const id = String(profileId || '').trim();
  const current = getPointsProfileById(id);
  if (!current) return { ok: false, err: 'points profile not found' };
  const refs = getPointsProfileReferences(id);
  if (refs.length > 0) {
    return { ok: false, err: 'points profile is in use', references: refs };
  }
  pointsStore.remove(id);
  pointsRegistry.delete(id);
  invalidateDerivedCaches();
  return { ok: true, pointsProfile: current };
}

function listPointsProfiles() {
  return [...pointsRegistry.values()].map(profile => ({ ...profile }));
}

function getPointsProfileById(profileId) {
  const id = String(profileId || '').trim();
  return id ? pointsRegistry.get(id) || null : null;
}

function getDefaultPointsProfile() {
  return getPointsProfileById('default_ranked') || listPointsProfiles()[0] || pointsCore.createPointsProfile();
}

function getDropAfterRound(player) {
  const table = currentState._dropAfterRound || {};
  const value = table[player];
  return typeof value === 'number' ? value : null;
}

function setDropAfterRound(player, roundNumber) {
  currentState._dropAfterRound = {
    ...(currentState._dropAfterRound || {}),
    [player]: roundNumber,
  };
}

function isActiveForRound(player, roundNumber) {
  if (!player || player === 'BYE') return false;
  const dropAfterRound = getDropAfterRound(player);
  return dropAfterRound === null || dropAfterRound >= roundNumber;
}

function getPostMatchOverlayState() {
  if (currentState.phase === 'done') {
    if (currentState.overlayState === 'swiss-ended') return 'swiss-ended';
    const activeStage = stagesCore.getActiveStage(currentState);
    if (activeStage?.type === 'single_elimination' || activeStage?.type === 'double_elimination') return 'podium';
    return currentState.overlayState === 'podium' ? 'podium' : 'overview';
  }
  if (currentState.phase === 'top8') {
    const activeStage = stagesCore.getActiveStage(currentState);
    const bracketSize = top8Core.normalizeBracketSize(activeStage?.elimination?.bracketSize || currentState.top8?.length || 8, 8);
    return activeStage?.id === 'stage_top_cut_1' && bracketSize === 8 ? 'top8-bracket' : 'overview';
  }
  return 'overview';
}

function getCurrentGroupRoundForState(state = currentState, stage = null) {
  const activeStage = stage || stagesCore.getActiveStage(state);
  return groupsCore.getCurrentGroupRound(state, activeStage);
}

function getGroupRoundCountForState(state = currentState, stage = null) {
  const activeStage = stage || stagesCore.getActiveStage(state);
  return activeStage ? groupsCore.getGroupRoundCount(groupsCore.getGroupMatches(state, activeStage.id)) : 0;
}

function normalizeActiveGroupSchedules(state = currentState) {
  const stages = stagesCore.getStages(state);
  let changed = false;
  for (const stage of stages) {
    if (stage.type === 'groups' || stage.type === 'group_round_robin') {
      changed = groupsCore.normalizeGroupSchedule(state, stage) || changed;
    }
  }
  return changed;
}

function isGameScoreStage(stage) {
  const rules = stage && stage.matchRules ? stage.matchRules : {};
  return rulesCore.usesGameScore(rules, stage);
}

function getLiveOverlayStateForMatch(match, result = false) {
  const stage = getMatchStage(match);
  if (isGameScoreStage(stage)) return result ? 'top8-result' : 'top8-live';
  return result ? 'result' : 'live';
}

function resetCurrentState(nextState) {
  clearResultTimer();
  currentState = restoreState(nextState);
  _dropped = new Set(currentState._dropped || []);
  normalizeTop8MatchTables(currentState);
  normalizeActiveGroupSchedules(currentState);
  top8Core.repairSingleEliminationBracketShape(currentState);
  if (currentState.phase === 'top8') top8Core.advanceBracket(currentState);
  finishSingleEliminationIfComplete(currentState);
  invalidateDerivedCaches();

  if (currentState.phase === 'setup') currentState.overlayState = 'idle';
  else if (currentState.phase === 'swiss-ended' || (currentState.phase === 'done' && currentState.overlayState === 'swiss-ended')) {
    currentState.overlayState = 'swiss-ended';
  } else if (currentState.phase === 'done' && currentState.overlayState === 'podium') {
    currentState.overlayState = 'podium';
  }
  else if (currentState.phase === 'top8') {
    currentState.overlayState = currentState.currentLiveMatch ? getLiveOverlayStateForMatch(currentState.currentLiveMatch) : getPostMatchOverlayState();
  } else if (currentState.phase === 'groups' || currentState.phase === 'double_elimination') {
    currentState.overlayState = currentState.currentLiveMatch ? getLiveOverlayStateForMatch(currentState.currentLiveMatch) : 'overview';
  } else {
    currentState.overlayState = currentState.currentLiveMatch ? getLiveOverlayStateForMatch(currentState.currentLiveMatch) : 'overview';
  }
}

function emptyRecord() {
  return recordsCore.emptyRecord();
}

function getRecordBeforeRound(player, roundNumber, state = currentState) {
  return recordsCore.getRecordBeforeRound(player, roundNumber, state);
}

function getRecord(player, state = currentState) {
  return recordsCore.getRecord(player, state);
}

function upsertSwissMatchHistory(match) {
  if (typeof match.round !== 'number') return;
  const history = currentState.swissMatchHistory || [];
  const idx = history.findIndex(item => item.id === match.id);
  const round = match.round;
  const snapshot = {
    id: match.id,
    table: match.table,
    round,
    p1: match.p1,
    p2: match.p2,
    p1RecordBefore: getRecordBeforeRound(match.p1, round),
    p2RecordBefore: getRecordBeforeRound(match.p2, round),
    winner: match.winner ?? null,
    done: !!match.done,
    draw: !!match.draw,
    p1Wins: match.p1Wins || 0,
    p2Wins: match.p2Wins || 0,
    preMatchDroppedPlayer: match.preMatchDroppedPlayer || null,
    postMatchDroppedPlayer: match.postMatchDroppedPlayer || null,
    wasLive: !!match.wasLive,
  };
  if (idx >= 0) history[idx] = snapshot;
  else history.push(snapshot);
  history.sort((a, b) => (a.round - b.round) || ((a.table || 0) - (b.table || 0)));
  currentState.swissMatchHistory = history;
  rebuildSwissMatchesArchive();
}

function rebuildSwissMatchesArchive() {
  currentState.swissMatchesArchive = currentState.matches
    .filter(m => typeof m.round === 'number')
    .map(m => ({
      id: m.id,
      table: m.table,
      round: m.round,
      p1: m.p1,
      p2: m.p2,
      winner: m.winner ?? null,
      done: !!m.done,
      draw: !!m.draw,
      p1Wins: m.p1Wins || 0,
      p2Wins: m.p2Wins || 0,
      preMatchDroppedPlayer: m.preMatchDroppedPlayer || null,
      postMatchDroppedPlayer: m.postMatchDroppedPlayer || null,
      wasLive: !!m.wasLive,
      liveRoomCode: m.liveRoomCode || null,
    }));
}

function syncSwissHistoryForRound(round) {
  currentState.matches
    .filter(m => m.round === round)
    .forEach(upsertSwissMatchHistory);
  rebuildSwissMatchesArchive();
}

function ensureSwissRollbackSnapshots() {
  if (!Array.isArray(currentState.swissRollbackSnapshots)) currentState.swissRollbackSnapshots = [];
  return currentState.swissRollbackSnapshots;
}

function createSwissRollbackSnapshot(reason) {
  const snapshot = serializeCurrentState();
  delete snapshot.swissRollbackSnapshots;
  return {
    reason,
    fromRound: currentState.round,
    at: Date.now(),
    state: JSON.parse(JSON.stringify(snapshot)),
  };
}

function pushSwissRollbackSnapshot(reason) {
  const snapshots = ensureSwissRollbackSnapshots();
  snapshots.push(createSwissRollbackSnapshot(reason));
  const maxSnapshots = Math.max(8, (currentState.swissRounds || 0) + 2);
  if (snapshots.length > maxSnapshots) snapshots.splice(0, snapshots.length - maxSnapshots);
}

function clearSwissRoundTransientState() {
  clearResultTimer();
  currentState.currentLiveMatch = null;
  currentState.pendingLiveMatch = null;
  currentState.lastLiveMatch = null;
  currentState.lastResult = null;
  currentState.overlayState = 'overview';
  currentState.playerReports = {};
}

function getCompletedSwissMatches() {
  return standingsCore.getCompletedSwissMatches(currentState);
}

function getSwissOpponents(player) {
  return standingsCore.getSwissOpponents(player, currentState);
}

function getActualCompletedSwissMatchesForPlayer(player) {
  return standingsCore.getActualCompletedSwissMatchesForPlayer(player, currentState);
}

function getPlayerWinPercentage(player) {
  return standingsCore.getPlayerWinPercentage(player, currentState);
}

function getHeadToHeadSweep(a, b) {
  return standingsCore.getHeadToHeadSweep(a, b, currentState);
}

function buildStandingEntry(player) {
  return standingsCore.buildStandingEntry(player, currentState, _dropped);
}

function hasPlayedEachOther(a, b) {
  return swissCore.hasPlayedEachOther(currentState.matches, a, b);
}

function pairPlayersWithinGroup(players) {
  return swissCore.pairPlayersWithinGroup(players, currentState.matches);
}

function getSortedStandings(includeDropped = true) {
  return standingsCore.getSortedStandings(currentState, includeDropped, _dropped);
}

function getSwissStage() {
  return stagesCore.getStages(currentState).find(stage => stage.type === 'swiss') || null;
}

function getTopCutStage() {
  return stagesCore.getStages(currentState).find(stage => stage.type === 'single_elimination') || null;
}

function getMatchStage(match, state = currentState) {
  if (!match) return null;
  if (match.stageId) return stagesCore.getStageById(state, match.stageId);
  if (typeof match.round === 'number') return stagesCore.getStages(state).find(stage => stage.type === 'swiss') || null;
  if (match.phase) return stagesCore.getStages(state).find(stage => stage.type === 'single_elimination') || null;
  return stagesCore.getActiveStage(state);
}

function getMatchRulesForMatch(match, state = currentState) {
  return getMatchStage(match, state)?.matchRules || {};
}

function ensureEntrantsList() {
  currentState.entrants = entrantsCore.migrateLegacyEntrants(currentState);
  return currentState.entrants;
}

function getEntrantByName(name) {
  return entrantsCore.findEntrantByDisplayName(ensureEntrantsList(), name);
}

function upsertTournamentEntrant(entrant) {
  currentState.entrants = entrantsCore.upsertEntrant(ensureEntrantsList(), entrant);
  return entrantsCore.findEntrantByDisplayName(currentState.entrants, entrant.displayName);
}

function createGuestTournamentEntrant(name, source = 'manual') {
  return entrantsCore.createGuestEntrant({
    tournamentId: currentState._id,
    displayName: name,
    source,
  });
}

function addPlayer(name) {
  name = (name || '').trim();
  if (name && !currentState.players.includes(name) && !_dropped.has(name) && currentState.players.length < 64) {
    currentState.players.push(name);
    if (!currentState.playerProfiles) currentState.playerProfiles = {};
    if (!currentState.playerProfiles[name]) {
      const globalProfile = getGlobalPlayerProfileByName(name);
      currentState.playerProfiles[name] = {
        playerId: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        globalProfileId: globalProfile ? globalProfile.id : null,
      };
    }
    const profile = currentState.playerProfiles[name];
    upsertTournamentEntrant({
      ...(getEntrantByName(name) || createGuestTournamentEntrant(name)),
      profileId: profile.globalProfileId || null,
      entryType: profile.globalProfileId ? 'registered' : 'guest',
      source: profile.globalProfileId ? 'manual_bound_profile' : 'manual',
      rankedEligible: !!profile.globalProfileId || profile.rankedEligible === true,
    });
    return true;
  }
  return false;
}

function removePlayer(name) {
  currentState.players = currentState.players.filter(p => p !== name);
  currentState.entrants = entrantsCore.removeEntrantByDisplayName(ensureEntrantsList(), name);
  if (currentState.playerProfiles) delete currentState.playerProfiles[name];
}

function dropPlayer(name) {
  name = (name || '').trim();
  if (!name) return;
  _dropped.add(name);
  if (!currentState.players.includes(name)) currentState.players.push(name);
  setDropAfterRound(name, currentState.round);
  if (!getEntrantByName(name)) upsertTournamentEntrant(createGuestTournamentEntrant(name, 'drop'));
  currentState.entrants = entrantsCore.markEntrantDropped(ensureEntrantsList(), name, currentState.round);

  const activeRound = currentState.round;
  for (const m of currentState.matches) {
    if (m.round !== activeRound || m.done) continue;
    let opponent = null;
    if (m.p1 === name) opponent = m.p2;
    else if (m.p2 === name) opponent = m.p1;
    if (!opponent || opponent === 'BYE') continue;

    m.winner = opponent;
    m.done = true;
    if (currentState.phase === 'top8') {
      m.p1Wins = opponent === m.p1 ? 2 : 0;
      m.p2Wins = opponent === m.p2 ? 2 : 0;
    } else {
      m.p1Wins = opponent === m.p1 ? 1 : 0;
      m.p2Wins = opponent === m.p2 ? 1 : 0;
    }
    m.droppedOpponent = name;
    m.postMatchDroppedPlayer = name;
    upsertSwissMatchHistory(m);
  }
}

function startSwiss(rounds) {
  clearResultTimer();
  const stage = getSwissStage();
  const ok = swissCore.startSwiss(currentState, rounds, getSortedStandings(false), {
    isActiveForRound,
    stageId: stage?.id || 'stage_swiss_1',
  });
  if (!ok) return false;
  currentState.activeStageId = stage?.id || 'stage_swiss_1';
  rebuildSwissMatchesArchive();
  syncSwissHistoryForRound(currentState.round);
  return true;
}

function generateRoundMatches() {
  const stage = getSwissStage();
  const result = swissCore.createRoundMatches(currentState, getSortedStandings(false), {
    isActiveForRound,
    stageId: stage?.id || 'stage_swiss_1',
  });
  swissCore.replaceRoundMatches(currentState, result.matches, result.byeSet);
  syncSwissHistoryForRound(currentState.round);
}

function nextRound() {
  const canAdvance = swissCore.canAdvanceRound(currentState);
  if (!canAdvance.ok) return canAdvance;
  clearSwissRoundTransientState();
  pushSwissRollbackSnapshot('next-round');
  currentState.swissRounds = Math.max(Number(currentState.swissRounds || 0), Number(currentState.round || 0) + 1);
  currentState.round++;
  generateRoundMatches();
  return { ok: true };
}

function revertRound() {
  if (currentState.phase !== 'swiss') return { ok: false, err: 'not in swiss phase' };
  if (currentState.round <= 1) return { ok: false, err: 'cannot revert the first swiss round' };
  const snapshots = ensureSwissRollbackSnapshots();
  if (snapshots.length === 0) return { ok: false, err: 'no rollback snapshot available' };
  const snapshot = snapshots.pop();
  const remainingSnapshots = snapshots;
  resetCurrentState({
    ...snapshot.state,
    swissRollbackSnapshots: remainingSnapshots,
  });
  clearSwissRoundTransientState();
  return { ok: true };
}

function endSwiss() {
  const stage = getSwissStage();
  const standings = getSortedStandings(true);
  swissCore.endSwiss(currentState, standings);
  const hasNextStage = !!stage?.advancement?.targetStageId;
  const advancementCount = Number(stage?.advancement?.count);
  const advancerCount = hasNextStage && Number.isInteger(advancementCount) && advancementCount > 0
    ? advancementCount
    : 0;
  if (!hasNextStage) currentState.pendingTop8 = null;
  advancementCore.setStageResult(currentState, stage?.id || 'stage_swiss_1', {
    standings: currentState.swissRanking || swissCore.buildSwissRanking(standings),
    advancers: advancementCore.buildAdvancersFromStandings(
      standings.filter(entry => !entry.dropped),
      advancerCount,
    ),
    metadata: {
      roundCount: currentState.round,
      scheduledRoundCount: currentState.swissRounds,
      advancementMode: hasNextStage ? (stage?.advancement?.mode || 'top_cut') : 'none',
    },
  });
  if (!hasNextStage) {
    currentState.phase = 'done';
    currentState.overlayState = 'swiss-ended';
    currentState.activeStageId = stage?.id || 'stage_swiss_1';
  }
  rebuildSwissMatchesArchive();
}

function enterTop8() {
  rebuildSwissMatchesArchive();
  const stage = getTopCutStage();
  if (stage?.elimination?.bracketSize && Array.isArray(currentState.pendingTop8)) {
    currentState.pendingTop8 = currentState.pendingTop8.slice(0, stage.elimination.bracketSize);
  }
  currentState.activeStageId = stage?.id || 'stage_top_cut_1';
  return top8Core.enterSingleElimination(currentState, stage);
}

function cancelTop8Confirm() {
  top8Core.cancelTop8Confirm(currentState);
}

function swapMatchSeats(matchId) {
  const match = currentState.matches.find(m => m.id === matchId);
  if (!match || match.done || !matchesCore.isMatchReady(match)) return false;
  const oldP1 = match.p1;
  const oldP2 = match.p2;
  const oldP1Wins = match.p1Wins || 0;
  const oldP2Wins = match.p2Wins || 0;
  match.p1 = oldP2;
  match.p2 = oldP1;
  match.p1Wins = oldP2Wins;
  match.p2Wins = oldP1Wins;
  if (match.winner === oldP1) match.winner = match.p2;
  else if (match.winner === oldP2) match.winner = match.p1;
  if (currentState.currentLiveMatch && currentState.currentLiveMatch.id === matchId) currentState.currentLiveMatch = { ...match };
  if (currentState.lastLiveMatch && currentState.lastLiveMatch.id === matchId) {
    currentState.lastLiveMatch = { ...currentState.lastLiveMatch, p1: match.p1, p2: match.p2 };
  }
  if (currentState.lastResult && currentState.lastResult.p1 === oldP1 && currentState.lastResult.p2 === oldP2) {
    currentState.lastResult = { ...currentState.lastResult, p1: match.p1, p2: match.p2, p1Wins: match.p1Wins, p2Wins: match.p2Wins, winner: match.winner || currentState.lastResult.winner };
  }
  return true;
}

function dropPlayerFromMatch(matchId, playerName) {
  const match = currentState.matches.find(m => m.id === matchId);
  if (!match) return false;
  const player = (playerName || '').trim();
  if (!player || (match.p1 !== player && match.p2 !== player)) return false;
  if (!match.done && !matchesCore.isMatchReady(match)) return false;
  _dropped.add(player);
  if (!currentState.players.includes(player)) currentState.players.push(player);
  if (!match.done) {
    const opponent = match.p1 === player ? match.p2 : match.p1;
    match.preMatchDroppedPlayer = player;
    match.winner = opponent;
    match.done = true;
    match.draw = false;
    match.p1Wins = opponent === match.p1 ? 1 : 0;
    match.p2Wins = opponent === match.p2 ? 1 : 0;
    setDropAfterRound(player, currentState.round - 1);
    upsertSwissMatchHistory(match);
  } else {
    setDropAfterRound(player, currentState.round);
    match.postMatchDroppedPlayer = player;
    upsertSwissMatchHistory(match);
  }
  return true;
}

function applyDraw(matchId) {
  const match = currentState.matches.find(m => m.id === matchId);
  if (!match) return false;
  const rules = getMatchRulesForMatch(match);
  if (rules.allowDraw === false) return false;
  if (!matchesCore.applyDrawToMatch(match)) return false;
  const isLive = currentState.currentLiveMatch && currentState.currentLiveMatch.id === matchId;
  if (isLive) {
    clearResultTimer();
    currentState.overlayState = getLiveOverlayStateForMatch(match, true);
    currentState.lastResult = {
      winner: 'Draw',
      p1: match.p1,
      p2: match.p2,
      phase: currentState.phase,
      draw: true,
      p1Wins: 0,
      p2Wins: 0,
    };
    currentState.currentLiveMatch = null;
    currentState._resultTimer = setTimeout(() => {
      currentState._resultTimer = null;
      currentState.lastResult = null;
      currentState.overlayState = getPostMatchOverlayState();
      broadcast();
    }, 3500);
  }
  upsertSwissMatchHistory(match);
  return true;
}

function applyResult(matchId, winnerId) {
  const match = currentState.matches.find(m => m.id === matchId);
  if (!match) return false;
  if (!matchesCore.applyMatchWinner(match, winnerId)) return false;
  const isLive = currentState.currentLiveMatch && currentState.currentLiveMatch.id === matchId;
  upsertSwissMatchHistory(match);
  if (currentState.phase === 'top8') advanceBracket();
  const finishedSingleElimination = finishSingleEliminationIfComplete();
  if (isLive) {
    clearResultTimer();
    currentState.overlayState = getLiveOverlayStateForMatch(match, true);
    currentState.lastResult = {
      winner: match.winner,
      p1: match.p1,
      p2: match.p2,
      phase: match.phase || currentState.phase,
      p1Wins: match.p1Wins,
      p2Wins: match.p2Wins,
    };
    currentState.currentLiveMatch = null;
    currentState._resultTimer = setTimeout(() => {
      currentState._resultTimer = null;
      currentState.lastResult = null;
      currentState.overlayState = getPostMatchOverlayState();
      broadcast();
    }, 3500);
  }
  if (currentState.phase === 'double_elimination') {
    const stage = getMatchStage(match);
    const changed = doubleEliminationCore.advanceDoubleElimination(currentState, stage);
    if (changed) {
      saveState();
      broadcast();
    }
  }
  if (finishedSingleElimination && !isLive) currentState.overlayState = 'podium';
  return true;
}

function applyBo3Score(matchId, p1Wins, p2Wins) {
  const match = currentState.matches.find(m => m.id === matchId);
  if (!match) return false;
  const rules = getMatchRulesForMatch(match);
  if (!matchesCore.applyGameScoreToMatch(match, p1Wins, p2Wins, { matchRules: rules, bestOf: rules.bestOf || 3 })) return false;
  const isLive = currentState.currentLiveMatch && currentState.currentLiveMatch.id === matchId;
  if (isLive) {
    currentState.currentLiveMatch = { ...match };
  }
  if (currentState.phase === 'top8' && match.done) advanceBracket();
  const finishedSingleElimination = finishSingleEliminationIfComplete();
  if (isLive && match.done) {
    clearResultTimer();
    currentState.overlayState = getLiveOverlayStateForMatch(match, true);
    currentState.lastResult = {
      winner: match.winner,
      p1: match.p1,
      p2: match.p2,
      phase: match.phase || currentState.phase,
      p1Wins: match.p1Wins,
      p2Wins: match.p2Wins,
    };
    currentState.currentLiveMatch = null;
    currentState._resultTimer = setTimeout(() => {
      currentState._resultTimer = null;
      currentState.lastResult = null;
      currentState.overlayState = getPostMatchOverlayState();
      broadcast();
    }, 3500);
  }
  if (currentState.phase === 'double_elimination' && match.done) {
    const stage = getMatchStage(match);
    const changed = doubleEliminationCore.advanceDoubleElimination(currentState, stage);
    if (changed) {
      saveState();
      broadcast();
    }
  }
  if (finishedSingleElimination && !isLive) currentState.overlayState = 'podium';
  return true;
}

function advanceBracket() {
  const activeStage = stagesCore.getActiveStage(currentState);
  const bracketSize = top8Core.normalizeBracketSize(activeStage?.elimination?.bracketSize || currentState.top8?.length || 8, 8);
  const changed = activeStage?.type === 'single_elimination' && (activeStage.id !== 'stage_top_cut_1' || bracketSize !== 8)
    ? top8Core.advanceSingleEliminationBracket(currentState)
    : top8Core.advanceBracket(currentState);
  if (changed) {
    saveState();
    broadcast();
  }
}

function buildSingleEliminationCompletion(state, stage) {
  if (!stage || stage.type !== 'single_elimination') return null;
  if (!top8Core.isSingleEliminationStageFinished(state, stage)) return null;
  const matches = top8Core.getSingleEliminationStageMatches(state, stage);
  const final = matches.find(match => match.phase === 'Finals' && match.done);
  const bronze = matches.find(match => match.phase === 'Bronze Match' && match.done);
  const standings = [];
  if (final?.winner) {
    standings.push({ rank: 1, player: final.winner });
    const runnerUp = final.winner === final.p1 ? final.p2 : final.p1;
    if (runnerUp) standings.push({ rank: 2, player: runnerUp });
  }
  if (bronze?.winner) {
    standings.push({ rank: 3, player: bronze.winner });
    const fourth = bronze.winner === bronze.p1 ? bronze.p2 : bronze.p1;
    if (fourth) standings.push({ rank: 4, player: fourth });
  }
  return {
    standings,
    advancers: final?.winner ? [final.winner] : [],
    metadata: { champion: final?.winner || null },
  };
}

function finishSingleEliminationIfComplete(state = currentState) {
  const stage = stagesCore.getActiveStage(state);
  if (!stage || stage.type !== 'single_elimination') return false;
  if (state.phase !== 'top8' && state.phase !== 'done') return false;
  const result = buildSingleEliminationCompletion(state, stage);
  if (!result) return false;
  advancementCore.setStageResult(state, stage.id, result);
  state.phase = 'done';
  state.overlayState = 'podium';
  return true;
}

function getStageAdvancementTarget(stage = null) {
  if (!stage || !stage.advancement || !stage.advancement.targetStageId) return null;
  return stagesCore.getStageById(currentState, stage.advancement.targetStageId);
}

function getEffectiveStageForStart(stage = null) {
  if (!stage || stage.type !== 'single_elimination') return stage;
  const entrants = advancementCore.getEntryListForStage(currentState, stage);
  const requestedSize = top8Core.normalizeBracketSize(stage.elimination?.bracketSize || entrants.length || 8, 8);
  return {
    ...stage,
    elimination: {
      ...(stage.elimination || {}),
      bracketSize: requestedSize,
    },
  };
}

function advanceTournamentStage(stageId) {
  const stage = stagesCore.getStageById(currentState, stageId);
  if (!stage) return { ok: false, err: 'stage not found' };
  currentState.activeStageId = stage.id;

  if (stage.type === 'swiss') {
    const targetStage = getStageAdvancementTarget(stage);
    const stageResult = advancementCore.getStageResult(currentState, stage.id);
    if (targetStage && stageResult && currentState.phase !== 'swiss') {
      const result = startTournamentStage(targetStage.id);
      if (!result.ok) return result;
      return { ok: true, stage: stagesCore.buildStageViewModel(currentState, targetStage.id), advancedFrom: stage.id };
    }
    if (currentState.phase !== 'swiss') return { ok: false, err: 'not in swiss phase' };
    const result = nextRound();
    if (!result.ok) return result;
    return { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id) };
  }

  if (stage.type === 'groups' || stage.type === 'group_round_robin') {
    const targetStage = getStageAdvancementTarget(stage);
    const stageResult = advancementCore.getStageResult(currentState, stage.id);
    if (targetStage && stageResult && currentState.phase !== 'groups') {
      groupsCore.archiveGroupMatches(currentState, stage.id);
      const result = startTournamentStage(targetStage.id);
      if (!result.ok) return result;
      return { ok: true, stage: stagesCore.buildStageViewModel(currentState, targetStage.id), advancedFrom: stage.id };
    }
    if (currentState.phase !== 'groups') return { ok: false, err: 'not in groups phase' };
    const result = groupsCore.advanceGroupRound(currentState, stage);
    if (!result.ok) return result;
    return {
      ok: true,
      stage: stagesCore.buildStageViewModel(currentState, stage.id),
      groupRound: result.groupRound,
      roundCount: result.roundCount,
    };
  }

  const targetStage = getStageAdvancementTarget(stage);
  if (targetStage) {
    if (!advancementCore.getStageResult(currentState, stage.id)) {
      return { ok: false, err: 'stage result not ready' };
    }
    const result = startTournamentStage(targetStage.id);
    if (!result.ok) return result;
    return { ok: true, stage: stagesCore.buildStageViewModel(currentState, targetStage.id), advancedFrom: stage.id };
  }

  if (stage.type === 'single_elimination') {
    const bracketSize = top8Core.normalizeBracketSize(stage.elimination?.bracketSize || currentState.top8?.length || 8, 8);
    const changed = stage.id === 'stage_top_cut_1' && bracketSize === 8
      ? top8Core.advanceBracket(currentState)
      : top8Core.advanceSingleEliminationBracket(currentState);
    if (!changed) return { ok: false, err: 'stage cannot advance' };
    return { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id) };
  }

  if (stage.type === 'double_elimination') {
    const changed = doubleEliminationCore.advanceDoubleElimination(currentState, stage);
    if (!changed) return { ok: false, err: 'stage cannot advance' };
    return { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id) };
  }

  return { ok: false, err: `advance not implemented for stage type: ${stage.type}` };
}

function isTournamentFinished(state = currentState) {
  return stateCore.isTournamentFinished(state);
}

function displayPhaseForTournament(state = currentState) {
  return isTournamentFinished(state) ? 'done' : state.phase;
}

function sanitizeFilePart(text, fallback = 'report') {
  const cleaned = String(text || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function formatRecordLine(record) {
  const safe = record || emptyRecord();
  return `${safe.wins || 0}-${safe.draws || 0}-${safe.losses || 0}`;
}

function formatBeijingDateTime(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

const TOP8_AWARDS = {
  champion: '冠军',
  runnerUp: '亚军',
  third: '季军',
  fourth: '殿军',
  top8: '八强',
};
const TOP8_AWARD_KEYS = {
  champion: TOP8_AWARDS.champion,
  'runner-up': TOP8_AWARDS.runnerUp,
  'third-place': TOP8_AWARDS.third,
  'fourth-place': TOP8_AWARDS.fourth,
  top8: TOP8_AWARDS.top8,
};

function getTop8AwardForPlayer(playerName, state = currentState) {
  const key = top8Core.getTop8AwardForPlayer(playerName, state);
  return TOP8_AWARD_KEYS[key] || null;
}

function getPlayerCompletionStatus(playerName, state = currentState) {
  const finalPlacement = finalPlacementsCore.finalPlacementForPlayer(state, playerName);
  const standings = (state.swissRankingArchive && state.swissRankingArchive.length > 0)
    ? state.swissRankingArchive
    : (state.swissRanking || []);
  const standing = standings.find(entry => entry.player === playerName) || null;
  const dropped = _dropped.has(playerName) || (standing && standing.dropped) || false;
  const top8Matches = (state.matches || []).filter(m => m.phase && (m.p1 === playerName || m.p2 === playerName));
  const hasPendingTop8Match = top8Matches.some(m => !m.done);
  const top8Award = getTop8AwardForPlayer(playerName, state);
  const isTop8Player = (state.top8 || []).includes(playerName);
  const reachedSwissSummary = state.phase === 'swiss-ended' && !!standing;
  const groupStageResult = Object.values(state.stageResults || {}).find(result =>
    Array.isArray(result.advancers)
    && Array.isArray(result.standings)
    && result.standings.some(entry => entry.player === playerName || entry.displayName === playerName)
  ) || null;
  const isGroupAdvancer = !!groupStageResult?.advancers?.includes(playerName);

  if (dropped) {
    return { finished: true, reason: '退赛', award: top8Award || null, standing, finalPlacement };
  }
  if (top8Award) {
    return { finished: true, reason: top8Award, award: top8Award, standing, finalPlacement };
  }
  if (state.phase === 'groups-ended' && groupStageResult) {
    return isGroupAdvancer
      ? { finished: false, reason: null, award: null, standing, finalPlacement }
      : { finished: true, reason: finalPlacement?.resultLabel || '止步小组赛', award: null, standing, finalPlacement };
  }
  if (state.phase === 'top8' && !isTop8Player && !!standing) {
    return { finished: true, reason: finalPlacement?.resultLabel || '止步瑞士轮', award: null, standing, finalPlacement };
  }
  if (state.phase === 'done' && !!standing) {
    return { finished: true, reason: top8Award || finalPlacement?.resultLabel || (isTop8Player ? '淘汰赛结束' : '止步瑞士轮'), award: top8Award || null, standing, finalPlacement };
  }
  if (reachedSwissSummary && !state.pendingTop8?.includes(playerName)) {
    return { finished: true, reason: finalPlacement?.resultLabel || '止步瑞士轮', award: null, standing, finalPlacement };
  }
  if (isTop8Player && !hasPendingTop8Match && top8Matches.length > 0 && top8Matches.every(m => m.done)) {
    return { finished: true, reason: top8Award || finalPlacement?.resultLabel || '淘汰赛结束', award: top8Award || null, standing, finalPlacement };
  }
  if (state.phase === 'done' && finalPlacement) {
    return { finished: true, reason: finalPlacement.resultLabel || '比赛结束', award: top8Award || null, standing, finalPlacement };
  }
  return { finished: false, reason: null, award: null, standing, finalPlacement };
}

function getSwissHistoryForReport(state = currentState) {
  const swissMatches = (state.swissMatchHistory && state.swissMatchHistory.length > 0)
    ? state.swissMatchHistory
    : (state.matches || []).filter(m => typeof m.round === 'number');
  const rounds = [...new Set(swissMatches.map(m => m.round))].sort((a, b) => a - b);
  return rounds.map(round => ({
    kind: 'swiss',
    label: `瑞士轮 Round ${round}`,
    matches: swissMatches.filter(m => m.round === round).sort((a, b) => (a.table || 0) - (b.table || 0)),
  }));
}

function getTop8HistoryForReport(state = currentState) {
  const phases = ['Quarter Finals', 'Semi Finals', 'Bronze Match', 'Finals'];
  return phases
    .map(phase => ({
      kind: 'top8',
      label: phase,
      matches: (state.matches || []).filter(m => m.phase === phase).sort((a, b) => (a.table || 0) - (b.table || 0)),
    }))
    .filter(group => group.matches.length > 0);
}

function formatMatchResult(match) {
  if (match.draw) return '平局';
  if (match.p2 === 'BYE' || match.p1 === 'BYE') return `${match.winner} 轮空获胜`;
  if (match.preMatchDroppedPlayer) {
    const opponent = match.preMatchDroppedPlayer === match.p1 ? match.p2 : match.p1;
    return `${match.preMatchDroppedPlayer} 赛前退赛，${opponent} 判胜`;
  }
  if (match.postMatchDroppedPlayer) {
    return `${match.winner || '-'} 获胜，${match.postMatchDroppedPlayer} 赛后退赛`;
  }
  if (match.winner) {
    if ((match.p1Wins || 0) > 0 || (match.p2Wins || 0) > 0) {
      return `${match.winner} 获胜，${match.p1Wins || 0}-${match.p2Wins || 0}`;
    }
    return `${match.winner} 获胜`;
  }
  return '未完成';
}

function mapHistoryItemForReport(match, playerName) {
  const opponent = match.p1 === playerName ? match.p2 : match.p1;
  const result = match.draw ? '平' : match.winner === playerName ? '胜' : '负';
  const stage = match.phase || (typeof match.round === 'number' ? `瑞士轮 Round ${match.round}` : '对局');
  const beforeRecord = typeof match.round === 'number'
    ? (match.p1 === playerName ? match.p1RecordBefore : match.p2RecordBefore)
    : null;
  return {
    stage,
    table: match.table || null,
    opponent,
    result,
    resultText: formatMatchResult(match),
    wasLive: !!match.wasLive,
    beforeRecord: beforeRecord ? formatRecordLine(beforeRecord) : null,
  };
}

function buildTournamentReportData(state = currentState, options = {}) {
  return reportsData.buildTournamentReportData(state, options);
}

function buildPlayerReportData(playerName, state = currentState, options = {}) {
  return reportsData.buildPlayerReportData(playerName, state, {
    buildPlayerView,
    getPlayerCompletionStatus,
  }, undefined, options);
}

function exportTournamentReportFile(state = currentState, options = {}) {
  return pdfReport.exportTournamentReportFile({
    state,
    reportsDir: REPORTS_DIR,
    isTournamentFinished,
    sanitizeFilePart,
    buildTournamentReportData: targetState => buildTournamentReportData(targetState, options),
    pythonBin: PYTHON_BIN,
    fontCandidates: getPdfFontCandidates(options.language),
    language: options.language,
  });
}

function exportPlayerReportFile(playerName, state = currentState, options = {}) {
  return pdfReport.exportPlayerReportFile({
    playerName,
    state,
    reportsDir: REPORTS_DIR,
    sanitizeFilePart,
    buildPlayerReportData: (targetPlayer, targetState) => buildPlayerReportData(targetPlayer, targetState, options),
    pythonBin: PYTHON_BIN,
    fontCandidates: getPdfFontCandidates(options.language),
    language: options.language,
  });
}

function buildClientState(state = currentState) {
  normalizeActiveGroupSchedules(state);
  normalizeTop8MatchTables(state);
  const standings = getSortedStandings(true).map((entry, index) => ({ ...entry, rank: index + 1 }));
  const stageViewModels = stagesCore.getStages(state).map(stage => stagesCore.buildStageViewModel(state, stage.id));
  const activeStage = stagesCore.buildStageViewModel(state);
  const finalPlacements = finalPlacementsCore.buildFinalPlacements(state);
  return {
    publicBaseUrl: getPublicBaseUrl(),
    tournamentId: state._id,
    tournamentName: state.tournamentName,
    schemaVersion: state.schemaVersion || 3,
    tournamentSettings: state.tournamentSettings || null,
    stages: stageViewModels,
    activeStage,
    stageResults: state.stageResults || {},
    groupAssignments: state.groupAssignments || {},
    groupRound: state.groupRound || getCurrentGroupRoundForState(state),
    groupStageRounds: state.groupStageRounds || {},
    groupRoundCount: getGroupRoundCountForState(state),
    doubleElimination: state.doubleElimination || {},
    entrants: state.entrants || [],
    playerProfiles: state.playerProfiles || {},
    playerSessions: state.playerSessions || {},
    globalPlayerProfiles: listPlayerProfiles({ includeSummary: false }),
    leagues: listLeagues(),
    pointsProfiles: listPointsProfiles(),
    pointAwards: state.pointAwards || [],
    publicBaseUrlOverride: state.publicBaseUrlOverride || '',
    liveRoomCode: state.liveRoomCode || '',
    phase: state.phase,
    round: state.round,
    players: state.players,
    matches: state.matches,
    top8: state.top8,
    pendingTop8: state.pendingTop8,
    swissRanking: state.swissRanking,
    swissRounds: state.swissRounds,
    currentLiveMatch: state.currentLiveMatch,
    pendingLiveMatch: state.pendingLiveMatch || null,
    lastLiveMatch: state.lastLiveMatch || null,
    lastResult: state.lastResult || null,
    overlayState: state.overlayState,
    featuredSwissPlayers: state._featuredSwissPlayers || [],
    playerStandings: standings,
    finalPlacements,
    droppedPlayers: [..._dropped],
    playerReports: state.playerReports || {},
  };
}

function serializeCurrentState() {
  normalizeActiveGroupSchedules(currentState);
  normalizeTop8MatchTables(currentState);
  currentState._dropped = [..._dropped];
  const { _resultTimer, ...rest } = currentState;
  return stateCore.serializeState(rest);
}

function saveState() {
  if (!currentState._id) return;
  tournamentStore.save(currentState._id, serializeCurrentState());
  invalidateDerivedCaches();
}

function saveCurrentAsCache() {
  if (!currentState._id) return;
  tournaments.set(currentState._id, serializeCurrentState());
}

const broadcaster = createBroadcaster({
  getWebSocketServer: () => wss,
  buildState: () => buildClientState(),
  persistCache: () => saveCurrentAsCache(),
});

function broadcast() {
  broadcaster.broadcast();
}

function tournamentFilePath(id) {
  return tournamentStore.tournamentFilePath(id);
}

function listTournaments() {
  return tournamentStore.list();
}

function loadTournament(id) {
  const raw = tournamentStore.load(id);
  if (!raw) return false;
  currentTournamentId = id;
  resetCurrentState(raw);
  saveState();
  saveCurrentAsCache();
  return true;
}

function resolveCreateTournamentSettings(rawSettings = null) {
  if (!rawSettings || typeof rawSettings !== 'object') return null;
  const shouldBuildPreset = rawSettings.presetId && !Array.isArray(rawSettings.stages);
  const candidate = shouldBuildPreset
    ? presetsCore.getPreset(rawSettings.presetId, rawSettings)
    : rawSettings;
  if (!Array.isArray(candidate.stages) || candidate.stages.length === 0) return null;
  const validation = rulesCore.validateTournamentSettings(candidate);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  return validation.settings;
}

function createTournament(name, options = {}) {
  const rawSettings = options.tournamentSettings || options.settings || null;
  const resolvedSettings = resolveCreateTournamentSettings(rawSettings);
  const nextState = freshState({
    _id: `t_${Date.now()}`,
    _createdAt: Date.now(),
    tournamentName: (name || '未命名比赛').trim(),
    tournamentSettings: resolvedSettings || rawSettings || undefined,
  });
  if (resolvedSettings) {
    nextState.tournamentSettings = resolvedSettings;
    nextState.stages = presetsCore.clone(resolvedSettings.stages);
    nextState.activeStageId = rulesCore.inferActiveStageId(nextState, nextState.stages);
  }
  currentTournamentId = nextState._id;
  resetCurrentState(nextState);
  saveState();
  saveCurrentAsCache();
  return nextState._id;
}

function getPlayerProfileByName(playerName) {
  return currentState.playerProfiles ? currentState.playerProfiles[playerName] || null : null;
}

function bindTournamentPlayerToGlobalProfile(playerName, globalProfileId, options = {}) {
  const name = String(playerName || '').trim();
  const profile = getGlobalPlayerProfileById(globalProfileId);
  if (!name || !profile || !currentState.players.includes(name)) return null;
  if (!currentState.playerProfiles) currentState.playerProfiles = {};
  const existing = currentState.playerProfiles[name] || {};
  const displayNameSource = normalizeDisplayNameSourceValue(
    options.displayNameSource || existing.displayNameSource,
    name === profile.displayName ? 'profile' : 'custom',
  );
  currentState.playerProfiles[name] = {
    ...existing,
    playerId: existing.playerId || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    globalProfileId: profile.id,
    rankedEligible: true,
    displayNameSource,
  };
  const existingEntrant = getEntrantByName(name) || createGuestTournamentEntrant(name, 'manual_binding');
  upsertTournamentEntrant(entrantsCore.bindEntrantToProfile({
    ...existingEntrant,
    displayNameSource,
  }, profile));
  return currentState.playerProfiles[name];
}

function listTournamentEntrants() {
  return ensureEntrantsList().map(entrant => ({ ...entrant }));
}

function createTournamentEntrant(input = {}) {
  const entrantType = input.entrantType === 'team' ? 'team' : 'player';
  const name = String(input.displayName || input.name || input.teamName || '').trim();
  if (!name) throw new Error(entrantType === 'team' ? 'missing teamName' : 'missing displayName');
  if (!currentState.players.includes(name)) currentState.players.push(name);
  if (!currentState.playerProfiles) currentState.playerProfiles = {};
  const source = input.source || 'manual';
  const hasProfileIdInput = Object.prototype.hasOwnProperty.call(input, 'profileId') && input.profileId !== undefined;
  const explicitProfileId = hasProfileIdInput ? String(input.profileId || '').trim() : '';
  const existingProfile = currentState.playerProfiles[name] || {};
  const matchedProfile = !hasProfileIdInput && entrantType === 'player'
    ? getGlobalPlayerProfileByName(name)
    : null;
  const profileId = explicitProfileId || matchedProfile?.id || (!hasProfileIdInput ? existingProfile.globalProfileId : null) || null;
  const entrySource = matchedProfile ? `${source}_bound_profile` : source;
  const profile = profileId ? getGlobalPlayerProfileById(profileId) : null;
  const displayNameSource = normalizeDisplayNameSourceValue(
    input.displayNameSource || existingProfile.displayNameSource,
    profile && name === profile.displayName ? 'profile' : (profile ? 'custom' : 'manual'),
  );
  currentState.playerProfiles[name] = {
    ...existingProfile,
    playerId: existingProfile.playerId || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    globalProfileId: profileId,
    rankedEligible: !!profileId || existingProfile.rankedEligible === true,
    displayNameSource,
  };
  const entrant = entrantType === 'team'
    ? entrantsCore.createTeamEntrant({
        tournamentId: currentState._id,
        teamName: name,
        teamRoster: Array.isArray(input.teamRoster) ? input.teamRoster : [],
        profileId,
        rankedEligible: !!profileId,
        source: entrySource,
        displayNameSource,
      })
    : entrantsCore.createGuestEntrant({
        tournamentId: currentState._id,
        displayName: name,
        source: entrySource,
      });
  return upsertTournamentEntrant({
    ...entrant,
    profileId: profileId || entrant.profileId,
    displayNameSource,
    entryType: profileId ? 'registered' : entrant.entryType,
    rankedEligible: !!profileId || entrant.rankedEligible,
  });
}

function updateTournamentEntrant(entrantId, patch = {}) {
  const entrant = entrantsCore.findEntrantById(ensureEntrantsList(), entrantId);
  if (!entrant) return null;
  const updated = upsertTournamentEntrant(entrantsCore.patchEntrant(entrant, patch));
  const oldName = entrant.displayName;
  const newName = updated.displayName;
  if (oldName !== newName) {
    currentState.players = (currentState.players || []).map(player => player === oldName ? newName : player);
    currentState.matches = (currentState.matches || []).map(match => ({
      ...match,
      p1: match.p1 === oldName ? newName : match.p1,
      p2: match.p2 === oldName ? newName : match.p2,
      winner: match.winner === oldName ? newName : match.winner,
    }));
    if (currentState.playerProfiles && currentState.playerProfiles[oldName]) {
      currentState.playerProfiles[newName] = {
        ...currentState.playerProfiles[oldName],
        name: newName,
        globalProfileId: updated.profileId || currentState.playerProfiles[oldName].globalProfileId || null,
        rankedEligible: updated.rankedEligible,
      };
      delete currentState.playerProfiles[oldName];
    }
  }
  if (updated.profileId) {
    if (!currentState.playerProfiles) currentState.playerProfiles = {};
    currentState.playerProfiles[newName] = {
      ...(currentState.playerProfiles[newName] || {}),
      playerId: currentState.playerProfiles[newName]?.playerId || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: newName,
      globalProfileId: updated.profileId,
      rankedEligible: updated.rankedEligible,
      displayNameSource: updated.displayNameSource || 'custom',
    };
  }
  return updated;
}

function bindTournamentEntrantToGlobalProfile(entrantId, globalProfileId) {
  const profile = getGlobalPlayerProfileById(globalProfileId);
  const entrant = entrantsCore.findEntrantById(ensureEntrantsList(), entrantId);
  if (!profile || !entrant) return null;
  const displayNameSource = normalizeDisplayNameSourceValue(
    entrant.displayNameSource,
    entrant.displayName === profile.displayName ? 'profile' : 'custom',
  );
  const boundEntrant = upsertTournamentEntrant(entrantsCore.bindEntrantToProfile({
    ...entrant,
    displayNameSource,
  }, profile));
  const name = boundEntrant.displayName;
  if (!currentState.players.includes(name)) currentState.players.push(name);
  if (!currentState.playerProfiles) currentState.playerProfiles = {};
  const existingProfile = currentState.playerProfiles[name] || {};
  currentState.playerProfiles[name] = {
    ...existingProfile,
    playerId: existingProfile.playerId || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    globalProfileId: profile.id,
    rankedEligible: true,
    displayNameSource,
  };
  return boundEntrant;
}

function getTournamentSettings() {
  return rulesCore.normalizeTournamentSettings(currentState.tournamentSettings, currentState);
}

function updateTournamentSettings(nextSettings = {}) {
  const currentSettings = currentState.tournamentSettings || presetsCore.createDefaultTournamentSettings();
  const candidate = {
    ...currentSettings,
    ...nextSettings,
  };
  if (!Array.isArray(nextSettings.stages) && Array.isArray(currentSettings.stages)) {
    candidate.stages = currentSettings.stages;
  }
  const validation = rulesCore.validateTournamentSettings(candidate);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  const settings = validation.settings;
  currentState.tournamentSettings = settings;
  currentState.stages = presetsCore.clone(settings.stages);
  currentState.activeStageId = rulesCore.inferActiveStageId(currentState, currentState.stages);
  return settings;
}

function applyTournamentPreset(presetId, options = {}) {
  const settings = presetsCore.getPreset(presetId, {
    ...currentState.tournamentSettings,
    ...(options || {}),
  });
  return updateTournamentSettings(settings);
}

function listTournamentPresets() {
  return presetsCore.listPresets();
}

function getFinalStageResult(state = currentState) {
  const stages = stagesCore.getStages(state);
  for (const stage of [...stages].reverse()) {
    const result = advancementCore.getStageResult(state, stage.id);
    if (result && Array.isArray(result.standings) && result.standings.length > 0) return result;
  }
  return null;
}

function getTournamentPointStageResult(state = currentState) {
  const stages = stagesCore.getStages(state);
  if (stages.length > 0) {
    const terminalStage = stages[stages.length - 1];
    const result = advancementCore.getStageResult(state, terminalStage.id);
    return result && Array.isArray(result.standings) && result.standings.length > 0 ? result : null;
  }
  return state.phase === 'done' || state.phase === 'swiss-ended' || state.phase === 'groups-ended'
    ? getFinalStageResult(state)
    : null;
}

function buildTournamentPointStandings(state = currentState) {
  const finalPlacements = finalPlacementsCore.buildFinalPlacements(state)
    .filter(entry => entry.player || entry.displayName);
  if (finalPlacements.length > 0) {
    return finalPlacements.map(entry => ({
      rank: entry.rank !== null && entry.rank !== undefined && entry.rank !== '' && Number.isFinite(Number(entry.rank)) ? Number(entry.rank) : null,
      player: entry.player || entry.displayName,
      displayName: entry.displayName || entry.player,
      rankLabel: entry.rankLabel || '',
      resultLabel: entry.resultLabel || '',
    }));
  }
  if (stagesCore.getStages(state).length > 0) return [];
  const swissRanking = (state.swissRankingArchive && state.swissRankingArchive.length > 0)
    ? state.swissRankingArchive
    : (state.swissRanking || []);
  return swissRanking.map(entry => ({
    rank: entry.rank,
    player: entry.player,
    displayName: entry.player,
  }));
}

function calculatePointAwardsForCurrentTournament(profileId = null) {
  const settings = getTournamentSettings();
  const profile = getPointsProfileById(profileId) || getDefaultPointsProfile();
  const standings = buildTournamentPointStandings(currentState);
  if (!standings.length) return { ok: false, err: 'no standings available' };
  const awards = pointsCore.calculateTournamentPoints({
    standings,
    entrants: ensureEntrantsList(),
    profile,
  }).map(award => ({
    ...award,
    tournamentId: currentState._id,
    tournamentName: currentState.tournamentName,
    pointsProfileId: profile.id,
    awardedAt: Date.now(),
  }));
  currentState.pointAwards = awards;
  invalidateDerivedCaches();
  return { ok: true, awards, pointsProfile: profile };
}

function listPointAwardsForCurrentTournament() {
  return Array.isArray(currentState.pointAwards) ? currentState.pointAwards.map(award => ({ ...award })) : [];
}

function listAllTournamentPointAwards() {
  const awards = [];
  for (const item of tournamentStore.list()) {
    const raw = tournamentStore.load(item.id);
    if (!raw || !Array.isArray(raw.pointAwards)) continue;
    awards.push(...raw.pointAwards.map(award => ({
      ...award,
      tournamentId: award.tournamentId || item.id,
      tournamentName: award.tournamentName || raw.tournamentName || item.name,
    })));
  }
  if (currentState._id && Array.isArray(currentState.pointAwards)) {
    const existing = new Set(awards.map(award => `${award.tournamentId}:${award.profileId}:${award.rank}`));
    for (const award of currentState.pointAwards) {
      const key = `${award.tournamentId || currentState._id}:${award.profileId}:${award.rank}`;
      if (existing.has(key)) continue;
      awards.push({
        ...award,
        tournamentId: award.tournamentId || currentState._id,
        tournamentName: award.tournamentName || currentState.tournamentName,
      });
    }
  }
  return awards;
}

function buildTournamentPointAwardsForState(state, profile) {
  if (!state || !profile) return [];
  if (!stateCore.isTournamentFinished(state)) return [];
  const standings = buildTournamentPointStandings(state);
  if (!standings.length) return [];
  const entrants = entrantsCore.migrateLegacyEntrants(state);
  return pointsCore.calculateTournamentPoints({
    standings,
    entrants,
    profile,
  }).map(award => ({
    ...award,
    tournamentId: state._id,
    tournamentName: state.tournamentName || state._id,
    pointsProfileId: profile.id,
    awardedAt: Date.now(),
  }));
}

function buildTournamentPointAwardsByLeagueBinding(binding) {
  const tournamentId = String(binding?.tournamentId || '').trim();
  if (!tournamentId) return [];
  const raw = currentState._id === tournamentId ? currentState : tournamentStore.load(tournamentId);
  if (!raw) return [];
  const profile = getPointsProfileById(binding.pointsProfileId) || getDefaultPointsProfile();
  return buildTournamentPointAwardsForState({
    ...raw,
    _id: raw._id || tournamentId,
  }, profile);
}

function buildLeaguePointAwards(league = {}) {
  return leaguesCore.normalizeTournamentBindings(league).flatMap(binding =>
    buildTournamentPointAwardsByLeagueBinding(binding).map(award => ({
      ...award,
      leagueId: league.id || '',
      leagueName: league.name || league.id || '',
      pointsProfileName: getPointsProfileById(award.pointsProfileId)?.name || award.pointsProfileId || '',
      awardedAt: binding.includedAt || award.awardedAt,
    })),
  );
}

function listAllLeaguePointAwards() {
  if (leaguePointAwardsCache) return clonePlain(leaguePointAwardsCache);
  leaguePointAwardsCache = listLeagues().flatMap(league => buildLeaguePointAwards(league));
  return clonePlain(leaguePointAwardsCache);
}

function getLeaguePointAwards(league) {
  const leagueId = league?.id || '';
  if (!leagueId) return [];
  return listAllLeaguePointAwards().filter(award => award.leagueId === leagueId);
}

function loadTournamentSummaryStates() {
  return tournamentStore.list()
    .map(item => {
      const raw = tournamentStore.load(item.id);
      return raw ? { item, state: restoreState({ ...raw, _id: raw._id || item.id }) } : null;
    })
    .filter(Boolean);
}

function groupAwardsByProfileId(awards) {
  const grouped = new Map();
  for (const award of awards) {
    const key = award.profileId || '';
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(award);
  }
  return grouped;
}

function getPlayerSummaryCache() {
  if (playerSummaryCache) return playerSummaryCache;
  const awardsByProfileId = groupAwardsByProfileId(listAllLeaguePointAwards());
  const tournamentStates = loadTournamentSummaryStates();
  playerSummaryCache = new Map();
  for (const profile of playerRegistry.values()) {
    playerSummaryCache.set(profile.id, buildGlobalPlayerSummary(profile.id, {
      playerAwards: awardsByProfileId.get(profile.id) || [],
      tournamentStates,
    }));
  }
  return playerSummaryCache;
}

function buildGlobalPlayerSummary(playerId, options = {}) {
  const profile = getGlobalPlayerProfileById(playerId);
  if (!profile) return null;
  if (!options.playerAwards && !options.tournamentStates && playerSummaryCache && playerSummaryCache.has(playerId)) {
    return clonePlain(playerSummaryCache.get(playerId));
  }
  const playerAwards = Array.isArray(options.playerAwards)
    ? options.playerAwards
    : listAllLeaguePointAwards().filter(award => award.profileId === playerId);
  const tournamentStates = Array.isArray(options.tournamentStates)
    ? options.tournamentStates
    : loadTournamentSummaryStates();
  const tournaments = [];
  for (const { item, state: raw } of tournamentStates) {
    if (!raw) continue;
    const entrants = entrantsCore.migrateLegacyEntrants(raw);
    const entrant = entrants.find(entry => entry.profileId === playerId);
    const awards = playerAwards.filter(award => award.tournamentId === item.id);
    if (!entrant && awards.length === 0) continue;
    const finalStanding = entrant
      ? finalPlacementsCore.finalPlacementForPlayer(raw, entrant.displayName)
      : null;
    const leagueNames = [...new Set(awards.map(award => award.leagueName).filter(Boolean))];
    const pointsProfileNames = [...new Set(awards.map(award => award.pointsProfileName).filter(Boolean))];
    tournaments.push({
      tournamentId: item.id,
      tournamentName: raw.tournamentName || item.name || item.id,
      phase: raw.phase,
      entrantName: entrant?.displayName || awards[0]?.displayName || profile.displayName,
      rank: finalStanding?.rank || awards[0]?.rank || null,
      rankLabel: finalStanding?.rankLabel || finalStanding?.resultLabel || '',
      resultLabel: finalStanding?.resultLabel || '',
      points: awards.reduce((sum, award) => sum + Number(award.points || 0), 0),
      leagueName: leagueNames.join(' / '),
      pointsProfileName: pointsProfileNames.join(' / '),
      date: raw._createdAt || item.date || null,
    });
  }
  if (currentState._id) {
    const entrants = ensureEntrantsList();
    const entrant = entrants.find(entry => entry.profileId === playerId);
    const awards = playerAwards.filter(award => award.tournamentId === currentState._id);
    if (entrant || awards.length > 0) {
      const already = tournaments.some(item => item.tournamentId === currentState._id);
      if (!already) {
        const finalStanding = entrant
          ? finalPlacementsCore.finalPlacementForPlayer(currentState, entrant.displayName)
          : null;
        const leagueNames = [...new Set(awards.map(award => award.leagueName).filter(Boolean))];
        const pointsProfileNames = [...new Set(awards.map(award => award.pointsProfileName).filter(Boolean))];
        tournaments.push({
          tournamentId: currentState._id,
          tournamentName: currentState.tournamentName,
          phase: currentState.phase,
          entrantName: entrant?.displayName || awards[0]?.displayName || profile.displayName,
          rank: finalStanding?.rank || awards[0]?.rank || null,
          rankLabel: finalStanding?.rankLabel || finalStanding?.resultLabel || '',
          resultLabel: finalStanding?.resultLabel || '',
          points: awards.reduce((sum, award) => sum + Number(award.points || 0), 0),
          leagueName: leagueNames.join(' / '),
          pointsProfileName: pointsProfileNames.join(' / '),
          date: currentState._createdAt || null,
        });
      }
    }
  }
  const totalPoints = playerAwards.reduce((sum, award) => sum + Number(award.points || 0), 0);
  return {
    profile,
    totalPoints,
    rankedEvents: playerAwards.length,
    tournaments: tournaments
      .sort((a, b) => Number(b.date || 0) - Number(a.date || 0))
      .slice(0, 12),
    awards: playerAwards
      .sort((a, b) => Number(b.awardedAt || 0) - Number(a.awardedAt || 0))
      .slice(0, 12),
  };
}

function buildLeagueLeaderboard(leagueId) {
  const league = getLeagueById(leagueId);
  if (!league) return null;
  return leaguesCore.buildLeagueLeaderboard({
    league,
    tournamentAwards: getLeaguePointAwards(league),
  });
}

function includeTournamentInLeague(leagueId, tournamentId, options = {}) {
  const league = getLeagueById(leagueId);
  const id = String(tournamentId || '').trim();
  if (!league || !id) return null;
  if (!tournamentStore.load(id) && currentState._id !== id) return null;
  const profile = getPointsProfileById(options.pointsProfileId || league.pointsProfileId) || getDefaultPointsProfile();
  const existing = leaguesCore.normalizeTournamentBindings(league);
  const binding = existing.find(item => item.tournamentId === id) || { tournamentId: id, includedAt: Date.now() };
  binding.pointsProfileId = profile.id;
  const tournamentBindings = [
    ...existing.filter(item => item.tournamentId !== id),
    binding,
  ];
  return saveLeague(leaguesCore.createLeague({ ...league, tournamentBindings }));
}

function removeTournamentFromLeague(leagueId, tournamentId) {
  const league = getLeagueById(leagueId);
  const id = String(tournamentId || '').trim();
  if (!league || !id) return null;
  const tournamentBindings = leaguesCore.normalizeTournamentBindings(league).filter(item => item.tournamentId !== id);
  return saveLeague(leaguesCore.createLeague({ ...league, tournamentBindings, includedTournamentIds: [] }));
}

function buildLeagueFinalQualification(leagueId, count = 8) {
  const leaderboard = buildLeagueLeaderboard(leagueId);
  if (!leaderboard) return null;
  return leaguesCore.buildFinalQualification(leaderboard, Number.isInteger(Number(count)) ? Number(count) : 8);
}

function getPlayerNameById(playerId) {
  if (!playerId || !currentState.playerProfiles) return null;
  const entry = Object.values(currentState.playerProfiles).find(profile => profile.playerId === playerId);
  return entry ? entry.name : null;
}

function ensurePlayerSession(playerName, sessionId) {
  if (!playerName) return null;
  if (!currentState.playerSessions) currentState.playerSessions = {};
  if (!sessionId) sessionId = `ps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const profile = getPlayerProfileByName(playerName);
  const playerId = profile ? profile.playerId : null;
  if (playerId) currentState.playerSessions[playerId] = sessionId;
  saveState();
  saveCurrentAsCache();
  return { sessionId, playerId };
}

function buildPlayerView(playerNameOrId) {
  return buildPlayerViewCore({
    playerNameOrId,
    state: currentState,
    getPlayerNameById,
    getPlayerProfileByName,
    getPlayerCompletionStatus,
    getTop8AwardForPlayer,
  });
}

function buildPlayerViewById(playerId) {
  const playerName = getPlayerNameById(playerId);
  if (!playerName) {
    return {
      ok: false,
      code: 'PLAYER_ID_NOT_FOUND',
      message: '选手身份已失效，请重新输入名称进入本场比赛。',
    };
  }
  return buildPlayerView(playerName);
}

function listTournamentStages() {
  return stagesCore.getStages(currentState).map(stage => stagesCore.buildStageViewModel(currentState, stage.id));
}

function startTournamentStage(stageId) {
  const stage = stagesCore.getStageById(currentState, stageId);
  if (!stage) return { ok: false, err: 'stage not found' };
  currentState.activeStageId = stage.id;
  if (stage.type === 'swiss') {
    const ok = startSwiss();
    return ok ? { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id) } : { ok: false, err: 'not enough players' };
  }
  if (stage.type === 'groups' || stage.type === 'group_round_robin') {
    const ok = groupsCore.enterGroups(currentState, stage);
    return ok ? { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id) } : { ok: false, err: 'not enough entrants for groups' };
  }
  if (stage.type === 'single_elimination') {
    const effectiveStage = getEffectiveStageForStart(stage);
    const ok = top8Core.enterSingleElimination(currentState, effectiveStage);
    return ok ? { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id) } : { ok: false, err: 'not enough top cut players' };
  }
  if (stage.type === 'double_elimination') {
    const ok = doubleEliminationCore.enterDoubleElimination(currentState, stage);
    return ok ? { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id) } : { ok: false, err: 'not enough entrants for double elimination' };
  }
  return { ok: false, err: `stage type not implemented: ${stage.type}` };
}

function generateStageMatches(stageId) {
  const stage = stagesCore.getStageById(currentState, stageId);
  if (!stage) return { ok: false, err: 'stage not found' };
  if (stage.type !== 'swiss') return { ok: false, err: `generate not implemented for stage type: ${stage.type}` };
  if (currentState.phase !== 'swiss') return { ok: false, err: 'not in swiss phase' };
  currentState.activeStageId = stage.id;
  generateRoundMatches();
  return { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id) };
}

function completeTournamentStage(stageId) {
  const stage = stagesCore.getStageById(currentState, stageId);
  if (!stage) return { ok: false, err: 'stage not found' };
  if (stage.type === 'swiss') {
    if (currentState.phase !== 'swiss') return { ok: false, err: 'not in swiss phase' };
    const canComplete = swissCore.canAdvanceRound(currentState);
    if (!canComplete.ok) return canComplete;
    endSwiss();
    return { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id) };
  }
  if (stage.type === 'groups' || stage.type === 'group_round_robin') {
    const result = groupsCore.completeGroups(currentState, stage);
    if (!result.ok) return result;
    return { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id), result: result.result };
  }
  if (stage.type === 'single_elimination') {
    if (!top8Core.isSingleEliminationStageFinished(currentState, stage)) return { ok: false, err: 'stage is not complete' };
    const final = top8Core.getSingleEliminationStageMatches(currentState, stage)
      .find(match => match.phase === 'Finals' && match.done);
    const bronze = top8Core.getSingleEliminationStageMatches(currentState, stage)
      .find(match => match.phase === 'Bronze Match' && match.done);
    const standings = [];
    if (final?.winner) {
      standings.push({ rank: 1, player: final.winner });
      const runnerUp = final.winner === final.p1 ? final.p2 : final.p1;
      if (runnerUp) standings.push({ rank: 2, player: runnerUp });
    }
    if (bronze?.winner) {
      standings.push({ rank: 3, player: bronze.winner });
      const fourth = bronze.winner === bronze.p1 ? bronze.p2 : bronze.p1;
      if (fourth) standings.push({ rank: 4, player: fourth });
    }
    advancementCore.setStageResult(currentState, stage.id, {
      standings,
      advancers: final?.winner ? [final.winner] : [],
      metadata: { champion: final?.winner || null },
    });
    currentState.phase = 'done';
    currentState.overlayState = 'podium';
    return { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id) };
  }
  if (stage.type === 'double_elimination') {
    const result = doubleEliminationCore.completeDoubleElimination(currentState, stage);
    if (!result.ok) return result;
    currentState.phase = 'done';
    currentState.overlayState = 'podium';
    return { ok: true, stage: stagesCore.buildStageViewModel(currentState, stage.id), result: result.result };
  }
  return { ok: false, err: `complete not implemented for stage type: ${stage.type}` };
}

function loadLatestTournamentIfAny() {
  const list = listTournaments();
  if (list.length === 0) return;
  loadTournament(list[0].id);
}

loadLatestTournamentIfAny();
loadPlayerRegistry();
loadLeagueRegistry();
loadPointsRegistry();

function syncTournamentRequest(tournamentId) {
  const id = (tournamentId || '').trim();
  if (!id) return false;
  if (currentState._id === id) return true;
  return loadTournament(id);
}

function tournamentExists(tournamentId) {
  const id = (tournamentId || '').trim();
  return !!id && tournamentStore.exists(id);
}

function sendTournamentPage(req, res, folder) {
  if (!tournamentExists(req.params.id)) return res.status(404).send('Tournament not found');
  res.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  return res.sendFile(path.join(PUBLIC_DIR, folder, 'index.html'));
}

const { registerRoutes } = require('./routes');

registerRoutes(app, {
  express,
  path,
  PUBLIC_DIR,
  FONTS_DIR,
  getActiveFontConfig,
  getPdfFontCandidates,
  sendTournamentPage,
  syncTournamentRequest,
  buildClientState,
  listTournaments,
  buildPlayerView,
  buildPlayerViewById,
  listTournamentStages,
  getMatchStage,
  startTournamentStage,
  generateStageMatches,
  completeTournamentStage,
  advanceTournamentStage,
  getTournamentSettings,
  updateTournamentSettings,
  applyTournamentPreset,
  listTournamentPresets,
  listTournamentEntrants,
  createTournamentEntrant,
  updateTournamentEntrant,
  bindTournamentEntrantToGlobalProfile,
  listPlayerProfiles,
  createGlobalPlayerProfile,
  getGlobalPlayerProfileById,
  getGlobalPlayerProfileByName,
  updateGlobalPlayerProfile,
  deleteGlobalPlayerProfile,
  bindGuestEntrantToGlobalProfile,
  bindTournamentPlayerToGlobalProfile,
  listLeagues,
  createLeague,
  getLeagueById,
  updateLeague,
  deleteLeague,
  buildLeagueLeaderboard,
  includeTournamentInLeague,
  removeTournamentFromLeague,
  buildLeagueFinalQualification,
  buildGlobalPlayerSummary,
  listPointsProfiles,
  createPointsProfile,
  updatePointsProfile,
  deletePointsProfile,
  getPointsProfileReferences,
  calculatePointAwardsForCurrentTournament,
  listPointAwardsForCurrentTournament,
  createTournament,
  loadTournament,
  saveState,
  broadcast,
  addPlayer,
  removePlayer,
  validatePublicBaseUrlAccess,
  normalizePublicBaseUrlCandidate,
  ensurePlayerSession,
  dropPlayer,
  dropPlayerFromMatch,
  startSwiss,
  nextRound,
  generateRoundMatches,
  endSwiss,
  revertRound,
  enterTop8,
  cancelTop8Confirm,
  getPostMatchOverlayState,
  getLiveOverlayStateForMatch,
  swapMatchSeats,
  applyResult,
  applyDraw,
  applyBo3Score,
  exportTournamentReportFile,
  exportPlayerReportFile,
  freshState,
  resetCurrentState,
  loadLatestTournamentIfAny,
  current: () => currentState,
  setCurrentTournamentId,
  isLoopbackHost,
  tournamentStore,
  saveCurrentAsCache,
});


function startServer({ port = PORT, host = '0.0.0.0' } = {}) {
  const server = http.createServer(app);
  wss = attachTournamentWebSocket(server, {
    syncTournamentRequest,
    buildClientState,
  });
  server.listen(port, host, () => {
    console.log(`3.3.3 server running on ${getPublicBaseUrl()}`);
  });
  return server;
}

module.exports = {
  app,
  startServer,
};


