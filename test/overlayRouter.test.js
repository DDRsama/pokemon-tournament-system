const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadRouter() {
  const context = { window: {}, console };
  context.window.PTSOverlay = {};
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'overlay', 'state-router.js'), 'utf8');
  vm.runInContext(source, context);
  return context.window.PTSOverlay;
}

test('overlay router resolves 3.0 stage phases', () => {
  const router = loadRouter();
  assert.equal(router.resolveViewKey({ phase: 'swiss', overlayState: 'overview' }), 'swiss-overview');
  assert.equal(router.resolveViewKey({ phase: 'swiss', overlayState: 'live' }), 'swiss-live');
  assert.equal(router.resolveViewKey({ phase: 'swiss', overlayState: 'result' }), 'swiss-result');
  assert.equal(router.resolveViewKey({ phase: 'groups', overlayState: 'overview' }), 'swiss-overview');
  assert.equal(router.resolveViewKey({ phase: 'groups', overlayState: 'live' }), 'swiss-live');
  assert.equal(router.resolveViewKey({ phase: 'double_elimination', overlayState: 'overview' }), 'swiss-overview');
  assert.equal(router.resolveViewKey({ phase: 'double_elimination', overlayState: 'top8-live' }), 'top8-live');
  assert.equal(router.resolveViewKey({ phase: 'double_elimination', overlayState: 'top8-result' }), 'top8-result');
  assert.equal(router.resolveViewKey({ phase: 'top8', overlayState: 'overview', activeStage: { type: 'single_elimination', elimination: { bracketSize: 8 } } }), 'top8-bracket');
  assert.equal(router.resolveViewKey({ phase: 'groups-ended', overlayState: 'overview' }), 'swiss-overview');
});

test('overlay router uses generic overview for non-top8 single elimination brackets', () => {
  const router = loadRouter();
  assert.equal(router.topCutBracketSize({
    phase: 'top8',
    activeStage: { type: 'single_elimination', elimination: { bracketSize: 4 } },
    top8: ['A', 'B', 'C', 'D'],
  }), 4);
  assert.equal(router.resolveViewKey({
    phase: 'top8',
    overlayState: 'overview',
    activeStage: { type: 'single_elimination', elimination: { bracketSize: 4 } },
    top8: ['A', 'B', 'C', 'D'],
    matches: [
      { phase: 'Semi Finals', bracketRound: 1, p1: 'A', p2: 'D' },
      { phase: 'Semi Finals', bracketRound: 1, p1: 'B', p2: 'C' },
    ],
  }), 'swiss-overview');
  assert.equal(router.resolveViewKey({
    phase: 'top8',
    overlayState: 'overview',
    activeStage: { type: 'single_elimination', elimination: { bracketSize: 16 } },
    top8: Array.from({ length: 16 }, (_, index) => `P${index + 1}`),
  }), 'swiss-overview');
});

test('overlay router prefers podium when top cut results are ready', () => {
  const router = loadRouter();
  assert.equal(router.resolveViewKey({
    phase: 'top8',
    overlayState: 'overview',
    activeStage: { type: 'single_elimination', elimination: { bracketSize: 8 } },
    matches: [
      { phase: 'Finals', done: true, p1: 'A', p2: 'B', winner: 'A' },
      { phase: 'Bronze Match', done: true, p1: 'C', p2: 'D', winner: 'C' },
    ],
  }), 'podium');
});

test('overlay router can show podium from generic stage result', () => {
  const router = loadRouter();
  const state = {
    phase: 'done',
    overlayState: 'podium',
    matches: [],
    stageResults: {
      stage_double_elimination_1: {
        standings: [{ rank: 1, player: 'A' }, { rank: 2, player: 'B' }],
      },
    },
  };
  assert.equal(router.isPodiumReady(state), true);
  assert.equal(router.resolveViewKey(state), 'podium');
});

test('overlay router keeps terminal swiss results on ranking view', () => {
  const router = loadRouter();
  const state = {
    phase: 'done',
    overlayState: 'swiss-ended',
    matches: [],
    stageResults: {
      stage_swiss_1: {
        standings: [{ rank: 1, player: 'A' }, { rank: 2, player: 'B' }],
      },
    },
  };
  assert.equal(router.resolveViewKey(state), 'swiss-ended');
});

test('overlay router prefers podium over stale final result after tournament ends', () => {
  const router = loadRouter();
  const state = {
    phase: 'done',
    overlayState: 'top8-result',
    matches: [
      { phase: 'Finals', done: true, p1: 'A', p2: 'B', winner: 'A' },
      { phase: 'Bronze Match', done: true, p1: 'C', p2: 'D', winner: 'C' },
    ],
  };
  assert.equal(router.resolveViewKey(state), 'podium');
});

test('overlay router does not show podium before tournament is done', () => {
  const router = loadRouter();
  const state = {
    phase: 'top8',
    overlayState: 'overview',
    activeStage: { id: 'stage_top_cut_1' },
    matches: [
      { phase: 'Finals', done: false, p1: 'A', p2: 'B' },
      { phase: 'Bronze Match', done: false, p1: 'C', p2: 'D' },
    ],
    stageResults: {
      stage_groups_1: {
        standings: [{ rank: 1, player: 'Group Winner' }],
      },
    },
  };
  assert.equal(router.isPodiumReady(state), false);
  assert.equal(router.resolveViewKey(state), 'top8-bracket');
});
