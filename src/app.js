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
const { createBroadcaster } = require('./realtime/broadcaster');
const { attachTournamentWebSocket } = require('./realtime/websocket');
const { buildPlayerView: buildPlayerViewCore } = require('./core/playerView');
const { PORT, DATA_DIR, PUBLIC_DIR, PUBLIC_BASE_URL, REPORTS_DIR, PYTHON_BIN } = require('./config');
const stateCore = require('./core/state');
const recordsCore = require('./core/records');
const standingsCore = require('./core/standings');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(REPORTS_DIR, { recursive: true });
const tournamentStore = createJsonStore({ dataDir: DATA_DIR, displayPhaseForTournament });

const app = express();
app.use(express.json());

let wss = null;
let currentTournamentId = null;
let tournaments = new Map();

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
  return currentState.phase === 'top8' ? 'top8-bracket' : 'overview';
}

function resetCurrentState(nextState) {
  clearResultTimer();
  currentState = restoreState(nextState);
  _dropped = new Set(currentState._dropped || []);
  normalizeTop8MatchTables(currentState);

  if (currentState.phase === 'setup') currentState.overlayState = 'idle';
  else if (currentState.phase === 'swiss-ended') currentState.overlayState = 'swiss-ended';
  else if (currentState.phase === 'top8') {
    currentState.overlayState = currentState.currentLiveMatch ? 'top8-live' : 'top8-bracket';
  } else {
    currentState.overlayState = currentState.currentLiveMatch ? 'live' : 'overview';
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
function addPlayer(name) {
  name = (name || '').trim();
  if (name && !currentState.players.includes(name) && !_dropped.has(name) && currentState.players.length < 64) {
    currentState.players.push(name);
    if (!currentState.playerProfiles) currentState.playerProfiles = {};
    if (!currentState.playerProfiles[name]) {
      currentState.playerProfiles[name] = {
        playerId: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name,
      };
    }
    return true;
  }
  return false;
}

function removePlayer(name) {
  currentState.players = currentState.players.filter(p => p !== name);
}

function dropPlayer(name) {
  name = (name || '').trim();
  if (!name) return;
  _dropped.add(name);
  if (!currentState.players.includes(name)) currentState.players.push(name);
  setDropAfterRound(name, currentState.round);

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
  const ok = swissCore.startSwiss(currentState, rounds, getSortedStandings(false), { isActiveForRound });
  if (!ok) return false;
  rebuildSwissMatchesArchive();
  syncSwissHistoryForRound(currentState.round);
  return true;
}

function generateRoundMatches() {
  const result = swissCore.createRoundMatches(currentState, getSortedStandings(false), { isActiveForRound });
  swissCore.replaceRoundMatches(currentState, result.matches, result.byeSet);
  syncSwissHistoryForRound(currentState.round);
}

function nextRound() {
  const canAdvance = swissCore.canAdvanceRound(currentState);
  if (!canAdvance.ok) return canAdvance;
  clearSwissRoundTransientState();
  pushSwissRollbackSnapshot('next-round');
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
  const standings = getSortedStandings(true);
  swissCore.endSwiss(currentState, standings);
  rebuildSwissMatchesArchive();
}

function enterTop8() {
  rebuildSwissMatchesArchive();
  return top8Core.enterTop8(currentState);
}

function cancelTop8Confirm() {
  top8Core.cancelTop8Confirm(currentState);
}

function swapMatchSeats(matchId) {
  const match = currentState.matches.find(m => m.id === matchId);
  if (!match) return false;
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
  match.done = true;
  match.draw = true;
  match.winner = null;
  match.p1Wins = 0;
  match.p2Wins = 0;
  const isLive = currentState.currentLiveMatch && currentState.currentLiveMatch.id === matchId;
  if (isLive) {
    clearResultTimer();
    currentState.overlayState = currentState.phase === 'top8' ? 'top8-result' : 'result';
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
  if (!top8Core.applyResultToMatch(match, winnerId)) return false;
  const isLive = currentState.currentLiveMatch && currentState.currentLiveMatch.id === matchId;
  if (isLive) {
    clearResultTimer();
    currentState.overlayState = currentState.phase === 'top8' ? 'top8-result' : 'result';
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
  upsertSwissMatchHistory(match);
  if (currentState.phase === 'top8') advanceBracket();
  return true;
}

function applyBo3Score(matchId, p1Wins, p2Wins) {
  const match = currentState.matches.find(m => m.id === matchId);
  if (!match) return false;
  if (!top8Core.applyBo3ScoreToMatch(match, p1Wins, p2Wins)) return false;
  const isLive = currentState.currentLiveMatch && currentState.currentLiveMatch.id === matchId;
  if (isLive) {
    currentState.currentLiveMatch = { ...match };
  }
  if (isLive && match.done) {
    clearResultTimer();
    currentState.overlayState = 'top8-result';
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
  if (currentState.phase === 'top8' && match.done) advanceBracket();
  return true;
}

function advanceBracket() {
  const changed = top8Core.advanceBracket(currentState);
  if (changed) {
    saveState();
    broadcast();
  }
}

function isTournamentFinished(state = currentState) {
  return top8Core.isTournamentFinished(state);
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

  if (dropped) {
    return { finished: true, reason: '退赛', award: top8Award || null, standing };
  }
  if (top8Award) {
    return { finished: true, reason: top8Award, award: top8Award, standing };
  }
  if (state.phase === 'top8' && !isTop8Player && !!standing) {
    return { finished: true, reason: '止步瑞士轮', award: null, standing };
  }
  if (state.phase === 'done' && !!standing) {
    return { finished: true, reason: top8Award || (isTop8Player ? '淘汰赛结束' : '止步瑞士轮'), award: top8Award || null, standing };
  }
  if (reachedSwissSummary && !state.pendingTop8?.includes(playerName)) {
    return { finished: true, reason: '止步瑞士轮', award: null, standing };
  }
  if (isTop8Player && !hasPendingTop8Match && top8Matches.length > 0 && top8Matches.every(m => m.done)) {
    return { finished: true, reason: top8Award || '淘汰赛结束', award: top8Award || null, standing };
  }
  return { finished: false, reason: null, award: null, standing };
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

function buildTournamentReportData(state = currentState) {
  return reportsData.buildTournamentReportData(state);
}

function buildPlayerReportData(playerName, state = currentState) {
  return reportsData.buildPlayerReportData(playerName, state, {
    buildPlayerView,
    getPlayerCompletionStatus,
  });
}

function exportTournamentReportFile(state = currentState) {
  return pdfReport.exportTournamentReportFile({
    state,
    reportsDir: REPORTS_DIR,
    isTournamentFinished,
    sanitizeFilePart,
    buildTournamentReportData,
    pythonBin: PYTHON_BIN,
  });
}

function exportPlayerReportFile(playerName, state = currentState) {
  return pdfReport.exportPlayerReportFile({
    playerName,
    state,
    reportsDir: REPORTS_DIR,
    sanitizeFilePart,
    buildPlayerReportData,
    pythonBin: PYTHON_BIN,
  });
}

function buildClientState(state = currentState) {
  normalizeTop8MatchTables(state);
  const standings = getSortedStandings(true).map((entry, index) => ({ ...entry, rank: index + 1 }));
  return {
    publicBaseUrl: getPublicBaseUrl(),
    tournamentId: state._id,
    tournamentName: state.tournamentName,
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
    lastLiveMatch: state.lastLiveMatch || null,
    lastResult: state.lastResult || null,
    overlayState: state.overlayState,
    featuredSwissPlayers: state._featuredSwissPlayers || [],
    playerStandings: standings,
    droppedPlayers: [..._dropped],
    playerReports: state.playerReports || {},
  };
}

function serializeCurrentState() {
  normalizeTop8MatchTables(currentState);
  currentState._dropped = [..._dropped];
  const { _resultTimer, ...rest } = currentState;
  if (rest._byeSet instanceof Set) rest._byeSet = [...rest._byeSet];
  return rest;
}

function saveState() {
  if (!currentState._id) return;
  tournamentStore.save(currentState._id, serializeCurrentState());
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
  saveCurrentAsCache();
  return true;
}

function createTournament(name) {
  const nextState = freshState({
    _id: `t_${Date.now()}`,
    _createdAt: Date.now(),
    tournamentName: (name || '未命名比赛').trim(),
  });
  currentTournamentId = nextState._id;
  resetCurrentState(nextState);
  saveState();
  saveCurrentAsCache();
  return nextState._id;
}

function getPlayerProfileByName(playerName) {
  return currentState.playerProfiles ? currentState.playerProfiles[playerName] || null : null;
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

function loadLatestTournamentIfAny() {
  const list = listTournaments();
  if (list.length === 0) return;
  loadTournament(list[0].id);
}

loadLatestTournamentIfAny();

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
  return res.sendFile(path.join(PUBLIC_DIR, folder, 'index.html'));
}

const { registerRoutes } = require('./routes');

registerRoutes(app, {
  express,
  path,
  PUBLIC_DIR,
  sendTournamentPage,
  syncTournamentRequest,
  buildClientState,
  listTournaments,
  buildPlayerView,
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
    console.log(`2.2.5-dev.0 server running on ${getPublicBaseUrl()}`);
  });
  return server;
}

module.exports = {
  app,
  startServer,
};


