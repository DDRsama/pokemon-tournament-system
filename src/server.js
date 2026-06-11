const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawnSync } = require('child_process');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 18765);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data', 'tournaments');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const REPORTS_DIR = process.env.REPORTS_DIR || path.join(__dirname, '..', 'data', 'reports');
const CODEX_PYTHON_BIN = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
const PYTHON_BIN = process.env.PYTHON_BIN || process.env.PYTHON || (fs.existsSync(CODEX_PYTHON_BIN) ? CODEX_PYTHON_BIN : (process.platform === 'win32' ? 'python' : 'python3'));

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(REPORTS_DIR, { recursive: true });

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

function normalizeTop8MatchTables(state = currentState) {
  const matches = state && Array.isArray(state.matches) ? state.matches : [];
  const qfOrder = ['qf1', 'qf2', 'qf3', 'qf4'];
  const sfOrder = ['sf1', 'sf2'];
  const medalOrder = ['final', 'bronze'];

  qfOrder.forEach((id, index) => {
    const match = matches.find(m => m.id === id || (m.phase === 'Quarter Finals' && m.bracketRound === 1 && m.id === id));
    if (match) match.table = index + 1;
  });
  sfOrder.forEach((id, index) => {
    const match = matches.find(m => m.id === id || (m.phase === 'Semi Finals' && m.bracketRound === 2 && m.id === id));
    if (match) match.table = index + 1;
  });
  medalOrder.forEach((id, index) => {
    const match = matches.find(m => m.id === id || ((id === 'final' ? m.phase === 'Finals' : m.phase === 'Bronze Match') && m.bracketRound === 3));
    if (match) match.table = index + 1;
  });
}

function freshState(overrides = {}) {
  return {
    _id: null,
    _createdAt: Date.now(),
    tournamentName: 'Pokemon Tournament System',
    phase: 'setup',
    round: 0,
    players: [],
    matches: [],
    top8: [],
    pendingTop8: null,
    swissRanking: [],
    swissRounds: 0,
    publicBaseUrlOverride: '',
    liveRoomCode: '',
    currentLiveMatch: null,
    lastLiveMatch: null,
    lastResult: null,
    overlayState: 'idle',
    _dropped: [],
    _dropAfterRound: {},
    _byeSet: new Set(),
    _featuredSwissPlayers: [],
    swissMatchHistory: [],
    swissMatchesArchive: [],
    swissRankingArchive: [],
    playerProfiles: {},
    playerSessions: {},
    playerReports: {},
    ...overrides,
  };
}

let currentState = freshState();
let _dropped = new Set();

function clearResultTimer() {
  if (currentState._resultTimer) {
    clearTimeout(currentState._resultTimer);
    currentState._resultTimer = null;
  }
}

function restoreByeSet(rawByeSet) {
  if (!rawByeSet) return new Set();
  if (rawByeSet instanceof Set) return rawByeSet;
  if (Array.isArray(rawByeSet)) return new Set(rawByeSet);
  return new Set(Object.keys(rawByeSet || {}));
}

function restoreState(rawState) {
  return {
    ...freshState(),
    ...rawState,
    lastLiveMatch: rawState.lastLiveMatch || null,
    lastResult: rawState.lastResult || null,
    _byeSet: restoreByeSet(rawState._byeSet),
    swissMatchesArchive: rawState.swissMatchesArchive || [],
    playerProfiles: rawState.playerProfiles || {},
    playerSessions: rawState.playerSessions || {},
    playerReports: rawState.playerReports || {},
  };
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
  return { wins: 0, draws: 0, losses: 0, points: 0 };
}

function getRecordBeforeRound(player, roundNumber, state = currentState) {
  if (!player || player === 'BYE' || typeof roundNumber !== 'number' || roundNumber <= 1) {
    return emptyRecord();
  }

  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const m of (state.matches || [])) {
    if (typeof m.round !== 'number' || m.round >= roundNumber || !m.done) continue;
    if (m.p1 !== player && m.p2 !== player) continue;

    if (m.p1 === 'BYE' || m.p2 === 'BYE') {
      wins++;
      continue;
    }
    if (m.draw) {
      draws++;
      continue;
    }
    if (m.winner === player) wins++;
    else losses++;
  }
  return { wins, draws, losses, points: wins * 3 + draws };
}

function getRecord(player, state = currentState) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const m of state.matches) {
    if (!m.done) continue;
    if (m.p1 === 'BYE' || m.p2 === 'BYE') {
      if (m.p1 === player || m.p2 === player) wins++;
      continue;
    }
    if (m.draw) {
      if (m.p1 === player || m.p2 === player) draws++;
      continue;
    }
    if (m.winner === player) wins++;
    else if (m.p1 === player || m.p2 === player) losses++;
  }
  return { wins, draws, losses, points: wins * 3 + draws };
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

function getCompletedSwissMatches() {
  return currentState.matches.filter(m => typeof m.round === 'number' && m.done);
}

function getSwissOpponents(player) {
  return getCompletedSwissMatches()
    .filter(m => m.p1 === player || m.p2 === player)
    .map(m => (m.p1 === player ? m.p2 : m.p1))
    .filter(opponent => opponent && opponent !== 'BYE');
}

function getActualCompletedSwissMatchesForPlayer(player) {
  return getCompletedSwissMatches().filter(
    m =>
      (m.p1 === player || m.p2 === player) &&
      m.p1 !== 'BYE' &&
      m.p2 !== 'BYE' &&
      m.preMatchDroppedPlayer !== player,
  );
}

function getPlayerWinPercentage(player) {
  const matches = getActualCompletedSwissMatchesForPlayer(player);
  const total = matches.length;
  if (total <= 0) return 0;
  let wins = 0;
  let draws = 0;
  for (const m of matches) {
    if (m.draw) draws++;
    else if (m.winner === player) wins++;
  }
  const raw = (wins + draws * 0.5) / total;
  return Math.max(0.25, raw);
}

function getHeadToHeadSweep(a, b) {
  const matches = getCompletedSwissMatches().filter(
    m =>
      !m.draw &&
      ((m.p1 === a && m.p2 === b) || (m.p1 === b && m.p2 === a)),
  );
  if (matches.length === 0) return 0;
  const aWins = matches.filter(m => m.winner === a).length;
  const bWins = matches.filter(m => m.winner === b).length;
  if (aWins > 0 && bWins === 0) return 1;
  if (bWins > 0 && aWins === 0) return -1;
  return 0;
}

function buildStandingEntry(player) {
  const rec = getRecord(player);
  const opponents = getSwissOpponents(player).filter(opponent => opponent !== 'BYE');
  const opponentWinRates = opponents.map(getPlayerWinPercentage);
  const omw = opponentWinRates.length
    ? opponentWinRates.reduce((sum, value) => sum + value, 0) / opponentWinRates.length
    : 0;
  const oow = opponents.length
    ? opponents
        .map(getSwissOpponents)
        .map(opponentsOpponents => {
          const rates = opponentsOpponents
            .flat()
            .filter(opponent => opponent && opponent !== 'BYE')
            .map(getPlayerWinPercentage);
          return rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : 0;
        })
        .reduce((sum, value) => sum + value, 0) / opponents.length
    : 0;

  return {
    player,
    wins: rec.wins,
    draws: rec.draws,
    losses: rec.losses,
    points: rec.points,
    latePenalty: 0,
    omw,
    oow,
    dropped: _dropped.has(player),
  };
}

function hasPlayedEachOther(a, b) {
  return currentState.matches.some(
    m =>
      typeof m.round === 'number' &&
      ((m.p1 === a && m.p2 === b) || (m.p1 === b && m.p2 === a)),
  );
}

function pairPlayersWithinGroup(players) {
  const pool = [...players];
  const pairs = [];
  while (pool.length > 1) {
    const a = pool.shift();
    let partnerIndex = pool.findIndex(b => !hasPlayedEachOther(a, b));
    if (partnerIndex === -1) partnerIndex = 0;
    const [b] = pool.splice(partnerIndex, 1);
    pairs.push([a, b]);
  }
  return { pairs, leftover: pool[0] || null };
}

function getSortedStandings(includeDropped = true) {
  const players = currentState.players.filter(player => player !== 'BYE');
  const standings = players.map(buildStandingEntry);
  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.latePenalty !== b.latePenalty) return a.latePenalty - b.latePenalty;
    if (b.omw !== a.omw) return b.omw - a.omw;
    if (b.oow !== a.oow) return b.oow - a.oow;
    const h2h = getHeadToHeadSweep(a.player, b.player);
    if (h2h !== 0) return -h2h;
    return a.player.localeCompare(b.player, 'zh-CN');
  });
  if (!includeDropped) return standings.filter(entry => !entry.dropped);
  return standings;
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
  const activePlayers = currentState.players.filter(p => isActiveForRound(p, 1));
  if (activePlayers.length < 2) return false;
  clearResultTimer();
  currentState.phase = 'swiss';
  currentState.round = 1;
  currentState.swissRounds = rounds;
  currentState.matches = [];
  currentState.top8 = [];
  currentState.pendingTop8 = null;
  currentState.swissRanking = [];
  currentState.currentLiveMatch = null;
  currentState.lastLiveMatch = null;
  currentState.lastResult = null;
  currentState.overlayState = 'overview';
  currentState._byeSet = new Set();
  currentState.playerReports = {};
  rebuildSwissMatchesArchive();
  generateRoundMatches();
  return true;
}

function generateRoundMatches() {
  const activeStandings = getSortedStandings(false);
  const activePlayers = activeStandings.map(entry => entry.player).filter(player => isActiveForRound(player, currentState.round));
  const byeSet = restoreByeSet(currentState._byeSet);
  const pairs = [];
  let availablePlayers = [...activePlayers];

  if (availablePlayers.length % 2 !== 0) {
    const byePlayer = [...availablePlayers].reverse().find(player => !byeSet.has(player)) || availablePlayers[availablePlayers.length - 1];
    byeSet.add(byePlayer);
    pairs.push([byePlayer, 'BYE']);
    availablePlayers = availablePlayers.filter(player => player !== byePlayer);
  }

  const pointGroups = new Map();
  for (const entry of activeStandings) {
    if (!availablePlayers.includes(entry.player)) continue;
    if (!pointGroups.has(entry.points)) pointGroups.set(entry.points, []);
    pointGroups.get(entry.points).push(entry.player);
  }

  let carry = null;
  const sortedPointKeys = [...pointGroups.keys()].sort((a, b) => b - a);
  for (const points of sortedPointKeys) {
    let group = [...pointGroups.get(points)];
    if (carry) {
      group = [carry, ...group];
      carry = null;
    }
    const result = pairPlayersWithinGroup(group);
    pairs.push(...result.pairs);
    carry = result.leftover;
  }

  if (carry) {
    const fallbackPlayers = activePlayers.filter(player => player !== carry && !pairs.some(pair => pair.includes(player)));
    if (fallbackPlayers.length > 0) {
      pairs.push([carry, fallbackPlayers[0]]);
    } else {
      pairs.push([carry, 'BYE']);
      byeSet.add(carry);
    }
  }

  const rankMap = new Map(getSortedStandings(false).map((entry, index) => [entry.player, index + 1]));
  pairs.sort((a, b) => {
    const aIsBye = a[1] === 'BYE';
    const bIsBye = b[1] === 'BYE';
    if (aIsBye && !bIsBye) return 1;
    if (!aIsBye && bIsBye) return -1;
    const aBest = Math.min(rankMap.get(a[0]) || 9999, rankMap.get(a[1]) || 9999);
    const bBest = Math.min(rankMap.get(b[0]) || 9999, rankMap.get(b[1]) || 9999);
    if (aBest !== bBest) return aBest - bBest;
    return (rankMap.get(a[0]) || 9999) - (rankMap.get(b[0]) || 9999);
  });

  currentState._byeSet = byeSet;
  const newMatches = pairs.map(([p1, p2], idx) => ({
    id: `r${currentState.round}-m${idx + 1}`,
    table: idx + 1,
    round: currentState.round,
    p1,
    p2,
    winner: p2 === 'BYE' ? p1 : null,
    done: p2 === 'BYE',
    draw: false,
    p1Wins: p2 === 'BYE' ? 1 : 0,
    p2Wins: 0,
    liveRoomCode: null,
    wasLive: false,
  }));
  currentState.matches = currentState.matches.filter(m => m.round !== currentState.round);
  currentState.matches.push(...newMatches);
  currentState.playerReports = {};
  syncSwissHistoryForRound(currentState.round);
}

function nextRound() {
  currentState.round++;
  currentState.currentLiveMatch = null;
  currentState.lastResult = null;
  currentState.overlayState = 'overview';
  currentState.playerReports = {};
  generateRoundMatches();
}

function revertRound() {
  if (currentState.phase !== 'swiss' || currentState.round <= 0) return;
  currentState.matches = currentState.matches.filter(m => m.round !== currentState.round);
  currentState.round--;
  currentState.currentLiveMatch = null;
  currentState.lastResult = null;
  currentState.overlayState = 'overview';
  currentState.playerReports = {};
}

function endSwiss() {
  const standings = getSortedStandings(true);
  currentState.swissRanking = standings.map((entry, index) => ({
    rank: index + 1,
    player: entry.player,
    wins: entry.wins,
    draws: entry.draws,
    losses: entry.losses,
    points: entry.points,
    latePenalty: entry.latePenalty,
    omw: entry.omw,
    oow: entry.oow,
    dropped: entry.dropped,
  }));
  currentState.pendingTop8 = standings.filter(entry => !entry.dropped).slice(0, 8).map(entry => entry.player);
  currentState.swissRankingArchive = currentState.swissRanking.map(entry => ({ ...entry }));
  currentState.phase = 'swiss-ended';
  currentState.currentLiveMatch = null;
  currentState.lastLiveMatch = null;
  currentState.lastResult = null;
  currentState.overlayState = 'swiss-ended';
  rebuildSwissMatchesArchive();
}

function enterTop8() {
  if (!currentState.pendingTop8 || currentState.pendingTop8.length < 8) return false;
  const top8 = currentState.pendingTop8;
  rebuildSwissMatchesArchive();
  currentState.top8 = top8;
  currentState.pendingTop8 = null;
  currentState.swissRanking = [];
  currentState.phase = 'top8';
  currentState.currentLiveMatch = null;
  currentState.lastLiveMatch = null;
  currentState.lastResult = null;
  currentState.overlayState = 'top8-bracket';
  currentState.matches = [
    { id: 'qf1', table: 1, p1: top8[0], p2: top8[7], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    { id: 'qf2', table: 2, p1: top8[3], p2: top8[4], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    { id: 'qf3', table: 3, p1: top8[1], p2: top8[6], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    { id: 'qf4', table: 4, p1: top8[2], p2: top8[5], winner: null, done: false, phase: 'Quarter Finals', bracketRound: 1, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
  ];
  return true;
}

function cancelTop8Confirm() {
  currentState.phase = 'swiss';
  currentState.pendingTop8 = null;
  currentState.swissRanking = [];
  currentState.currentLiveMatch = null;
  currentState.lastResult = null;
  currentState.overlayState = 'overview';
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
  match.winner = winnerId;
  match.done = true;
  match.draw = false;
  match.p1Wins = winnerId === match.p1 ? 1 : 0;
  match.p2Wins = winnerId === match.p2 ? 1 : 0;
  const isLive = currentState.currentLiveMatch && currentState.currentLiveMatch.id === matchId;
  if (isLive) {
    clearResultTimer();
    currentState.overlayState = currentState.phase === 'top8' ? 'top8-result' : 'result';
    currentState.lastResult = {
      winner: match.winner,
      p1: match.p1,
      p2: match.p2,
      phase: currentState.phase,
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
  match.p1Wins = p1Wins;
  match.p2Wins = p2Wins;
  match.done = false;
  match.winner = null;
  if (p1Wins >= 2) {
    match.winner = match.p1;
    match.done = true;
  } else if (p2Wins >= 2) {
    match.winner = match.p2;
    match.done = true;
  }
  const isLive = currentState.currentLiveMatch && currentState.currentLiveMatch.id === matchId;
  if (isLive && match.done) {
    clearResultTimer();
    currentState.overlayState = 'top8-result';
    currentState.lastResult = {
      winner: match.winner,
      p1: match.p1,
      p2: match.p2,
      phase: currentState.phase,
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
  if (currentState.phase !== 'top8') return;
  const ms = currentState.matches;
  let changed = false;
  const qfDone = ms.filter(m => m.phase === 'Quarter Finals').length > 0 && ms.filter(m => m.phase === 'Quarter Finals').every(m => m.done);
  const sfDone = ms.filter(m => m.phase === 'Semi Finals').length > 0 && ms.filter(m => m.phase === 'Semi Finals').every(m => m.done);
  if (qfDone && !ms.some(m => m.phase === 'Semi Finals')) {
    const qf = ms.filter(m => m.phase === 'Quarter Finals');
    ms.push(
      { id: 'sf1', table: 1, p1: qf.find(m => m.id === 'qf1').winner, p2: qf.find(m => m.id === 'qf2').winner, winner: null, done: false, phase: 'Semi Finals', bracketRound: 2, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
      { id: 'sf2', table: 2, p1: qf.find(m => m.id === 'qf3').winner, p2: qf.find(m => m.id === 'qf4').winner, winner: null, done: false, phase: 'Semi Finals', bracketRound: 2, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    );
    changed = true;
  }
  if (sfDone && !ms.some(m => m.phase === 'Finals')) {
    const sf = ms.filter(m => m.phase === 'Semi Finals');
    const sf1 = sf.find(m => m.id === 'sf1');
    const sf2 = sf.find(m => m.id === 'sf2');
    const finalP1 = sf1.winner;
    const finalP2 = sf2.winner;
    const bronzeP1 = sf1.p1 === finalP1 ? sf1.p2 : sf1.p1;
    const bronzeP2 = sf2.p1 === finalP2 ? sf2.p2 : sf2.p1;
    ms.push(
      { id: 'final', table: 1, p1: finalP1, p2: finalP2, winner: null, done: false, phase: 'Finals', bracketRound: 3, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
      { id: 'bronze', table: 2, p1: bronzeP1, p2: bronzeP2, winner: null, done: false, phase: 'Bronze Match', bracketRound: 3, p1Wins: 0, p2Wins: 0, liveRoomCode: null, wasLive: false },
    );
    changed = true;
  }
  if (changed) {
    saveState();
    broadcast();
  }
}

function isTournamentFinished(state = currentState) {
  if (state.phase === 'done') return true;
  const matches = state.matches || [];
  const finalsDone = matches.some(m => m.phase === 'Finals' && m.done);
  const bronzeDone = matches.some(m => m.phase === 'Bronze Match' && m.done);
  return finalsDone && bronzeDone;
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

function getTop8AwardForPlayer(playerName, state = currentState) {
  const playerTop8Matches = (state.matches || []).filter(m => m.phase && (m.p1 === playerName || m.p2 === playerName));
  const lostQuarterFinal = playerTop8Matches.some(m => m.done && m.phase === 'Quarter Finals' && m.winner !== playerName);
  let award = null;
  const finalMatch = playerTop8Matches.find(m => m.done && m.phase === 'Finals')
    || (state.matches || []).find(m => m.phase === 'Finals' && m.done && (m.p1 === playerName || m.p2 === playerName));
  const bronzeMatch = playerTop8Matches.find(m => m.done && m.phase === 'Bronze Match')
    || (state.matches || []).find(m => m.phase === 'Bronze Match' && m.done && (m.p1 === playerName || m.p2 === playerName));
  if (finalMatch) {
    const champion = finalMatch.winner;
    const runnerUp = champion === finalMatch.p1 ? finalMatch.p2 : finalMatch.p1;
    if (playerName === champion) award = TOP8_AWARDS.champion;
    else if (playerName === runnerUp) award = TOP8_AWARDS.runnerUp;
  }
  if (bronzeMatch) {
    const third = bronzeMatch.winner;
    const fourth = third === bronzeMatch.p1 ? bronzeMatch.p2 : bronzeMatch.p1;
    if (playerName === third) award = TOP8_AWARDS.third;
    else if (playerName === fourth) award = TOP8_AWARDS.fourth;
  }
  if (!award && lostQuarterFinal) award = TOP8_AWARDS.top8;
  return award;
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
  const ranking = (state.swissRankingArchive && state.swissRankingArchive.length > 0)
    ? state.swissRankingArchive
    : (state.swissRanking || []);
  return {
    generatedAt: formatBeijingDateTime(),
    tournamentName: state.tournamentName || '未命名比赛',
    ranking: ranking.map(entry => ({
      rank: entry.rank,
      player: entry.player,
      record: `${entry.wins}-${entry.draws}-${entry.losses}`,
      points: entry.points,
      omw: Number(entry.omw || 0).toFixed(3),
      oow: Number(entry.oow || 0).toFixed(3),
      note: entry.dropped ? '退赛' : '',
    })),
    swissRounds: getSwissHistoryForReport(state).map(page => ({
      label: page.label,
      matches: page.matches.map(match => ({
        tableLabel: `${match.table ?? ''}${match.wasLive ? '（直播桌）' : ''}`,
        p1: match.p1 === 'BYE' ? 'BYE' : `${match.p1}（${formatRecordLine(match.p1RecordBefore)}）`,
        p2: match.p2 === 'BYE' ? 'BYE' : `${match.p2}（${formatRecordLine(match.p2RecordBefore)}）`,
        result: formatMatchResult(match),
      })),
    })),
    top8Rounds: getTop8HistoryForReport(state).map(group => ({
      label: group.label,
      matches: group.matches.map(match => ({
        tableLabel: `${match.table ?? ''}${match.wasLive ? '（直播桌）' : ''}`,
        p1: match.p1 || '',
        p2: match.p2 || '',
        result: formatMatchResult(match),
      })),
    })),
  };
}

function buildPlayerReportData(playerName, state = currentState) {
  const playerView = buildPlayerView(playerName);
  const completion = getPlayerCompletionStatus(playerName, state);
  if (!completion.finished) return null;
  const standings = (state.swissRankingArchive && state.swissRankingArchive.length > 0)
    ? state.swissRankingArchive
    : (state.swissRanking || []);
  const standing = standings.find(entry => entry.player === playerName) || completion.standing || null;
  const swissSource = (state.swissMatchHistory && state.swissMatchHistory.length > 0)
    ? state.swissMatchHistory
    : (state.swissMatchesArchive && state.swissMatchesArchive.length > 0)
    ? state.swissMatchesArchive
    : (state.matches || []).filter(m => typeof m.round === 'number');
  const swissHistory = swissSource
    .filter(m => m.done && (m.p1 === playerName || m.p2 === playerName))
    .map(match => mapHistoryItemForReport(match, playerName));
  const top8History = (state.matches || [])
    .filter(m => m.phase && m.done && (m.p1 === playerName || m.p2 === playerName))
    .map(match => mapHistoryItemForReport(match, playerName));
  return {
    generatedAt: formatBeijingDateTime(),
    tournamentName: state.tournamentName || '未命名比赛',
    playerName,
    finalStatus: completion.reason || completion.award || '比赛结束',
    finalAward: completion.award || '',
    record: formatRecordLine(playerView.record),
    points: playerView.record ? playerView.record.points || 0 : 0,
    swissRank: standing ? standing.rank : null,
    omw: standing ? Number(standing.omw || 0).toFixed(3) : null,
    oow: standing ? Number(standing.oow || 0).toFixed(3) : null,
    history: [...swissHistory, ...top8History],
  };
}

function buildReportPythonSource() {
  return `
import json
import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
report_type = payload.get("type")
target_path = payload["targetPath"]
data = payload["data"]

font_candidates = [
    os.path.join(os.getcwd(), "public", "shared", "fonts", "ud-shin-go-sc-r.ttf"),
    "/app/public/shared/fonts/ud-shin-go-sc-r.ttf",
    r"C:\\\\Windows\\\\Fonts\\\\msyh.ttc",
    r"C:\\\\Windows\\\\Fonts\\\\simhei.ttf",
    r"C:\\\\Windows\\\\Fonts\\\\simsun.ttc",
]
font_name = "Helvetica"
for font_path in font_candidates:
    if os.path.exists(font_path):
        try:
            pdfmetrics.registerFont(TTFont("ReportFont", font_path))
            font_name = "ReportFont"
            break
        except Exception:
            pass
if font_name == "Helvetica":
    try:
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        font_name = "STSong-Light"
    except Exception:
        pass

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="BodyCN", fontName=font_name, fontSize=9, leading=14))
styles.add(ParagraphStyle(name="TitleCN", fontName=font_name, fontSize=18, leading=22, spaceAfter=8))
styles.add(ParagraphStyle(name="HeadingCN", fontName=font_name, fontSize=12, leading=16, spaceBefore=6, spaceAfter=6))
styles.add(ParagraphStyle(name="MetaCN", fontName=font_name, fontSize=8, leading=11, textColor=colors.HexColor("#555555")))

def make_table(rows, col_widths=None):
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("LEADING", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#111827")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#c7c9cc")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table

doc = SimpleDocTemplate(target_path, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm)
story = []

if report_type == "tournament":
    story.append(Paragraph(data["tournamentName"], styles["TitleCN"]))
    story.append(Paragraph("导出时间：{}".format(data["generatedAt"]), styles["MetaCN"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph("瑞士轮总排名", styles["HeadingCN"]))
    ranking_rows = [["名次", "选手", "战绩", "积分", "对手胜率", "对手的对手胜率", "备注"]]
    for row in data.get("ranking", []):
        ranking_rows.append([row["rank"], row["player"], row["record"], row["points"], row["omw"], row["oow"], row["note"]])
    story.append(make_table(ranking_rows, [16*mm, 46*mm, 22*mm, 16*mm, 24*mm, 28*mm, 24*mm]))

    for page in data.get("swissRounds", []):
        story.append(PageBreak())
        story.append(Paragraph(page["label"], styles["HeadingCN"]))
        rows = [["桌号", "选手A", "选手B", "结果"]]
        for match in page.get("matches", []):
            rows.append([match["tableLabel"], match["p1"], match["p2"], match["result"]])
        story.append(make_table(rows, [20*mm, 60*mm, 60*mm, 34*mm]))

    if data.get("top8Rounds"):
        story.append(PageBreak())
        story.append(Paragraph("淘汰赛", styles["HeadingCN"]))
        for group in data.get("top8Rounds", []):
            story.append(Paragraph(group["label"], styles["BodyCN"]))
            rows = [["桌号", "选手A", "选手B", "结果"]]
            for match in group.get("matches", []):
                rows.append([match["tableLabel"], match["p1"], match["p2"], match["result"]])
            story.append(make_table(rows, [20*mm, 60*mm, 60*mm, 34*mm]))
            story.append(Spacer(1, 8))

elif report_type == "player":
    story.append(Paragraph("{} - 个人战报".format(data["tournamentName"]), styles["TitleCN"]))
    story.append(Paragraph("导出时间：{}".format(data["generatedAt"]), styles["MetaCN"]))
    story.append(Spacer(1, 6))
    meta_rows = [
        ["选手", data["playerName"], "最终结果", data["finalStatus"]],
        ["战绩", data["record"], "积分", data["points"]],
        ["瑞士轮排名", data["swissRank"] if data["swissRank"] is not None else "-", "对手胜率", data["omw"] if data["omw"] is not None else "-"],
        ["对手的对手胜率", data["oow"] if data["oow"] is not None else "-", "", ""],
    ]
    story.append(make_table([["项目", "内容", "项目", "内容"], *meta_rows], [24*mm, 62*mm, 24*mm, 62*mm]))
    story.append(Spacer(1, 10))
    story.append(Paragraph("个人对局记录", styles["HeadingCN"]))
    history_rows = [["阶段", "桌号", "对手", "本轮前战绩", "结果", "详情"]]
    for item in data.get("history", []):
        history_rows.append([
            item["stage"],
            f'{item["table"] if item["table"] is not None else "-"}{" [TV]" if item.get("wasLive") else ""}',
            item["opponent"] or "-",
            item["beforeRecord"] or "-",
            item["result"],
            item["resultText"],
        ])
    story.append(make_table(history_rows, [22*mm, 18*mm, 24*mm, 22*mm, 14*mm, 72*mm]))

doc.build(story)
print(target_path)
`;
}

function runPythonReport(reportType, data, targetPath) {
  const scriptPath = path.join(REPORTS_DIR, '_render_report.py');
  fs.writeFileSync(scriptPath, buildReportPythonSource(), 'utf8');
  const payload = JSON.stringify({ type: reportType, data, targetPath });
  const result = spawnSync(PYTHON_BIN, [scriptPath], {
    input: payload,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `report generation failed (${result.status})`);
  }
  return targetPath;
}

function exportTournamentReportFile(state = currentState) {
  if (!isTournamentFinished(state)) return null;
  const fileName = `${sanitizeFilePart(state.tournamentName, 'tournament')}-report.pdf`;
  const targetPath = path.join(REPORTS_DIR, fileName);
  runPythonReport('tournament', buildTournamentReportData(state), targetPath);
  return targetPath;
}

function exportPlayerReportFile(playerName, state = currentState) {
  const reportData = buildPlayerReportData(playerName, state);
  if (!reportData) return null;
  const fileName = `${sanitizeFilePart(state.tournamentName, 'tournament')}-${sanitizeFilePart(playerName, 'player')}-report.pdf`;
  const targetPath = path.join(REPORTS_DIR, fileName);
  runPythonReport('player', reportData, targetPath);
  return targetPath;
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
  fs.writeFileSync(path.join(DATA_DIR, `${currentState._id}.json`), JSON.stringify(serializeCurrentState(), null, 2));
}

function saveCurrentAsCache() {
  if (!currentState._id) return;
  tournaments.set(currentState._id, serializeCurrentState());
}

function broadcast() {
  saveCurrentAsCache();
  const state = buildClientState();
  const msg = JSON.stringify({ type: 'state', data: state });
  if (!wss) return;
  wss.clients.forEach(ws => {
    if (ws.tournamentId !== state.tournamentId) return;
    try { ws.send(msg); } catch (e) {}
  });
}

function tournamentFilePath(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

function listTournaments() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  return files
    .map(f => {
      const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      return { id: f.replace('.json', ''), name: d.tournamentName, phase: displayPhaseForTournament(d), date: d._createdAt };
    })
    .sort((a, b) => b.date - a.date);
}

function loadTournament(id) {
  const filePath = tournamentFilePath(id);
  if (!fs.existsSync(filePath)) return false;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
  const playerName = getPlayerNameById(playerNameOrId) || playerNameOrId;
  const inPool = currentState.players.includes(playerName);
  const profile = getPlayerProfileByName(playerName);
  const standings = currentState.swissRankingArchive && currentState.swissRankingArchive.length > 0
    ? currentState.swissRankingArchive
    : [];
  const archived = standings.find(entry => entry.player === playerName) || null;
  const rawActiveMatch = currentState.matches.find(m => !m.done && (m.p1 === playerName || m.p2 === playerName)) || null;
  const isLiveTable = !!(rawActiveMatch && currentState.currentLiveMatch && currentState.currentLiveMatch.id === rawActiveMatch.id);
  const activeMatch = rawActiveMatch ? { ...rawActiveMatch, isLiveTable } : null;
  const swissSource = (currentState.swissMatchesArchive && currentState.swissMatchesArchive.length > 0)
    ? currentState.swissMatchesArchive
    : currentState.matches.filter(m => typeof m.round === 'number');
  const swissHistory = swissSource.filter(m => m.done && (m.p1 === playerName || m.p2 === playerName)).map(m => ({
    id: m.id,
    round: m.round || null,
    phase: null,
    table: m.table || null,
    opponent: m.p1 === playerName ? m.p2 : m.p1,
    result: m.draw ? 'draw' : m.winner === playerName ? 'win' : 'loss',
    p1: m.p1,
    p2: m.p2,
    winner: m.winner,
    draw: !!m.draw,
    wasLive: !!m.wasLive,
  }));
  const top8History = currentState.matches
    .filter(m => m.phase && m.done && (m.p1 === playerName || m.p2 === playerName))
    .map(m => ({
      id: m.id,
      round: null,
      phase: m.phase || null,
      table: m.table || null,
      opponent: m.p1 === playerName ? m.p2 : m.p1,
      result: m.draw ? 'draw' : m.winner === playerName ? 'win' : 'loss',
      p1: m.p1,
      p2: m.p2,
      winner: m.winner,
      draw: !!m.draw,
      wasLive: !!m.wasLive,
    }));
  const history = [...swissHistory, ...top8History];
  const rec = archived
    ? { wins: archived.wins, draws: archived.draws, losses: archived.losses, points: archived.points }
    : inPool ? getRecord(playerName) : emptyRecord();
  const top8Overview = currentState.phase === 'top8'
    ? {
        stages: ['Quarter Finals', 'Semi Finals', 'Bronze Match', 'Finals'].map(phase => ({
          phase,
          matches: currentState.matches
            .filter(m => m.phase === phase)
            .map(m => ({
              id: m.id,
              table: m.table,
              p1: m.p1,
              p2: m.p2,
              winner: m.winner,
              done: !!m.done,
              p1Wins: m.p1Wins || 0,
              p2Wins: m.p2Wins || 0,
            })),
        })).filter(stage => stage.matches.length > 0),
      }
    : null;

  const playerTop8Matches = currentState.matches.filter(m => m.phase && (m.p1 === playerName || m.p2 === playerName));
  const hasUnfinishedTop8Match = playerTop8Matches.some(m => !m.done);
  const hasCompletedFinal = playerTop8Matches.some(m => m.done && m.phase === 'Finals');
  const hasCompletedBronze = playerTop8Matches.some(m => m.done && m.phase === 'Bronze Match');
  const lostQuarterFinal = playerTop8Matches.some(m => m.done && m.phase === 'Quarter Finals' && m.winner !== playerName);
  let mode = 'waiting';
  if (currentState.phase === 'setup') mode = inPool ? 'registered' : 'registration';
  else if (currentState.phase === 'swiss' && activeMatch) mode = 'active-match';
  else if (currentState.phase === 'swiss-ended' && archived) mode = 'swiss-summary';
  else if (currentState.phase === 'top8') {
    if (!currentState.top8.includes(playerName)) {
      mode = 'final-result';
    } else if (hasUnfinishedTop8Match) {
      mode = 'active-match';
    } else if (hasCompletedFinal || hasCompletedBronze || lostQuarterFinal) {
      mode = 'final-result';
    } else {
      mode = 'top8-waiting';
    }
  } else if (currentState.phase === 'done') mode = 'final-result';
  else if (currentState.phase === 'swiss' && inPool) mode = 'round-summary';

  const award = (currentState.phase === 'top8' || currentState.phase === 'done')
    ? getTop8AwardForPlayer(playerName, currentState)
    : null;

  const completion = getPlayerCompletionStatus(playerName, currentState);
  const liveRoomCode = activeMatch && activeMatch.liveRoomCode ? activeMatch.liveRoomCode : null;
  return {
    tournamentId: currentState._id,
    tournamentName: currentState.tournamentName,
    playerId: profile ? profile.playerId : null,
    phase: currentState.phase,
    round: currentState.round,
    mode,
    playerName,
    inPool,
    record: rec,
    activeMatch,
    history,
    standings: archived,
    top8: currentState.top8.includes(playerName),
    award,
    reportStatus: (currentState.playerReports || {})[playerName] || null,
    canExportReport: !!completion.finished,
    completionReason: completion.reason || null,
    isLiveTable,
    liveRoomCode,
    top8Overview,
  };
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
  return !!id && fs.existsSync(tournamentFilePath(id));
}

function sendTournamentPage(req, res, folder) {
  if (!tournamentExists(req.params.id)) return res.status(404).send('Tournament not found');
  return res.sendFile(path.join(PUBLIC_DIR, folder, 'index.html'));
}

app.use('/home', express.static(path.join(PUBLIC_DIR, 'home')));
app.use('/shared', express.static(path.join(PUBLIC_DIR, 'shared')));
app.use(['/admin', '/overlay', '/player', '/player-login'], (req, res) => res.redirect(302, '/'));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'home', 'index.html')));
app.get('/t/:id/admin', (req, res) => sendTournamentPage(req, res, 'admin'));
app.get('/t/:id/overlay', (req, res) => sendTournamentPage(req, res, 'overlay'));
app.get('/t/:id/player-login', (req, res) => sendTournamentPage(req, res, 'player'));

app.get('/api/tournaments/:tournamentId/state', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  res.json(buildClientState());
});
app.get('/api/tournaments', (req, res) => res.json(listTournaments()));
app.get('/api/tournaments/:tournamentId/player-view/:playerName', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const playerName = decodeURIComponent(req.params.playerName || '').trim();
  res.json(buildPlayerView(playerName));
});
app.get('/api/tournaments/:tournamentId/player-view-by-id/:playerId', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const playerId = decodeURIComponent(req.params.playerId || '').trim();
  res.json(buildPlayerView(playerId));
});

app.post('/api/tournaments', (req, res) => {
  const { action, name, id } = req.body || {};
  if (action === 'create') {
    const nextId = createTournament(name);
    broadcast();
    return res.json({ ok: true, id: nextId, state: buildClientState() });
  }
  if (action === 'load') {
    if (!loadTournament(id)) return res.status(404).json({ ok: false, err: 'not found' });
    broadcast();
    return res.json({ ok: true, state: buildClientState() });
  }
  if (action === 'rename') {
    const targetId = id || req.body.tournamentId;
    if (!targetId) return res.status(400).json({ ok: false, err: 'missing tournament id' });
    if (!syncTournamentRequest(targetId)) return res.status(404).json({ ok: false, err: 'tournament not found' });
    currentState.tournamentName = (name || '未命名比赛').trim();
    saveState();
    broadcast();
    return res.json({ ok: true, state: buildClientState() });
  }
  if (action === 'delete') {
    if (!id) return res.status(400).json({ ok: false, err: 'missing tournament id' });
    const filePath = tournamentFilePath(id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (currentState._id === id) {
      currentTournamentId = null;
      resetCurrentState(freshState());
      loadLatestTournamentIfAny();
      saveCurrentAsCache();
    }
    broadcast();
    return res.json({ ok: true, state: buildClientState() });
  }
  return res.status(400).json({ ok: false, err: 'unknown action' });
});

app.post('/api/tournaments/:tournamentId/players', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const { action, name } = req.body || {};
  if (action === 'add') addPlayer(name);
  else if (action === 'remove') removePlayer(name);
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/config', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  currentState.publicBaseUrlOverride = (req.body.publicBaseUrlOverride || '').trim();
  currentState.liveRoomCode = (req.body.liveRoomCode || '').trim();
  if (currentState.currentLiveMatch) {
    currentState.currentLiveMatch.liveRoomCode = currentState.liveRoomCode || null;
  }
  if (currentState.lastLiveMatch && currentState.lastLiveMatch.id) {
    currentState.lastLiveMatch.liveRoomCode = currentState.liveRoomCode || null;
  }
  currentState.matches = currentState.matches.map(match =>
    match.wasLive ? { ...match, liveRoomCode: currentState.liveRoomCode || null } : match,
  );
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/player-login', (req, res) => {
  const { playerName, confirmExisting } = req.body || {};
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const name = (playerName || '').trim();
  if (!name) return res.status(400).json({ ok: false, err: 'missing name' });

  const exists = currentState.players.includes(name);
  if (currentState.phase === 'setup') {
    if (!exists) {
      addPlayer(name);
      const session = ensurePlayerSession(name);
      saveState();
      broadcast();
      return res.json({ ok: true, created: true, ...session, player: buildPlayerView(name), state: buildClientState() });
    }
    if (confirmExisting) {
      const session = ensurePlayerSession(name);
      return res.json({ ok: true, existing: true, ...session, player: buildPlayerView(name), state: buildClientState() });
    }
    return res.json({ ok: false, code: 'NAME_EXISTS', message: '名称已存在，请确认是否为本人。' });
  }

  if (exists) {
    const session = ensurePlayerSession(name);
    return res.json({ ok: true, existing: true, ...session, player: buildPlayerView(name), state: buildClientState() });
  }

  return res.json({ ok: false, code: 'REGISTRATION_CLOSED', message: '比赛已经开始，报名已结束。' });
});

app.post('/api/tournaments/:tournamentId/player-report-win', (req, res) => {
  const { playerName } = req.body || {};
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const name = (playerName || '').trim();
  if (!name) return res.status(400).json({ ok: false, err: 'missing playerName' });
  const match = currentState.matches.find(m => !m.done && (m.p1 === name || m.p2 === name));
  if (!match) return res.json({ ok: false, err: 'active match not found' });
  currentState.playerReports = { ...(currentState.playerReports || {}), [name]: { type: currentState.phase === 'top8' ? 'game-win' : 'win', at: Date.now(), matchId: match.id } };
  if (currentState.phase === 'top8') {
    const nextP1Wins = (match.p1Wins || 0) + (match.p1 === name ? 1 : 0);
    const nextP2Wins = (match.p2Wins || 0) + (match.p2 === name ? 1 : 0);
    applyBo3Score(match.id, nextP1Wins, nextP2Wins);
  } else {
    applyResult(match.id, name);
  }
  const other = match.p1 === name ? match.p2 : match.p1;
  if (other && other !== 'BYE') {
    currentState.playerReports[other] = { type: currentState.phase === 'top8' ? 'opponent-scored' : 'opponent-reported', at: Date.now(), matchId: match.id };
  }
  saveState();
  broadcast();
  res.json({ ok: true, player: buildPlayerView(name), state: buildClientState() });
});
app.post('/api/tournaments/:tournamentId/drop-player', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  dropPlayer(req.body.name);
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/drop-player-from-match', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const applied = dropPlayerFromMatch(req.body.matchId, req.body.playerName);
  if (!applied) return res.json({ ok: false, err: 'match or player not found' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/start-swiss', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = startSwiss(req.body.rounds || 5);
  if (!ok) return res.json({ ok: false, err: 'not enough players' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/next-round', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  nextRound();
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/generate-matches', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/end-swiss', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  endSwiss();
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/revert-round', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  revertRound();
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/enter-top8', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = enterTop8();
  if (!ok) return res.json({ ok: false, err: 'not enough top8 players' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/cancel-top8', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  cancelTop8Confirm();
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/set-live', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const { matchId } = req.body || {};
  if (currentState.currentLiveMatch && currentState.currentLiveMatch.id === matchId) {
    currentState.currentLiveMatch = null;
    currentState.lastLiveMatch = null;
    currentState.overlayState = getPostMatchOverlayState();
    saveState();
    broadcast();
    return res.json({ ok: true, state: buildClientState() });
  }
  const match = currentState.matches.find(m => m.id === matchId);
  if (!match) return res.json({ ok: false, err: 'match not found' });
  match.wasLive = true;
  match.liveRoomCode = currentState.liveRoomCode || null;
  currentState.currentLiveMatch = match;
  currentState.lastLiveMatch = { id: match.id, p1: match.p1, p2: match.p2, table: match.table, round: currentState.round, liveRoomCode: match.liveRoomCode || null };
  currentState.overlayState = currentState.phase === 'top8' ? 'top8-live' : 'live';
  if (currentState.phase === 'swiss') {
    const featured = new Set(currentState._featuredSwissPlayers || []);
    if (match.p1 && match.p1 !== 'BYE') featured.add(match.p1);
    if (match.p2 && match.p2 !== 'BYE') featured.add(match.p2);
    currentState._featuredSwissPlayers = [...featured];
  }
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/swap-seats', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = swapMatchSeats(req.body.matchId);
  if (!ok) return res.json({ ok: false, err: 'match not found' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/result', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = applyResult(req.body.matchId, req.body.winnerId);
  if (!ok) return res.json({ ok: false, err: 'match not found' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/draw', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = applyDraw(req.body.matchId);
  if (!ok) return res.json({ ok: false, err: 'match not found' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.post('/api/tournaments/:tournamentId/bo3-score', (req, res) => {
  const syncOk = syncTournamentRequest(req.params.tournamentId);
  if (!syncOk) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const ok = applyBo3Score(req.body.matchId, req.body.p1Wins, req.body.p2Wins);
  if (!ok) return res.json({ ok: false, err: 'match not found' });
  saveState();
  broadcast();
  res.json({ ok: true, state: buildClientState() });
});

app.get('/api/tournaments/:tournamentId/export-report', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  try {
    const filePath = exportTournamentReportFile(currentState);
    if (!filePath) return res.status(400).json({ ok: false, err: 'tournament not finished' });
    return res.download(filePath, path.basename(filePath));
  } catch (err) {
    return res.status(500).json({ ok: false, err: err.message || 'export failed' });
  }
});

app.get('/api/tournaments/:tournamentId/export-player-report', (req, res) => {
  const ok = syncTournamentRequest(req.params.tournamentId);
  if (!ok) return res.status(404).json({ ok: false, err: 'tournament not found' });
  const playerName = decodeURIComponent(req.query.playerName || '').trim();
  if (!playerName) return res.status(400).json({ ok: false, err: 'missing playerName' });
  try {
    const filePath = exportPlayerReportFile(playerName, currentState);
    if (!filePath) return res.status(400).json({ ok: false, err: 'player not finished' });
    return res.download(filePath, path.basename(filePath));
  } catch (err) {
    return res.status(500).json({ ok: false, err: err.message || 'export failed' });
  }
});

const server = http.createServer(app);
wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const routeMatch = url.pathname.match(/^\/t\/([^/]+)\/ws\/?$/);
  const tournamentId = routeMatch ? decodeURIComponent(routeMatch[1]).trim() : '';
  ws.tournamentId = tournamentId;
  if (!tournamentId || !syncTournamentRequest(tournamentId)) {
    ws.send(JSON.stringify({ type: 'error', err: 'tournament not found' }));
    ws.close();
    return;
  }
  ws.send(JSON.stringify({ type: 'state', data: buildClientState() }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`2.1 server running on ${getPublicBaseUrl()}`);
});


