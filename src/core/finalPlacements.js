const { getEliminationPhaseOrderForState, getSingleEliminationStageMatches, normalizeBracketSize } = require('./top8');

const PODIUM_LABELS = ['冠军', '亚军', '季军', '殿军'];

function getStages(state = {}) {
  return Array.isArray(state.stages) && state.stages.length > 0
    ? state.stages
    : (Array.isArray(state.tournamentSettings?.stages) ? state.tournamentSettings.stages : []);
}

function playerOf(entry = {}) {
  return entry.player || entry.displayName || entry.name || '';
}

function uniquePlayers(players = []) {
  return [...new Set(players.filter(player => player && player !== 'BYE' && player !== 'TBD'))];
}

function swissRankings(state = {}) {
  return Array.isArray(state.swissRankingArchive) && state.swissRankingArchive.length > 0
    ? state.swissRankingArchive
    : (Array.isArray(state.swissRanking) ? state.swissRanking : []);
}

function resultForStage(state = {}, stage = null) {
  return stage?.id && state.stageResults ? state.stageResults[stage.id] : null;
}

function numericRank(value) {
  if (value === null || value === undefined || value === '') return null;
  const rank = Number(value);
  return Number.isFinite(rank) ? rank : null;
}

function finalResultStage(state = {}) {
  const stages = getStages(state);
  const resultIds = new Set(Object.keys(state.stageResults || {}));
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    if (resultIds.has(stages[index].id)) return stages[index];
  }
  return stages[stages.length - 1] || null;
}

function groupLabelFromIndex(index) {
  const n = Number(index);
  return Number.isInteger(n) && n > 0 ? `${String.fromCharCode(64 + n)}组` : '小组';
}

function groupLookupForStage(state = {}, stageId = '') {
  const lookup = new Map();
  const groups = Array.isArray(state.groupAssignments?.[stageId]) ? state.groupAssignments[stageId] : [];
  groups.forEach((group, index) => {
    const label = group.label || groupLabelFromIndex(group.index || index + 1);
    (group.entrants || []).forEach(player => {
      if (player) lookup.set(player, label);
    });
  });
  return lookup;
}

function addPlacement(target, player, patch = {}) {
  if (!player || player === 'BYE' || player === 'TBD') return;
  if (target.has(player)) {
    target.set(player, { ...target.get(player), ...patch, player });
    return;
  }
  target.set(player, { player, displayName: player, ...patch });
}

function addPodiumPlacement(target, rank, player, source = 'podium') {
  addPlacement(target, player, {
    rank,
    rankLabel: PODIUM_LABELS[rank - 1] || `#${rank}`,
    resultLabel: PODIUM_LABELS[rank - 1] || `第 ${rank} 名`,
    source,
  });
}

function loserOf(match = {}) {
  if (!match.done || !match.winner) return null;
  if (match.winner === match.p1) return match.p2;
  if (match.winner === match.p2) return match.p1;
  return null;
}

function phaseSize(phase = '') {
  if (phase === 'Finals') return 2;
  if (phase === 'Semi Finals') return 4;
  if (phase === 'Quarter Finals') return 8;
  const roundOf = String(phase || '').match(/^Round of (\d+)$/i);
  return roundOf ? Number(roundOf[1]) : null;
}

function phaseRankLabel(size) {
  if (size === 4) return '四强';
  if (size === 8) return '八强';
  if (size === 16) return '十六强';
  if (size === 32) return '三十二强';
  return size ? `${size}强` : '';
}

function seedRankMap(state = {}) {
  const map = new Map();
  swissRankings(state).forEach((entry, index) => {
    const player = playerOf(entry);
    if (player) map.set(player, Number(entry.rank) || index + 1);
  });
  if (map.size === 0 && Array.isArray(state.top8)) {
    state.top8.forEach((player, index) => {
      if (player) map.set(player, index + 1);
    });
  }
  return map;
}

function sortPlayersBySeed(players = [], state = {}) {
  const seedRanks = seedRankMap(state);
  return [...players].sort((a, b) =>
    (seedRanks.get(a) || 9999) - (seedRanks.get(b) || 9999)
    || String(a).localeCompare(String(b), 'zh-CN')
  );
}

function bracketSizeForStage(state = {}, stage = null) {
  return normalizeBracketSize(
    state.top8?.length || stage?.elimination?.bracketSize || state.players?.length || 8,
    8,
  );
}

function buildSingleEliminationPlacements(state = {}, stage = null, result = null) {
  const placements = new Map();
  const matches = getSingleEliminationStageMatches(state, stage);
  const final = matches.find(match => match.phase === 'Finals' && match.done);
  const bronze = matches.find(match => match.phase === 'Bronze Match' && match.done);

  if (final?.winner) {
    addPodiumPlacement(placements, 1, final.winner, 'single_elimination');
    addPodiumPlacement(placements, 2, loserOf(final), 'single_elimination');
  }
  if (bronze?.winner) {
    addPodiumPlacement(placements, 3, bronze.winner, 'single_elimination');
    addPodiumPlacement(placements, 4, loserOf(bronze), 'single_elimination');
  }

  const bracketSize = bracketSizeForStage(state, stage);
  const phaseOrder = getEliminationPhaseOrderForState(state, stage);
  const phaseLosers = new Map();
  for (const phase of phaseOrder) {
    const size = phaseSize(phase);
    if (!size || size < 4) continue;
    const losers = uniquePlayers(matches
      .filter(match => match.phase === phase)
      .map(loserOf));
    if (losers.length > 0) phaseLosers.set(size, sortPlayersBySeed(losers, state));
  }

  [...phaseLosers.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([size, players]) => {
      const alreadyPodium = size === 4 && bronze?.winner;
      if (alreadyPodium) return;
      const firstRank = Math.floor(size / 2) + 1;
      const label = phaseRankLabel(size);
      players.forEach((player, index) => {
        addPlacement(placements, player, {
          rank: firstRank + index,
          rankLabel: label,
          resultLabel: label,
          source: 'single_elimination',
        });
      });
    });

  if (result && Array.isArray(result.standings)) {
    result.standings.forEach((entry, index) => {
      const player = playerOf(entry);
      if (!player || placements.has(player)) return;
      const rank = Number(entry.rank) || index + 1;
      addPlacement(placements, player, {
        rank,
        rankLabel: rank <= 4 ? (PODIUM_LABELS[rank - 1] || `#${rank}`) : `#${rank}`,
        resultLabel: rank <= 4 ? (PODIUM_LABELS[rank - 1] || `第 ${rank} 名`) : `第 ${rank} 名`,
        source: 'stage_result',
      });
    });
  }

  const hasQualificationRanking = swissRankings(state).length > 0;
  if (hasQualificationRanking) {
    swissRankings(state).forEach(entry => {
      const player = playerOf(entry);
      if (!player || placements.has(player)) return;
      const rank = Number(entry.rank) || null;
      addPlacement(placements, player, {
        rank,
        rankLabel: rank ? `#${rank}` : '瑞士轮排名',
        resultLabel: rank ? `瑞士轮第 ${rank}` : '止步瑞士轮',
        source: 'swiss',
      });
    });
  }

  if (bracketSize >= 4) {
    const firstRoundSize = Math.max(4, bracketSize);
    const topCutPlayers = uniquePlayers(state.top8 || []);
    topCutPlayers.forEach(player => {
      if (!placements.has(player)) {
        addPlacement(placements, player, {
          rank: null,
          rankLabel: phaseRankLabel(firstRoundSize),
          resultLabel: phaseRankLabel(firstRoundSize),
          source: 'single_elimination',
        });
      }
    });
  }

  return [...placements.values()].sort(comparePlacements);
}

function buildGroupPlacements(state = {}, stage = null, result = null) {
  if (!stage || !result || !Array.isArray(result.standings)) return [];
  const groupLookup = groupLookupForStage(state, stage.id);
  const advancers = new Set(result.advancers || []);
  return result.standings.map((entry, index) => {
    const player = playerOf(entry);
    const rank = Number(entry.rank) || index + 1;
    const groupLabel = entry.groupLabel || groupLookup.get(player) || '小组';
    const resultLabel = `${groupLabel}第 ${rank}`;
    return {
      player,
      displayName: entry.displayName || player,
      rank: null,
      groupRank: rank,
      groupLabel,
      rankLabel: advancers.has(player) ? '小组出线' : resultLabel,
      resultLabel,
      source: 'groups',
    };
  }).filter(entry => entry.player);
}

function buildSwissPlacements(state = {}) {
  return swissRankings(state).map((entry, index) => {
    const rank = Number(entry.rank) || index + 1;
    const player = playerOf(entry);
    return {
      player,
      displayName: entry.displayName || player,
      rank,
      rankLabel: `#${rank}`,
      resultLabel: `瑞士轮第 ${rank}`,
      source: 'swiss',
    };
  }).filter(entry => entry.player);
}

function buildStageResultPlacements(result = null, source = 'stage_result') {
  if (!result || !Array.isArray(result.standings)) return [];
  return result.standings.map((entry, index) => {
    const rank = Number(entry.rank) || index + 1;
    const player = playerOf(entry);
    return {
      player,
      displayName: entry.displayName || player,
      rank,
      rankLabel: rank <= 4 ? (PODIUM_LABELS[rank - 1] || `#${rank}`) : `#${rank}`,
      resultLabel: rank <= 4 ? (PODIUM_LABELS[rank - 1] || `第 ${rank} 名`) : `第 ${rank} 名`,
      source,
    };
  }).filter(entry => entry.player);
}

function comparePlacements(a = {}, b = {}) {
  const ar = numericRank(a.rank) ?? 9999;
  const br = numericRank(b.rank) ?? 9999;
  if (ar !== br) return ar - br;
  const agr = numericRank(a.groupRank) ?? 9999;
  const bgr = numericRank(b.groupRank) ?? 9999;
  if (agr !== bgr) return agr - bgr;
  return String(a.player || '').localeCompare(String(b.player || ''), 'zh-CN');
}

function buildFinalPlacements(state = {}) {
  const stage = finalResultStage(state);
  const result = resultForStage(state, stage);
  if (stage?.type === 'single_elimination') return buildSingleEliminationPlacements(state, stage, result);
  if (stage?.type === 'groups' || stage?.type === 'group_round_robin') return buildGroupPlacements(state, stage, result);
  if (stage?.type === 'swiss') return buildSwissPlacements(state);
  if (result && Array.isArray(result.standings)) return buildStageResultPlacements(result, stage?.type || 'stage_result');
  if (swissRankings(state).length > 0) return buildSwissPlacements(state);
  return [];
}

function finalPlacementForPlayer(state = {}, playerName = '') {
  return buildFinalPlacements(state).find(entry => entry.player === playerName || entry.displayName === playerName) || null;
}

module.exports = {
  buildFinalPlacements,
  finalPlacementForPlayer,
  phaseRankLabel,
  finalResultStage,
};
