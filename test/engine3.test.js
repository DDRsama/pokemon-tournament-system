const test = require('node:test');
const assert = require('node:assert/strict');

const { freshState, restoreState, serializeState } = require('../src/core/state');
const { createDefaultTournamentSettings, SCHEMA_VERSION, listPresetIds, getPreset } = require('../src/core/presets');
const { normalizeBestOf, winsRequired, normalizeTournamentSettings, validateTournamentSettings } = require('../src/core/rules');
const { getActiveStage, getStageMatches, buildStageViewModel } = require('../src/core/stages');
const { validateGameScore, applyGameScoreToMatch, applyMatchWinner, applyDrawToMatch } = require('../src/core/matches');
const {
  createPlayerProfile,
  createGuestEntrant,
  createRegisteredEntrant,
  bindEntrantToProfile,
  mergePlayerProfiles,
} = require('../src/core/players');
const { migrateLegacyEntrants, createTeamEntrant } = require('../src/core/entrants');
const { calculateTournamentPoints, createPointsProfile, getPlacementPoints } = require('../src/core/points');
const { createLeague, buildLeagueLeaderboard, buildFinalQualification } = require('../src/core/leagues');

test('freshState creates 3.0 tournament settings and stages', () => {
  const state = freshState();
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.tournamentSettings.presetId, 'current_pts_default');
  assert.equal(state.stages.length, 2);
  assert.deepEqual(state.stages.map(stage => stage.type), ['swiss', 'single_elimination']);
});

test('custom structure preset creates qualification and finals stages', () => {
  const settings = getPreset('custom_structure', {
    entrantType: 'team',
    qualificationType: 'groups',
    groupCount: 4,
    advancePerGroup: 2,
    qualificationBestOf: 3,
    finalsType: 'double_elimination',
    topCutSize: 8,
    finalsBestOf: 5,
  });
  assert.equal(settings.presetId, 'custom_structure');
  assert.equal(settings.entrantType, 'team');
  assert.equal('ranked' in settings, false);
  assert.deepEqual(settings.stages.map(stage => stage.type), ['groups', 'double_elimination']);
  assert.equal(settings.stages[0].groups.groupCount, 4);
  assert.equal(settings.stages[0].groups.advancePerGroup, 2);
  assert.equal(settings.stages[0].matchRules.bestOf, 3);
  assert.equal(settings.stages[0].advancement.targetStageId, 'stage_double_elimination_1');
  assert.equal(settings.stages[1].doubleElimination.bracketSize, 8);
  assert.equal(settings.stages[1].matchRules.bestOf, 5);
});

test('restoreState migrates legacy state with auto swiss round policy and top cut size', () => {
  const state = restoreState({
    phase: 'swiss-ended',
    swissRounds: 4,
    pendingTop8: ['A', 'B', 'C', 'D'],
    _byeSet: ['A'],
  });
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.activeStageId, 'stage_swiss_1');
  assert.equal(state.tournamentSettings.stages[0].swiss.roundPolicy, 'auto_by_entrant_count');
  assert.equal('rounds' in state.tournamentSettings.stages[0].swiss, false);
  assert.equal(state.tournamentSettings.stages[0].advancement.count, 4);
  assert.equal(state.tournamentSettings.stages[1].elimination.bracketSize, 4);
  assert.deepEqual([...state._byeSet], ['A']);
});

test('serializeState persists normalized engine fields', () => {
  const state = freshState({ _byeSet: new Set(['A']) });
  delete state.tournamentSettings;
  const serialized = serializeState(state);
  assert.equal(serialized.schemaVersion, SCHEMA_VERSION);
  assert.equal(serialized.tournamentSettings.stages.length, 2);
  assert.deepEqual(serialized._byeSet, ['A']);
});

test('normalizeTournamentSettings sanitizes BO values and ignores tournament-level points metadata', () => {
  const settings = normalizeTournamentSettings({
    ranked: true,
    leagueRefs: ['league_a'],
    pointsProfileRef: 'points_a',
    stages: [
      { id: 's1', type: 'swiss', matchRules: { bestOf: 2, allowDraw: true } },
    ],
  });
  assert.equal('ranked' in settings, false);
  assert.equal('leagueRefs' in settings, false);
  assert.equal('pointsProfileRef' in settings, false);
  assert.equal(settings.stages[0].matchRules.bestOf, 3);
  assert.equal(settings.stages[0].matchRules.allowDraw, true);
});

test('validateTournamentSettings rejects broken advancement references', () => {
  const result = validateTournamentSettings({
    stages: [
      {
        id: 's1',
        type: 'swiss',
        swiss: { rounds: 3 },
        advancement: { mode: 'top_cut', targetStageId: 'missing' },
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some(error => error.includes('missing')), true);
});

test('stage helpers resolve legacy swiss and top cut matches', () => {
  const state = restoreState({
    phase: 'top8',
    matches: [
      { id: 'r1-m1', round: 1, done: true },
      { id: 'qf1', phase: 'Quarter Finals', done: false },
    ],
  });
  const active = getActiveStage(state);
  assert.equal(active.type, 'single_elimination');
  assert.equal(getStageMatches(state, 'stage_swiss_1').length, 1);
  assert.equal(getStageMatches(state, 'stage_top_cut_1').length, 1);
  const view = buildStageViewModel(state, 'stage_top_cut_1');
  assert.equal(view.matchCount, 1);
  assert.equal(view.complete, false);
});

test('stage helpers prefer explicit stageId when present', () => {
  const state = freshState({
    tournamentSettings: {
      stages: [
        { id: 'stage_groups_1', type: 'groups', role: 'qualification', name: 'Groups', matchRules: { bestOf: 1, allowDraw: true, scoreMode: 'match' }, groups: { groupCount: 2, advancePerGroup: 1 }, advancement: { mode: 'per_group', targetStageId: 'stage_top_cut_1' } },
        { id: 'stage_top_cut_1', type: 'single_elimination', role: 'finals', name: 'Cut', matchRules: { bestOf: 3, allowDraw: false, scoreMode: 'games' }, elimination: { bracketSize: 4, bronzeMatch: true } },
      ],
    },
    matches: [
      { id: 'g1-m1', stageId: 'stage_groups_1', groupRound: 1, done: true },
      { id: 'qf1', stageId: 'stage_top_cut_1', phase: 'Quarter Finals', done: false },
    ],
    activeStageId: 'stage_top_cut_1',
  });
  assert.equal(getStageMatches(state, 'stage_groups_1').length, 1);
  assert.equal(getStageMatches(state, 'stage_top_cut_1').length, 1);
  assert.equal(buildStageViewModel(state, 'stage_groups_1').complete, true);
});

test('generic BO score validation supports BO1 BO3 BO5', () => {
  assert.equal(normalizeBestOf(2), 3);
  assert.equal(winsRequired(5), 3);
  assert.deepEqual(validateGameScore(1, 1, 0), { bestOf: 1, winsRequired: 1, aWins: 1, bWins: 0, done: true, winnerSlot: 'a' });
  assert.equal(validateGameScore(3, 2, 2), null);
  assert.deepEqual(validateGameScore(5, 2, 1).done, false);
  assert.deepEqual(validateGameScore(5, 3, 2).winnerSlot, 'a');
});

test('generic match result appliers keep legacy fields compatible', () => {
  const match = { p1: 'A', p2: 'B' };
  assert.equal(applyGameScoreToMatch(match, 2, 1, { bestOf: 3 }), true);
  assert.equal(match.done, true);
  assert.equal(match.winner, 'A');
  assert.equal(match.result.aGameWins, 2);

  const match2 = { entrantA: 'C', entrantB: 'D' };
  assert.equal(applyMatchWinner(match2, 'D'), true);
  assert.equal(match2.winner, 'D');
  assert.equal(match2.p2Wins, 1);

  assert.equal(applyDrawToMatch(match2), true);
  assert.equal(match2.draw, true);
  assert.equal(match2.result.type, 'draw');
});

test('player profiles create registered and guest entrants', () => {
  const profile = createPlayerProfile({ id: 'pl_a', displayName: 'A', aliases: ['Alpha'] });
  const registered = createRegisteredEntrant({ tournamentId: 't1', profile, id: 'entry_a' });
  const guest = createGuestEntrant({ tournamentId: 't1', displayName: 'Guest', id: 'entry_guest' });
  assert.equal(registered.profileId, 'pl_a');
  assert.equal(registered.rankedEligible, true);
  assert.equal(guest.profileId, null);
  assert.equal(guest.rankedEligible, false);

  const bound = bindEntrantToProfile(guest, profile);
  assert.equal(bound.profileId, 'pl_a');
  assert.equal(bound.rankedEligible, true);
});

test('legacy players migrate into tournament entrants', () => {
  const state = restoreState({
    _id: 't1',
    players: ['A', 'Guest'],
    playerProfiles: {
      A: { playerId: 'local_a', name: 'A', globalProfileId: 'pl_a', rankedEligible: true },
    },
    _dropped: ['Guest'],
    _dropAfterRound: { Guest: 2 },
  });
  assert.equal(state.entrants.length, 2);
  const a = state.entrants.find(entrant => entrant.displayName === 'A');
  const guest = state.entrants.find(entrant => entrant.displayName === 'Guest');
  assert.equal(a.profileId, 'pl_a');
  assert.equal(a.entryType, 'registered');
  assert.equal(a.rankedEligible, true);
  assert.equal(guest.entryType, 'guest');
  assert.equal(guest.dropped, true);
  assert.equal(guest.dropAfterRound, 2);

  const migrated = migrateLegacyEntrants({ _id: 't2', players: ['B'] });
  assert.equal(migrated[0].displayName, 'B');
  assert.equal(migrated[0].rankedEligible, false);
});

test('team entrants normalize roster and ranking eligibility', () => {
  const team = createTeamEntrant({
    tournamentId: 't1',
    teamName: 'Team A',
    teamRoster: ['Alice', 'Bob', ''],
    profileId: 'pl_team',
  });
  assert.equal(team.entrantType, 'team');
  assert.deepEqual(team.teamRoster, ['Alice', 'Bob']);
  assert.equal(team.rankedEligible, true);
});

test('mergePlayerProfiles combines aliases bindings and stats', () => {
  const merged = mergePlayerProfiles(
    { id: 'pl_a', displayName: 'A', aliases: ['Alpha'], bindings: [{ type: 'token', value: '1' }], stats: { tournamentsPlayed: 1, rankedTournamentsPlayed: 1, leaguePoints: 10 } },
    { id: 'pl_b', displayName: 'B', aliases: ['Beta'], bindings: [{ type: 'token', value: '2' }], stats: { tournamentsPlayed: 2, rankedTournamentsPlayed: 1, leaguePoints: 5 } },
  );
  assert.deepEqual(merged.aliases.sort(), ['Alpha', 'B', 'Beta']);
  assert.equal(merged.bindings.length, 2);
  assert.equal(merged.stats.leaguePoints, 15);
});

test('points exclude guest entrants and apply placement profile', () => {
  const profile = createPointsProfile({
    participationPoints: 1,
    placementPoints: [{ rank: 1, points: 10 }, { rankMin: 2, rankMax: 4, points: 5 }],
    eventTierMultiplier: 2,
  });
  assert.equal(getPlacementPoints(3, profile), 5);
  const awards = calculateTournamentPoints({
    profile,
    standings: [{ rank: 1, player: 'A' }, { rank: 2, player: 'Guest' }],
    entrants: [
      { displayName: 'A', profileId: 'pl_a', rankedEligible: true },
      { displayName: 'Guest', profileId: null, rankedEligible: false },
    ],
  });
  assert.equal(awards.length, 1);
  assert.equal(awards[0].profileId, 'pl_a');
  assert.equal(awards[0].points, 22);
});

test('points profile accepts array shorthand by rank order', () => {
  const profile = createPointsProfile({
    participationPoints: 1,
    placementPoints: [8, 4, 2],
  });
  assert.deepEqual(profile.placementPoints, [
    { rank: 1, points: 8 },
    { rank: 2, points: 4 },
    { rank: 3, points: 2 },
  ]);
  assert.equal(getPlacementPoints(2, profile), 4);
});

test('league normalizes legacy included tournaments into point-rule bindings', () => {
  const league = createLeague({
    pointsProfileId: 'points_a',
    includedTournamentIds: ['t1', 't2'],
  });
  assert.deepEqual(league.includedTournamentIds, ['t1', 't2']);
  assert.deepEqual(league.tournamentBindings.map(binding => [
    binding.tournamentId,
    binding.pointsProfileId,
  ]), [['t1', 'points_a'], ['t2', 'points_a']]);
});

test('league leaderboard supports included tournaments best finish and qualifiers', () => {
  const league = createLeague({ id: 'league_a', includedTournamentIds: ['t1', 't2'], bestFinishLimit: 1 });
  const leaderboard = buildLeagueLeaderboard({
    league,
    tournamentAwards: [
      { tournamentId: 't1', profileId: 'pl_a', displayName: 'A', points: 10 },
      { tournamentId: 't2', profileId: 'pl_a', displayName: 'A', points: 30 },
      { tournamentId: 't2', profileId: 'pl_b', displayName: 'B', points: 20 },
      { tournamentId: 'ignored', profileId: 'pl_c', displayName: 'C', points: 100 },
    ],
  });
  assert.deepEqual(leaderboard.map(entry => [entry.profileId, entry.points]), [['pl_a', 30], ['pl_b', 20]]);
  assert.deepEqual(buildFinalQualification(leaderboard, 1), [{ rank: 1, profileId: 'pl_a', displayName: 'A', points: 30 }]);
});

test('league leaderboard is empty until tournaments are explicitly included', () => {
  const league = createLeague({ id: 'league_empty', includedTournamentIds: [] });
  const leaderboard = buildLeagueLeaderboard({
    league,
    tournamentAwards: [
      { tournamentId: 't1', profileId: 'pl_a', displayName: 'A', points: 10 },
    ],
  });
  assert.deepEqual(leaderboard, []);
});

test('calculateTournamentPoints ignores guest entrants and supports ranked awards', () => {
  const profile = createPointsProfile({
    participationPoints: 2,
    placementPoints: [{ rank: 1, points: 6 }],
    eventTierMultiplier: 1.5,
  });
  const awards = calculateTournamentPoints({
    profile,
    standings: [
      { rank: 1, player: 'A', profileId: 'pl_a' },
      { rank: 2, player: 'Guest' },
    ],
    entrants: [
      { displayName: 'A', profileId: 'pl_a', rankedEligible: true },
      { displayName: 'Guest', profileId: null, rankedEligible: false },
    ],
  });
  assert.equal(awards.length, 1);
  assert.equal(awards[0].points, 12);
  assert.equal(awards[0].profileId, 'pl_a');
});

test('default preset can be customized for 3.0 target settings', () => {
  const settings = createDefaultTournamentSettings({
    topCutSize: 4,
    topCutBestOf: 5,
  });
  assert.equal('ranked' in settings, false);
  assert.equal(settings.stages[0].swiss.roundPolicy, 'auto_by_entrant_count');
  assert.equal('rounds' in settings.stages[0].swiss, false);
  assert.equal(settings.stages[0].advancement.count, 4);
  assert.equal(settings.stages[1].matchRules.bestOf, 5);
  assert.equal('leagueRefs' in settings, false);
  assert.equal(listPresetIds().includes('groups_top_cut'), true);
  assert.equal(listPresetIds().includes('double_elimination'), true);
  const groups = getPreset('groups_top_cut', { groupCount: 2, advancePerGroup: 2 });
  assert.equal(groups.stages[0].type, 'groups');
  assert.equal(groups.stages[1].type, 'single_elimination');
  const doubleElim = getPreset('double_elimination', { bracketSize: 4, bestOf: 5 });
  assert.equal(doubleElim.stages[0].type, 'double_elimination');
  assert.equal(doubleElim.stages[0].matchRules.bestOf, 5);
});
