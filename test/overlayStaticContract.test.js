const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('overlay routes all 3.0 phases to nonblank views', () => {
  const router = readUtf8('public/shared/overlay/state-router.js');
  const overview = readUtf8('public/shared/overlay/views/swiss-overview.js');
  const compat = readUtf8('public/shared/overlay/views/compat-views.js');
  const podium = readUtf8('public/shared/overlay/views/podium.js');
  const html = readUtf8('public/overlay/index.html');
  const text = `${router}\n${overview}\n${compat}\n${podium}`;
  const required = [
    "phase === 'swiss'",
    "phase === 'groups'",
    "phase === 'double_elimination'",
    "return 'swiss-overview'",
    "shouldUseTop8Bracket(state) ? 'top8-bracket' : 'swiss-overview'",
    "return 'podium'",
    'function shouldUseTop8Bracket',
    'function topCutBracketSize',
    "overlayState === 'swiss-ended'",
    "registerView('swiss-overview'",
    "registerView('top8-bracket'",
    "registerView('podium'",
    'function renderStageOverviewInto',
    '小组赛',
    '双败淘汰',
    '胜者组',
    '败者组',
    '总决赛',
    '冠军',
    '亚军',
    '季军',
  ];

  for (const token of required) {
    assert.equal(text.includes(token), true, `overlay should include: ${token}`);
  }
  assert.equal(html.includes('/shared/overlay/state-router.js?v=3.0-overlay-route-5'), true);
});

test('overlay localizes elimination labels and avoids hard-coded top8 podium wording', () => {
  const utils = readUtf8('public/shared/overlay/utils.js');
  const overview = readUtf8('public/shared/overlay/views/swiss-overview.js');
  const podium = readUtf8('public/shared/overlay/views/podium.js');
  const swissEnded = readUtf8('public/shared/overlay/views/swiss-ended.js');

  const requiredUtils = [
    "double_elimination: '\\u53cc\\u8d25\\u6dd8\\u6c70'",
    "winners: '\\u80dc\\u8005\\u7ec4'",
    "losers: '\\u8d25\\u8005\\u7ec4'",
    "grand_final: '\\u603b\\u51b3\\u8d5b'",
    "'Round of 16': '\\u5341\\u516d\\u5f3a\\u8d5b'",
  ];
  for (const token of requiredUtils) {
    assert.equal(utils.includes(token), true, `overlay utils should include localized label: ${token}`);
  }

  assert.equal(overview.includes("'Round of 16': '十六强赛'"), true);
  assert.equal(overview.includes("s.phase === 'top8' && window.PTSOverlay?.shouldUseTop8Bracket?.(s) && s.overlayState === 'top8-overview'"), true);
  assert.equal(podium.includes("4: '四强选手'"), true);
  assert.equal(podium.includes("16: '十六强选手'"), true);
  assert.equal(podium.includes('<div class="podium-side-title">八强选手</div>'), false);
  assert.equal(swissEnded.includes('var mainCount = advancers.length || 8;'), true);
});

test('swiss-ended overlay labels swiss-only finals without top cut wording', () => {
  const html = readUtf8('public/overlay/index.html');
  const swissEnded = readUtf8('public/shared/overlay/views/swiss-ended.js');
  const required = [
    'function getSwissEndedAdvancers',
    'function swissEndedMainTitle',
    "if (!count) return '最终排名'",
    "8: '八强出炉'",
    "return labels[count] || '晋级名单出炉'",
  ];

  for (const token of required) {
    assert.equal(swissEnded.includes(token), true, `swiss-ended overlay should include: ${token}`);
  }
  assert.equal(html.includes('/shared/overlay/views/swiss-ended.js?v=3.0-overlay-swiss-ended-topn-title'), true);
});

test('stage overview participant list uses localized participant wording', () => {
  const overview = readUtf8('public/shared/overlay/views/swiss-overview.js');
  const css = readUtf8('public/shared/overlay/overlay.css');
  const required = [
    'function isTeamOverlayState',
    'function overlayParticipantLabel',
    "return isTeamOverlayState(s) ? '队伍' : '选手'",
    "tag: '结果'",
    'ov-record is-text',
    'ov-record is-empty',
  ];

  for (const token of required) {
    assert.equal(overview.includes(token), true, `stage overview should include: ${token}`);
  }

  assert.equal(overview.includes("'Entry'"), false, 'stage overview should not show English Entry labels');
  assert.equal(overview.includes("'Result'"), false, 'stage overview should not show English Result labels');
  assert.equal(overview.includes("meta: '参赛'"), false, 'stage overview should not use vague one-character participant status');
  assert.equal(css.includes('.ov-record.is-text'), true, 'stage overview text records should be styled as text tags');
  assert.equal(css.includes('.ov-record.is-empty'), true, 'empty stage overview records should be visually hidden');
});

test('double elimination overview uses a dedicated compact bracket layout', () => {
  const overview = readUtf8('public/shared/overlay/views/swiss-overview.js');
  const css = readUtf8('public/shared/overlay/overlay.css');
  const required = [
    'function clearDoubleEliminationOverview',
    'function doubleEliminationBracketLabel',
    'function doubleEliminationBracketPriority',
    'function doubleEliminationRoundNumber',
    'function doubleEliminationScopeLabel',
    'function compareDoubleEliminationMatches',
    'function getVisibleDoubleEliminationMatches',
    'function getVisibleDoubleEliminationMatchGroups',
    'function renderDoubleEliminationMatchCard',
    'function getDoubleEliminationLaneRows',
    'function renderDoubleEliminationMatchGroup',
    'function renderDoubleEliminationOverviewInto',
    "if (s.phase === 'double_elimination')",
    'de-shell',
    'de-match-card',
    'de-horizontal-match',
    'de-score-box',
    'de-group-list',
    'de-lane-list',
    'de-round-title',
  ];

  for (const token of required) {
    assert.equal(overview.includes(token), true, `double elimination overview should include: ${token}`);
  }

  assert.equal(css.includes('#state-overview .de-shell'), true, 'double elimination overview shell should be styled');
  assert.equal(css.includes('grid-template-columns: 356px minmax(0, 1fr);'), true, 'double elimination lane rail should stay on the left');
  assert.equal(css.includes('grid-template-columns: minmax(0, 1fr) 356px;'), false, 'double elimination lane rail should not drift back to the right');
  assert.equal(css.includes('.de-horizontal-match'), true, 'double elimination match cards should use horizontal player layout');
  assert.equal(css.includes('.de-score-box.win'), true, 'double elimination scores should match bracket-style score boxes');
  assert.equal(overview.includes('小分'), false, 'double elimination score cards should not use crowded score-label text');
  assert.equal(css.includes('.de-score-line'), false, 'double elimination score cards should not use the old score pill');
  assert.equal(css.includes('.de-match-card.live'), true, 'double elimination live cards should be styled');
  assert.equal(css.includes('.de-lane-status.is-current'), true, 'double elimination lane status should be styled');
});

test('double elimination overview shows concurrent winners and losers rounds', () => {
  const overview = readUtf8('public/shared/overlay/views/swiss-overview.js');
  const sandbox = {
    window: {},
    escapeHtml(value) { return String(value || ''); },
    renderMarqueeText(value) { return String(value || ''); },
  };
  vm.runInNewContext(overview, sandbox);

  const matches = [
    { id: 'wb-r1-m1', stageId: 'stage', bracket: 'winners', doubleEliminationRound: 1, table: 1, done: true, p1: 'A', p2: 'B' },
    { id: 'wb-r1-m2', stageId: 'stage', bracket: 'winners', doubleEliminationRound: 1, table: 2, done: true, p1: 'C', p2: 'D' },
    { id: 'wb-r2-m1', stageId: 'stage', bracket: 'winners', doubleEliminationRound: 2, table: 1, done: false, p1: 'A', p2: 'C' },
    { id: 'lb-r1-m1', stageId: 'stage', bracket: 'losers', doubleEliminationRound: 1, table: 2, done: false, p1: 'B', p2: 'D' },
  ];
  const groups = sandbox.getVisibleDoubleEliminationMatchGroups({ phase: 'double_elimination' }, matches);

  assert.deepEqual(Array.from(groups, group => group.label), ['胜者组 第 2 轮', '败者组 第 1 轮']);
  assert.deepEqual(Array.from(groups, group => Array.from(group.matches, match => match.id)), [['wb-r2-m1'], ['lb-r1-m1']]);
});

test('overlay idle view is visible on transparent OBS background', () => {
  const html = readUtf8('public/overlay/index.html');
  const css = readUtf8('public/shared/overlay/overlay.css');
  assert.equal(html.includes('/shared/overlay/overlay.css?v=3.0-overlay-group-tiebreak-1'), true);
  assert.equal(html.includes('/shared/overlay/views/swiss-overview.js?v=3.0-overlay-topn-overview-1'), true);
  assert.equal(html.includes('rel="preload" as="font" type="font/ttf" href="/shared/fonts/ud-shin-go-sc-r.ttf" crossorigin'), true);
  assert.equal(html.includes('rel="preload" as="image" href="/shared/pokemon-champions-title.png"'), true);
  assert.equal(html.includes('data-pts-overlay-boot="ready"'), true);
  assert.equal(css.includes('#view-idle'), true);
  assert.equal(css.includes('linear-gradient(145deg, rgba(6, 10, 22, 0.98)'), true);
  assert.equal(css.includes('#state-idle #idleTitle { font-size:56px; font-weight:900; color:rgba(248,250,252,0.94);'), true);
  assert.equal(css.includes('#state-idle #idleSub { font-size:24px; color:rgba(226,232,240,0.78);'), true);
  assert.equal(css.includes('#state-idle .idle-qr-tip { font-size: 20px; color: rgba(226,232,240,0.88); letter-spacing: 0; }'), true);
});

test('overlay ranking move animation has horizontal bleed room', () => {
  const overview = readUtf8('public/shared/overlay/views/swiss-overview.js');
  const css = readUtf8('public/shared/overlay/overlay.css');
  assert.equal(overview.includes("winUp ? ' scale(1.04)' : ''"), true);
  assert.equal(css.includes('--ov-move-bleed: 64px;'), true);
  assert.equal(css.includes('margin-inline: calc(-1 * var(--ov-move-bleed));'), true);
  assert.equal(css.includes('padding-inline: var(--ov-move-bleed);'), true);
  assert.equal(css.includes('overflow-x: hidden;'), true);
});

test('top cut final cards leave enough room for Chinese player names', () => {
  const bracket = readUtf8('public/shared/overlay/views/top8-bracket.js');
  const css = readUtf8('public/shared/overlay/overlay.css');
  assert.equal(bracket.includes('final: { x: 704, y: 390, w: 512, h: 130 }'), true);
  assert.equal(bracket.includes('bronze: { x: 728, y: 610, w: 464, h: 112 }'), true);
  assert.equal(css.includes('max-width: 240px;'), true);
  assert.equal(css.includes('max-width: 154px;'), false);
  assert.equal(bracket.includes('final: { x: 780, y: 390, w: 360, h: 130 }'), false);
  assert.equal(bracket.includes('bronze: { x: 800, y: 610, w: 320, h: 112 }'), false);
});

test('group stage overview renders grouped standings and avoids cramped match labels', () => {
  const overview = readUtf8('public/shared/overlay/views/swiss-overview.js');
  const css = readUtf8('public/shared/overlay/overlay.css');
  const requiredOverview = [
    'function isGroupOverviewStage',
    'function buildOverlayGroupViews',
    'function renderGroupOverviewInto',
    'function overlayCurrentGroupRound',
    'function overlayGroupRoundCount',
    'function renderOverlayGroupCard',
    'function renderOverlayGroupMatchSection',
    'function renderOverlayGroupMatchCard',
    "stageMatches.filter(match => normalizeOverlayGroupRound(match.groupRound, 1) === currentRound)",
    "plEl.classList.add('is-group-standings')",
    "tableList.classList.add('is-group-stage')",
    'ov-group-match-section',
    'ov-group-standing-row',
    'ov-card-score',
  ];
  const requiredCss = [
    '.ov-player-list.is-group-standings',
    '.ov-group-card',
    '.ov-group-standing-row',
    '.ov-table-list.is-group-stage',
    '.ov-group-match-section',
    '.ov-group-match-card',
    '.ov-card-score.win',
    '.ov-card-actions',
  ];

  for (const token of requiredOverview) {
    assert.equal(overview.includes(token), true, `group stage overview should include: ${token}`);
  }
  for (const token of requiredCss) {
    assert.equal(css.includes(token), true, `group stage overview CSS should include: ${token}`);
  }
  assert.equal(overview.includes('stageOverviewLabel(match.groupLabel || match.phase'), false);
  assert.equal(overview.includes('<span class="status-badge waiting">${phase}</span>${badge}'), false);
});

test('group stage overview auto-scrolls standings and matches at one-third speed', () => {
  const compat = readUtf8('public/shared/overlay/views/compat-views.js');
  const html = readUtf8('public/overlay/index.html');
  const required = [
    'function isGroupOverviewAutoScrollState',
    "state?.phase === 'groups'",
    "state?.phase === 'groups-ended'",
    "stage.type === 'groups'",
    "stage.type === 'group_round_robin'",
    'itemsPerSecond: isGroupOverview ? 0.5 : 1.5',
    'travelMs: isGroupOverview ? 15000 : 5000',
    'scroller.options = scrollOptions',
  ];

  for (const token of required) {
    assert.equal(compat.includes(token), true, `group stage auto-scroll should include: ${token}`);
  }
  assert.equal(html.includes('/shared/overlay/views/compat-views.js?v=3.0-overlay-topn-labels-1'), true);
});
