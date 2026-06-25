const SCHEMA_VERSION = 3;
const CURRENT_PTS_PRESET_ID = 'current_pts_default';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeOddPositiveInt(value, fallback) {
  const number = normalizePositiveInt(value, fallback);
  return number % 2 === 1 ? number : number + 1;
}

function createCurrentPtsStages(options = {}) {
  const topCutSize = normalizePositiveInt(options.topCutSize, 8);
  const swissBestOf = normalizeOddPositiveInt(options.swissBestOf, 1);
  const topCutBestOf = normalizeOddPositiveInt(options.topCutBestOf, 3);

  return [
    {
      id: 'stage_swiss_1',
      role: 'qualification',
      type: 'swiss',
      name: '瑞士轮阶段',
      entrySource: { type: 'all_entrants' },
      matchRules: {
        bestOf: swissBestOf,
        allowDraw: true,
        scoreMode: 'match',
      },
      swiss: {
        roundPolicy: 'auto_by_entrant_count',
        pairingMethod: 'swiss',
        byePolicy: 'avoid_repeat',
      },
      advancement: {
        mode: 'top_cut',
        count: topCutSize,
        targetStageId: 'stage_top_cut_1',
      },
    },
    {
      id: 'stage_top_cut_1',
      role: 'finals',
      type: 'single_elimination',
      name: '淘汰赛阶段',
      entrySource: {
        type: 'previous_stage_advancers',
        fromStageId: 'stage_swiss_1',
      },
      matchRules: {
        bestOf: topCutBestOf,
        allowDraw: false,
        scoreMode: 'games',
      },
      elimination: {
        bracketSize: topCutSize,
        bronzeMatch: true,
        seeding: 'rank_order',
      },
    },
  ];
}

function createSwissOnlyStages(options = {}) {
  const swissBestOf = normalizeOddPositiveInt(options.swissBestOf, 1);
  return [
    {
      id: 'stage_swiss_1',
      role: 'qualification',
      type: 'swiss',
      name: '瑞士轮阶段',
      entrySource: { type: 'all_entrants' },
      matchRules: {
        bestOf: swissBestOf,
        allowDraw: true,
        scoreMode: 'match',
      },
      swiss: {
        roundPolicy: 'auto_by_entrant_count',
        pairingMethod: 'swiss',
        byePolicy: 'avoid_repeat',
      },
      advancement: {
        mode: 'none',
        count: 0,
        targetStageId: null,
      },
    },
  ];
}

function createGroupsTopCutStages(options = {}) {
  const groupCount = normalizePositiveInt(options.groupCount, 4);
  const advancePerGroup = normalizePositiveInt(options.advancePerGroup, 2);
  const topCutSize = normalizePositiveInt(options.topCutSize, groupCount * advancePerGroup);
  const groupBestOf = normalizeOddPositiveInt(options.groupBestOf, 1);
  const topCutBestOf = normalizeOddPositiveInt(options.topCutBestOf, 3);

  return [
    {
      id: 'stage_groups_1',
      role: 'qualification',
      type: 'groups',
      name: '小组赛阶段',
      entrySource: { type: 'all_entrants' },
      matchRules: {
        bestOf: groupBestOf,
        allowDraw: true,
        scoreMode: 'match',
      },
      groups: {
        groupCount,
        advancePerGroup,
        seeding: 'snake',
        tiebreakers: ['points', 'omw', 'oow'],
      },
      advancement: {
        mode: 'per_group',
        count: advancePerGroup,
        targetStageId: 'stage_top_cut_1',
      },
    },
    {
      id: 'stage_top_cut_1',
      role: 'finals',
      type: 'single_elimination',
      name: '淘汰赛阶段',
      entrySource: {
        type: 'previous_stage_advancers',
        fromStageId: 'stage_groups_1',
      },
      matchRules: {
        bestOf: topCutBestOf,
        allowDraw: false,
        scoreMode: 'games',
      },
      elimination: {
        bracketSize: topCutSize,
        bronzeMatch: true,
        seeding: 'rank_order',
      },
    },
  ];
}

function createSingleEliminationStages(options = {}) {
  const bracketSize = normalizePositiveInt(options.bracketSize, 8);
  const topCutBestOf = normalizeOddPositiveInt(options.topCutBestOf, 3);
  return [
    {
      id: 'stage_single_elimination_1',
      role: 'finals',
      type: 'single_elimination',
      name: '单败淘汰阶段',
      entrySource: { type: 'all_entrants' },
      matchRules: {
        bestOf: topCutBestOf,
        allowDraw: false,
        scoreMode: 'games',
      },
      elimination: {
        bracketSize,
        bronzeMatch: bracketSize >= 4,
        seeding: 'rank_order',
      },
    },
  ];
}

function createDoubleEliminationStages(options = {}) {
  const bracketSize = normalizePositiveInt(options.bracketSize, 8);
  const bestOf = normalizeOddPositiveInt(options.bestOf, 3);
  return [
    {
      id: 'stage_double_elimination_1',
      role: 'finals',
      type: 'double_elimination',
      name: '双败淘汰阶段',
      entrySource: { type: 'all_entrants' },
      matchRules: {
        bestOf,
        allowDraw: false,
        scoreMode: 'games',
      },
      doubleElimination: {
        bracketSize,
        grandFinalReset: options.grandFinalReset !== false,
        bronzeMatch: !!options.bronzeMatch,
      },
    },
  ];
}

function createSingleEliminationStage(options = {}) {
  const bracketSize = normalizePositiveInt(options.bracketSize || options.topCutSize, 8);
  const bestOf = normalizeOddPositiveInt(options.bestOf || options.topCutBestOf || options.finalsBestOf, 3);
  return {
    id: options.id || 'stage_single_elimination_1',
    role: 'finals',
    type: 'single_elimination',
    name: options.name || '淘汰赛阶段',
    entrySource: options.entrySource || { type: 'all_entrants' },
    matchRules: {
      bestOf,
      allowDraw: false,
      scoreMode: 'games',
    },
    elimination: {
      bracketSize,
      bronzeMatch: options.bronzeMatch !== false,
      seeding: 'rank_order',
    },
  };
}

function createDoubleEliminationStage(options = {}) {
  const bracketSize = normalizePositiveInt(options.bracketSize || options.topCutSize, 8);
  const bestOf = normalizeOddPositiveInt(options.bestOf || options.finalsBestOf, 3);
  return {
    id: options.id || 'stage_double_elimination_1',
    role: 'finals',
    type: 'double_elimination',
    name: options.name || '双败淘汰阶段',
    entrySource: options.entrySource || { type: 'all_entrants' },
    matchRules: {
      bestOf,
      allowDraw: false,
      scoreMode: 'games',
    },
    doubleElimination: {
      bracketSize,
      grandFinalReset: options.grandFinalReset !== false,
      bronzeMatch: !!options.bronzeMatch,
    },
  };
}

function createCustomStructureStages(options = {}) {
  const qualificationType = ['swiss', 'groups', 'none', 'single_elimination', 'double_elimination'].includes(options.qualificationType)
    ? options.qualificationType
    : 'swiss';
  let finalsType = ['single_elimination', 'double_elimination', 'none'].includes(options.finalsType)
    ? options.finalsType
    : 'single_elimination';
  if (qualificationType === 'none' && finalsType === 'none') finalsType = 'single_elimination';

  if (qualificationType === 'single_elimination') {
    return [createSingleEliminationStage({
      id: 'stage_single_elimination_1',
      name: '单败淘汰阶段',
      bracketSize: options.bracketSize || options.topCutSize,
      bestOf: options.qualificationBestOf || options.finalsBestOf,
      bronzeMatch: options.bronzeMatch,
    })];
  }
  if (qualificationType === 'double_elimination') {
    return [createDoubleEliminationStage({
      bracketSize: options.bracketSize || options.topCutSize,
      bestOf: options.qualificationBestOf || options.finalsBestOf,
      grandFinalReset: options.grandFinalReset,
    })];
  }

  const stages = [];
  const hasFinals = finalsType !== 'none';
  const finalStageId = finalsType === 'double_elimination' ? 'stage_double_elimination_1' : 'stage_top_cut_1';
  const qualificationBestOf = normalizeOddPositiveInt(options.qualificationBestOf || options.swissBestOf || options.groupBestOf, 1);
  const finalsBestOf = normalizeOddPositiveInt(options.finalsBestOf || options.topCutBestOf, 3);
  const topCutSize = normalizePositiveInt(options.topCutSize || options.bracketSize, 8);

  if (qualificationType === 'swiss') {
    stages.push({
      id: 'stage_swiss_1',
      role: 'qualification',
      type: 'swiss',
      name: '资格赛：瑞士轮',
      entrySource: { type: 'all_entrants' },
      matchRules: {
        bestOf: qualificationBestOf,
        allowDraw: true,
        scoreMode: 'match',
      },
      swiss: {
        roundPolicy: 'auto_by_entrant_count',
        pairingMethod: 'swiss',
        byePolicy: 'avoid_repeat',
      },
      advancement: {
        mode: hasFinals ? 'top_cut' : 'none',
        count: hasFinals ? topCutSize : 0,
        targetStageId: hasFinals ? finalStageId : null,
      },
    });
  } else if (qualificationType === 'groups') {
    const groupCount = normalizePositiveInt(options.groupCount, 4);
    const advancePerGroup = normalizePositiveInt(options.advancePerGroup, 2);
    stages.push({
      id: 'stage_groups_1',
      role: 'qualification',
      type: 'groups',
      name: '资格赛：小组赛',
      entrySource: { type: 'all_entrants' },
      matchRules: {
        bestOf: qualificationBestOf,
        allowDraw: true,
        scoreMode: 'match',
      },
      groups: {
        groupCount,
        advancePerGroup,
        seeding: 'snake',
        tiebreakers: ['points', 'omw', 'oow'],
      },
      advancement: {
        mode: hasFinals ? 'per_group' : 'none',
        count: advancePerGroup,
        targetStageId: hasFinals ? finalStageId : null,
      },
    });
  }

  if (hasFinals) {
    const entrySource = stages.length > 0
      ? { type: 'previous_stage_advancers', fromStageId: stages[0].id }
      : { type: 'all_entrants' };
    if (finalsType === 'double_elimination') {
      stages.push(createDoubleEliminationStage({
        id: finalStageId,
        name: '淘汰赛：双败淘汰',
        entrySource,
        bracketSize: stages.length > 0 ? topCutSize : (options.bracketSize || topCutSize),
        bestOf: finalsBestOf,
        grandFinalReset: options.grandFinalReset,
      }));
    } else {
      stages.push(createSingleEliminationStage({
        id: finalStageId,
        name: '淘汰赛：单败淘汰',
        entrySource,
        bracketSize: stages.length > 0 ? topCutSize : (options.bracketSize || topCutSize),
        bestOf: finalsBestOf,
        bronzeMatch: options.bronzeMatch,
      }));
    }
  }

  return stages.length > 0 ? stages : createCurrentPtsStages(options);
}

function buildPresetSettings(presetId = CURRENT_PTS_PRESET_ID, options = {}) {
  const normalizedPresetId = String(presetId || CURRENT_PTS_PRESET_ID).trim() || CURRENT_PTS_PRESET_ID;
  const buildOptions = clone(options || {});
  const baseSettings = stages => ({
    presetId: normalizedPresetId,
    game: buildOptions.game || 'vgc',
    entrantType: buildOptions.entrantType || 'player',
    stages,
  });
  switch (normalizedPresetId) {
    case 'current_pts_default':
    case 'vgc_swiss_top_cut':
      return baseSettings(createCurrentPtsStages(buildOptions));
    case 'swiss_only':
      return baseSettings(createSwissOnlyStages(buildOptions));
    case 'groups_top_cut':
      return baseSettings(createGroupsTopCutStages(buildOptions));
    case 'single_elimination':
      return baseSettings(createSingleEliminationStages(buildOptions));
    case 'double_elimination':
      return baseSettings(createDoubleEliminationStages(buildOptions));
    case 'custom_structure':
      return baseSettings(createCustomStructureStages(buildOptions));
    default:
      return baseSettings(createCurrentPtsStages(buildOptions));
  }
}

function createDefaultTournamentSettings(options = {}) {
  return buildPresetSettings(CURRENT_PTS_PRESET_ID, options);
}

function getPreset(presetId = CURRENT_PTS_PRESET_ID, options = {}) {
  return buildPresetSettings(presetId || CURRENT_PTS_PRESET_ID, options);
}

function listPresetIds() {
  return ['current_pts_default', 'vgc_swiss_top_cut', 'swiss_only', 'groups_top_cut', 'single_elimination', 'double_elimination', 'custom_structure'];
}

function listPresets() {
  return [
    { id: 'current_pts_default', name: '当前 PTS 默认赛制', description: '瑞士轮 + 单败 Top Cut', type: 'default' },
    { id: 'vgc_swiss_top_cut', name: 'VGC 瑞士轮 + Top Cut', description: '面向宝可梦社群赛的标准流程', type: 'default' },
    { id: 'swiss_only', name: '纯瑞士轮', description: '仅瑞士轮，不自动进入淘汰赛', type: 'qualification' },
    { id: 'groups_top_cut', name: '小组赛 + 淘汰赛', description: '先分组，再按晋级人数进入淘汰赛', type: 'qualification' },
    { id: 'single_elimination', name: '单败淘汰', description: '直接单败淘汰赛制', type: 'finals' },
    { id: 'double_elimination', name: '双败淘汰', description: '带败者组的双败淘汰赛制', type: 'finals' },
    { id: 'custom_structure', name: '自定义赛事结构', description: '由新建比赛流程生成资格赛与淘汰赛阶段', type: 'custom' },
  ];
}

module.exports = {
  SCHEMA_VERSION,
  CURRENT_PTS_PRESET_ID,
  clone,
  normalizePositiveInt,
  normalizeOddPositiveInt,
  buildPresetSettings,
  createCurrentPtsStages,
  createSwissOnlyStages,
  createGroupsTopCutStages,
  createSingleEliminationStages,
  createDoubleEliminationStages,
  createSingleEliminationStage,
  createDoubleEliminationStage,
  createCustomStructureStages,
  createDefaultTournamentSettings,
  getPreset,
  listPresetIds,
  listPresets,
};
