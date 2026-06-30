const { uniqueEntrants, getEntryListForStage, setStageResult } = require('./advancement');

function normalizeGroupCount(value, fallback = 2) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 2 ? number : fallback;
}

function normalizeAdvancePerGroup(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeGroupRound(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function seededShuffle(values = [], seed = 'pts') {
  const next = [...values];
  let state = 0;
  for (const char of String(seed || 'pts')) state = ((state * 31) + char.charCodeAt(0)) >>> 0;
  for (let i = next.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function distributeGroups(entrants = [], stage = {}, options = {}) {
  const groupCount = normalizeGroupCount(stage.groups?.groupCount, 2);
  const seeding = options.seeding || stage.groups?.seeding || 'snake';
  const names = uniqueEntrants(entrants);
  const ordered = seeding === 'random' ? seededShuffle(names, options.seed || stage.id) : [...names];
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    id: `${stage.id || 'stage_groups_1'}-g${index + 1}`,
    index: index + 1,
    label: `${String.fromCharCode(65 + index)}组`,
    entrants: [],
  }));

  ordered.forEach((entrant, index) => {
    let groupIndex = index % groupCount;
    if (seeding === 'snake') {
      const block = Math.floor(index / groupCount);
      const offset = index % groupCount;
      groupIndex = block % 2 === 0 ? offset : groupCount - 1 - offset;
    }
    groups[groupIndex].entrants.push(entrant);
  });

  return groups;
}

function createRoundRobinRounds(entrants = []) {
  const bye = '__PTS_GROUP_BYE__';
  const slots = uniqueEntrants(entrants).filter(Boolean);
  if (slots.length < 2) return [];
  if (slots.length % 2 === 1) slots.push(bye);
  const rounds = [];
  const rotation = [...slots];
  const roundCount = rotation.length - 1;
  const pairCount = rotation.length / 2;

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex++) {
    const pairs = [];
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
      let p1 = rotation[pairIndex];
      let p2 = rotation[rotation.length - 1 - pairIndex];
      if (p1 === bye || p2 === bye) continue;
      if (roundIndex % 2 === 1) [p1, p2] = [p2, p1];
      pairs.push([p1, p2]);
    }
    rounds.push(pairs);
    rotation.splice(1, 0, rotation.pop());
  }

  return rounds;
}

function createGroupRoundRobinMatches(groups = [], stage = {}) {
  const stageId = stage.id || 'stage_groups_1';
  const matches = [];
  const nextTableByRound = new Map();
  for (const group of groups) {
    const entrants = uniqueEntrants(group.entrants);
    const rounds = createRoundRobinRounds(entrants);
    rounds.forEach((pairs, roundIndex) => {
      const groupRound = roundIndex + 1;
      for (const [p1, p2] of pairs) {
        const nextTable = (nextTableByRound.get(groupRound) || 0) + 1;
        nextTableByRound.set(groupRound, nextTable);
        matches.push({
          id: `${stageId}-g${group.index}-r${groupRound}-m${nextTable}`,
          stageId,
          stagePhase: 'groups',
          groupId: group.id,
          groupIndex: group.index,
          groupLabel: group.label,
          groupRound,
          table: nextTable,
          p1,
          p2,
          winner: null,
          done: false,
          draw: false,
          p1Wins: 0,
          p2Wins: 0,
          liveRoomCode: null,
          wasLive: false,
        });
      }
    });
  }
  return matches;
}

function groupPairKey(a, b) {
  return [a, b].map(value => String(value || '')).sort().join('||');
}

function shouldNormalizeGroupSchedule(matches = []) {
  if (matches.length === 0) return false;
  const rounds = new Set(matches.map(match => normalizeGroupRound(match.groupRound, 1)));
  if (rounds.size > 1) return false;
  const playersByRound = new Map();
  for (const match of matches) {
    const round = normalizeGroupRound(match.groupRound, 1);
    if (!playersByRound.has(round)) playersByRound.set(round, new Set());
    const players = playersByRound.get(round);
    for (const player of [match.p1, match.p2]) {
      if (!player || player === 'BYE') continue;
      if (players.has(player)) return true;
      players.add(player);
    }
  }
  return false;
}

function normalizeGroupSchedule(state = {}, stage = null) {
  if (!stage) return false;
  const existingMatches = getGroupMatches(state, stage.id);
  if (!shouldNormalizeGroupSchedule(existingMatches)) {
    if (state.phase === 'groups') {
      const currentRound = getCurrentGroupRound(state, stage);
      state.groupRound = currentRound;
      state.groupStageRounds = {
        ...(state.groupStageRounds || {}),
        [stage.id]: currentRound,
      };
    }
    return false;
  }
  const groups = state.groupAssignments?.[stage.id] || distributeGroups(getEntryListForStage(state, stage), stage);
  const oldByPair = new Map();
  for (const match of existingMatches) oldByPair.set(`${match.groupId || ''}::${groupPairKey(match.p1, match.p2)}`, match);
  const normalizedMatches = createGroupRoundRobinMatches(groups, stage).map(match => {
    const old = oldByPair.get(`${match.groupId || ''}::${groupPairKey(match.p1, match.p2)}`);
    return old ? {
      ...match,
      winner: old.winner ?? null,
      done: !!old.done,
      draw: !!old.draw,
      p1Wins: old.p1 === match.p1 ? (old.p1Wins || 0) : (old.p2Wins || 0),
      p2Wins: old.p1 === match.p1 ? (old.p2Wins || 0) : (old.p1Wins || 0),
      liveRoomCode: old.liveRoomCode || null,
      wasLive: !!old.wasLive,
    } : match;
  });
  const normalizedIds = new Set(normalizedMatches.map(match => match.id));
  state.matches = (state.matches || [])
    .filter(match => match.stageId !== stage.id)
    .concat(normalizedMatches);
  if (state.currentLiveMatch && !normalizedIds.has(state.currentLiveMatch.id)) state.currentLiveMatch = null;
  if (state.pendingLiveMatch && !normalizedIds.has(state.pendingLiveMatch.id)) state.pendingLiveMatch = null;
  if (state.lastLiveMatch && !normalizedIds.has(state.lastLiveMatch.id)) state.lastLiveMatch = null;
  const rounds = [...new Set(normalizedMatches.map(match => normalizeGroupRound(match.groupRound, 1)))]
    .sort((a, b) => a - b);
  const currentRound = rounds.find(round =>
    normalizedMatches.some(match => normalizeGroupRound(match.groupRound, 1) === round && !match.done),
  ) || rounds[rounds.length - 1] || getCurrentGroupRound(state, stage);
  state.groupRound = currentRound;
  state.groupStageRounds = {
    ...(state.groupStageRounds || {}),
    [stage.id]: currentRound,
  };
  return true;
}

function enterGroups(state = {}, stage = null, options = {}) {
  if (!stage) return false;
  const entrants = getEntryListForStage(state, stage);
  const groupCount = normalizeGroupCount(stage.groups?.groupCount, 2);
  if (entrants.length < groupCount) return false;
  const groups = distributeGroups(entrants, stage, options);
  const matches = createGroupRoundRobinMatches(groups, stage);
  state.phase = 'groups';
  state.activeStageId = stage.id;
  state.currentLiveMatch = null;
  state.pendingLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = 'overview';
  state.groupRound = 1;
  state.groupStageRounds = {
    ...(state.groupStageRounds || {}),
    [stage.id]: 1,
  };
  state.groupAssignments = {
    ...(state.groupAssignments || {}),
    [stage.id]: groups,
  };
  state.matches = (state.matches || []).filter(match => match.stageId !== stage.id);
  state.matches.push(...matches);
  return true;
}

function getGroupMatches(state = {}, stageId) {
  return (state.matches || []).filter(match => match.stageId === stageId && match.stagePhase === 'groups');
}

function archiveGroupMatches(state = {}, stageId = '') {
  const matches = getGroupMatches(state, stageId);
  if (matches.length === 0) return [];
  const history = Array.isArray(state.groupMatchHistory) ? [...state.groupMatchHistory] : [];
  const byId = new Map(history.map(match => [match.id, match]));
  for (const match of matches) {
    if (!match.done) continue;
    byId.set(match.id, { ...match });
  }
  const archived = [...byId.values()].sort((a, b) =>
    String(a.stageId || '').localeCompare(String(b.stageId || ''), 'zh-CN')
    || (a.groupRound || 0) - (b.groupRound || 0)
    || (a.groupIndex || 0) - (b.groupIndex || 0)
    || (a.table || 0) - (b.table || 0)
  );
  state.groupMatchHistory = archived;
  return archived;
}

function getGroupRoundCount(matches = []) {
  return matches.reduce((max, match) => Math.max(max, normalizeGroupRound(match.groupRound, 1)), 0);
}

function getCurrentGroupRound(state = {}, stage = null) {
  const stageId = stage?.id;
  const stageRound = stageId ? state.groupStageRounds?.[stageId] : null;
  return normalizeGroupRound(stageRound || state.groupRound || 1, 1);
}

function getCurrentGroupRoundMatches(state = {}, stage = null) {
  const matches = getGroupMatches(state, stage?.id);
  const currentRound = getCurrentGroupRound(state, stage);
  return matches.filter(match => normalizeGroupRound(match.groupRound, 1) === currentRound);
}

function isCurrentGroupRoundComplete(state = {}, stage = null) {
  const matches = getCurrentGroupRoundMatches(state, stage);
  return matches.length > 0 && matches.every(match => !!match.done);
}

function advanceGroupRound(state = {}, stage = null) {
  if (!stage) return { ok: false, err: 'stage not found' };
  const matches = getGroupMatches(state, stage.id);
  if (matches.length === 0) return { ok: false, err: 'stage has no matches' };
  const currentRound = getCurrentGroupRound(state, stage);
  const roundMatches = matches.filter(match => normalizeGroupRound(match.groupRound, 1) === currentRound);
  if (roundMatches.length === 0) return { ok: false, err: 'current group round has no matches' };
  if (!roundMatches.every(match => !!match.done)) return { ok: false, err: 'current group round is not complete' };
  const roundCount = getGroupRoundCount(matches);
  if (currentRound >= roundCount) return { ok: false, err: 'group stage is ready to complete' };
  const nextRound = currentRound + 1;
  state.groupRound = nextRound;
  state.groupStageRounds = {
    ...(state.groupStageRounds || {}),
    [stage.id]: nextRound,
  };
  state.currentLiveMatch = null;
  state.pendingLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = 'overview';
  return { ok: true, groupRound: nextRound, roundCount };
}

function buildGroupStandingEntry(entrant, matches = []) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let gameWins = 0;
  let gameLosses = 0;
  let played = 0;
  for (const match of matches) {
    if (!match.done || (match.p1 !== entrant && match.p2 !== entrant)) continue;
    played++;
    const selfWins = match.p1 === entrant ? match.p1Wins || 0 : match.p2Wins || 0;
    const oppWins = match.p1 === entrant ? match.p2Wins || 0 : match.p1Wins || 0;
    gameWins += selfWins;
    gameLosses += oppWins;
    if (match.draw) draws++;
    else if (match.winner === entrant) wins++;
    else losses++;
  }
  const points = wins * 3 + draws;
  const gameDiff = gameWins - gameLosses;
  return {
    player: entrant,
    wins,
    draws,
    losses,
    points,
    gameWins,
    gameLosses,
    gameDiff,
    played,
  };
}

function getGroupOpponents(player, matches = []) {
  return matches
    .filter(match => match.done && (match.p1 === player || match.p2 === player))
    .map(match => (match.p1 === player ? match.p2 : match.p1))
    .filter(opponent => opponent && opponent !== 'BYE');
}

function getGroupPlayerWinPercentage(player, standingsByPlayer = new Map()) {
  const entry = standingsByPlayer.get(player);
  if (!entry || !entry.played) return 0;
  const raw = (entry.wins + entry.draws * 0.5) / entry.played;
  return Math.max(0.25, raw);
}

function addGroupResistanceMetrics(standings = [], matches = []) {
  const standingsByPlayer = new Map(standings.map(entry => [entry.player, entry]));
  return standings.map(entry => {
    const opponents = getGroupOpponents(entry.player, matches);
    const opponentWinRates = opponents.map(opponent => getGroupPlayerWinPercentage(opponent, standingsByPlayer));
    const omw = opponentWinRates.length
      ? opponentWinRates.reduce((sum, value) => sum + value, 0) / opponentWinRates.length
      : 0;
    const oow = opponents.length
      ? opponents
          .map(opponent => getGroupOpponents(opponent, matches))
          .map(opponentsOpponents => {
            const rates = opponentsOpponents
              .filter(opponent => opponent && opponent !== 'BYE')
              .map(opponent => getGroupPlayerWinPercentage(opponent, standingsByPlayer));
            return rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : 0;
          })
          .reduce((sum, value) => sum + value, 0) / opponents.length
      : 0;
    return { ...entry, omw, oow };
  });
}

function getHeadToHeadResult(a, b, matches = []) {
  const direct = matches.find(match =>
    match.done &&
    !match.draw &&
    ((match.p1 === a && match.p2 === b) || (match.p1 === b && match.p2 === a)),
  );
  if (!direct) return 0;
  if (direct.winner === a) return -1;
  if (direct.winner === b) return 1;
  return 0;
}

function sortGroupStandings(standings = [], matches = []) {
  return addGroupResistanceMetrics(standings, matches).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.omw !== a.omw) return b.omw - a.omw;
    if (b.oow !== a.oow) return b.oow - a.oow;
    if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
    if (b.gameWins !== a.gameWins) return b.gameWins - a.gameWins;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const h2h = getHeadToHeadResult(a.player, b.player, matches);
    if (h2h !== 0) return h2h;
    return a.player.localeCompare(b.player, 'zh-CN');
  });
}

function buildGroupStandings(state = {}, stage = null) {
  if (!stage) return [];
  const groups = state.groupAssignments?.[stage.id] || distributeGroups(getEntryListForStage(state, stage), stage);
  const matches = getGroupMatches(state, stage.id);
  return groups.map(group => {
    const groupMatches = matches.filter(match => match.groupId === group.id);
    const standings = sortGroupStandings(
      group.entrants.map(entrant => buildGroupStandingEntry(entrant, groupMatches)),
      groupMatches,
    ).map((entry, index) => ({
      ...entry,
      rank: index + 1,
      groupId: group.id,
      groupIndex: group.index,
      groupLabel: group.label,
    }));
    return { ...group, standings };
  });
}

function completeGroups(state = {}, stage = null) {
  if (!stage) return { ok: false, err: 'stage not found' };
  const matches = getGroupMatches(state, stage.id);
  if (matches.length === 0) return { ok: false, err: 'stage has no matches' };
  if (!matches.every(match => match.done)) return { ok: false, err: 'stage is not complete' };
  const advancePerGroup = normalizeAdvancePerGroup(stage.groups?.advancePerGroup ?? stage.advancement?.count, 1);
  const grouped = buildGroupStandings(state, stage);
  const flattenedStandings = grouped.flatMap(group => group.standings);
  const advancers = grouped.flatMap(group => group.standings.slice(0, advancePerGroup).map(entry => entry.player));
  const result = setStageResult(state, stage.id, {
    standings: flattenedStandings,
    advancers,
    metadata: {
      groupCount: grouped.length,
      advancePerGroup,
    },
  });
  archiveGroupMatches(state, stage.id);
  state.phase = 'groups-ended';
  state.currentLiveMatch = null;
  state.pendingLiveMatch = null;
  state.lastLiveMatch = null;
  state.lastResult = null;
  state.overlayState = 'overview';
  return { ok: true, result, groups: grouped };
}

module.exports = {
  normalizeGroupCount,
  normalizeAdvancePerGroup,
  normalizeGroupRound,
  distributeGroups,
  createRoundRobinRounds,
  createGroupRoundRobinMatches,
  enterGroups,
  getGroupMatches,
  getGroupRoundCount,
  getCurrentGroupRound,
  getCurrentGroupRoundMatches,
  isCurrentGroupRoundComplete,
  advanceGroupRound,
  archiveGroupMatches,
  normalizeGroupSchedule,
  buildGroupStandingEntry,
  buildGroupStandings,
  completeGroups,
};
