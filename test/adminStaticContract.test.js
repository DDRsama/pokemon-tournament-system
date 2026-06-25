const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('admin static files do not reintroduce legacy swiss control surface', () => {
  const files = fs.readdirSync(path.join(ROOT, 'public/admin'))
    .filter(file => /\.(?:html|css|js)$/.test(file))
    .map(file => `public/admin/${file}`);
  const implementationText = files
    .filter(file => file !== 'public/admin/admin.css')
    .map(readUtf8)
    .join('\n');
  const css = readUtf8('public/admin/admin.css');
  const forbiddenText = [
    '瑞士轮轮数',
    '当前人数',
    '进入淘汰赛',
    '开始瑞士轮',
    '结束瑞士轮',
    '← 回退',
  ];
  const forbiddenIds = [
    'swissArena',
    'swissHint',
    'roundHeaderArea',
    'btnStart',
    'btnNext',
    'btnEndSwiss',
    'btnRevert',
  ];

  for (const token of forbiddenText) {
    assert.equal(implementationText.includes(token), false, `legacy admin text should not exist: ${token}`);
    assert.equal(css.includes(token), false, `legacy admin text should not exist in CSS: ${token}`);
  }
  for (const token of forbiddenIds) {
    assert.equal(implementationText.includes(token), false, `legacy admin id should not exist in implementation: ${token}`);
  }
});

test('admin entry uses current cache-busting asset version', () => {
  const html = readUtf8('public/admin/index.html');
  assert.equal(html.includes('/admin/admin.css?v=3.0-group-tiebreak-1'), true);
  assert.equal(html.includes('/admin/admin.js?v=3.0-group-tiebreak-1'), true);
  assert.equal(html.includes('3.0-swiss-auto-rounds'), false);
  assert.equal(html.includes('3.0-admin-stage-cleanup-20'), false);
  assert.equal(html.includes('3.0-admin-stage-cleanup-19'), false);
  assert.equal(html.includes('3.0-admin-stage-cleanup-18'), false);
  assert.equal(html.includes('3.0-admin-stage-cleanup-17'), false);
  assert.equal(html.includes('3.0-admin-stage-cleanup-16'), false);
  assert.equal(html.includes('3.0-admin-stage-cleanup-15'), false);
  assert.equal(html.includes('3.0-admin-stage-cleanup-14'), false);
  assert.equal(html.includes('3.0-admin-stage-cleanup-13'), false);
});

test('admin runtime removes legacy swiss controls if stale DOM is injected', () => {
  const js = readUtf8('public/admin/admin.js');
  const state = readUtf8('public/admin/state.js');
  const text = `${state}\n${js}`;
  const required = [
    'function removeLegacySwissControls()',
    'function removeLegacySwissControlsFromDom(',
    'function installLegacySwissGuard()',
    'new MutationObserver(',
    "'swiss' + 'Arena'",
    "'swiss' + 'Hint'",
    "'round' + 'HeaderArea'",
    "'match' + 'List'",
    "'btn' + 'Start'",
    "'btn' + 'Next'",
    "'btn' + 'EndSwiss'",
    "'btn' + 'Revert'",
    "'swiss' + 'Rounds'",
    "document.getElementById(id)?.remove()",
    "document.querySelectorAll('button, .config-row, .side-module, .config-box, .phase-hint')",
    "const legacySelectors = ['button', '.config-row', '.side-module', '.config-box', '.phase-hint']",
    '.concat(legacyIds.map(id => `#${id}`))',
    "if (el.closest('[data-admin-modern]')) return;",
    "const block = el.closest('.config-box, .side-module')",
    'removeLegacySwissControls();',
    'installLegacySwissGuard();',
  ];

  for (const token of required) {
    assert.equal(text.includes(token), true, `admin cleanup should include: ${token}`);
  }
});

test('admin overlay module keeps live room code configuration', () => {
  const html = readUtf8('public/admin/index.html');
  const api = readUtf8('public/admin/api.js');
  const js = readUtf8('public/admin/admin.js');
  const state = readUtf8('public/admin/state.js');
  const css = readUtf8('public/admin/admin.css');

  [
    'data-admin-modern="live-room"',
    '直播桌房号',
    'liveRoomCodeInput',
    'liveRoomCodeSaveBtn',
    'liveRoomCodeMessage',
    'placeholder="直播桌房号"',
  ].forEach(token => assert.equal(html.includes(token), true, `admin live room UI should contain: ${token}`));
  assert.equal(html.includes('例如：ABC123'), false);

  assert.equal(api.includes('function saveLiveRoomCode()'), true);
  assert.equal(api.includes("document.getElementById('liveRoomCodeInput')?.value"), true);
  assert.equal(js.includes("liveRoomCodeInput.value = s.liveRoomCode || '';"), true);
  assert.equal(js.includes("liveRoomCodeSaveBtn?.addEventListener('click', saveLiveRoomCode);"), true);
  assert.equal(state.includes("if (el.closest('[data-admin-modern]')) return;"), true);
  assert.equal(css.includes('.live-room-box'), true);
});

test('admin bulk import modal avoids sample player names', () => {
  const html = readUtf8('public/admin/index.html');
  const css = readUtf8('public/admin/admin.css');
  const js = readUtf8('public/admin/modals.js');

  [
    'id="bulkText"',
    '<p>每行一个名称</p>',
    'id="bulkCreateProfiles"',
    '未匹配时登记长期档案',
    '默认只绑定已有档案，未匹配保持临时参赛',
    '/admin/modals.js?v=3.0-bulk-profile-mode',
  ].forEach(token => assert.equal(html.includes(token), true, `admin bulk import UI should contain: ${token}`));
  [
    '.bulk-profile-toggle',
    '.bulk-profile-toggle.hidden',
  ].forEach(token => assert.equal(css.includes(token), true, `admin bulk import CSS should contain: ${token}`));
  [
    'const createMissingProfiles = entrantType !== \'team\'',
    'createMissingProfiles,',
    "document.getElementById('bulkProfileToggle')?.classList.toggle('hidden', isTeam);",
    'profileToggle.checked = false;',
  ].forEach(token => assert.equal(js.includes(token), true, `admin bulk import logic should contain: ${token}`));

  [
    '张三',
    '李四',
    '王五',
    '赵六',
  ].forEach(token => assert.equal(html.includes(token), false, `admin bulk import UI should not contain sample name: ${token}`));
});

test('admin stage panel does not reuse legacy config-box shell', () => {
  const html = readUtf8('public/admin/index.html');
  const css = readUtf8('public/admin/admin.css');
  assert.equal(html.includes('<div class="stage-config-panel">'), true);
  assert.equal(html.includes('<div class="config-box">'), false);
  assert.equal(css.includes('.stage-config-panel'), true);
  assert.equal(css.includes('.config-box:has(#btnStart)'), true);
  assert.equal(css.includes('#swissRounds'), true);
});

test('admin QR labels are localized and not English placeholders', () => {
  const html = readUtf8('public/admin/index.html');
  const js = readUtf8('public/admin/admin.js');
  const text = `${html}\n${js}`;
  assert.equal(text.includes('选手二维码'), true);
  assert.equal(text.includes('参赛二维码'), true);
  assert.equal(text.includes('Player QR'), false);
  assert.equal(text.includes('Entry QR'), false);
});

test('admin participant count does not hard-code a 64 entrant cap', () => {
  const html = readUtf8('public/admin/index.html');
  const js = readUtf8('public/admin/admin.js');
  const text = `${html}\n${js}`;
  assert.equal(text.includes('</span>/64'), false);
  assert.equal(text.includes('${count} / 64'), false);
});

test('admin treats terminal swiss-only summary as finished', () => {
  const api = readUtf8('public/admin/api.js');
  assert.equal(api.includes("if (s.phase === 'swiss-ended') {"), true);
  assert.equal(api.includes("stage.type === 'swiss'"), true);
  assert.equal(api.includes("!swissStage.advancement?.targetStageId"), true);
});

test('admin sidebar ranking uses final standings and correct head-to-head direction', () => {
  const js = readUtf8('public/admin/admin.js');
  assert.equal(js.includes('function finalStandingsForSidebar(s)'), true);
  assert.equal(js.includes('standingsForStage(s, finalResultStage(s))'), true);
  assert.equal(js.includes('function comparePlayersByRecord(a, b, s)'), true);
  assert.equal(js.includes('return bHeadToHeadWins - aHeadToHeadWins;'), true);
  assert.equal(js.includes("rankByPlayer.has(p) ? rankByPlayer.get(p) : '—'"), true);
});

test('admin sidebar places stage controls above participant list', () => {
  const html = readUtf8('public/admin/index.html');
  const stageIndex = html.indexOf('<div class="panel-title">🧩 阶段</div>');
  const participantIndex = html.indexOf('id="participantPanelTitle"');
  assert.notEqual(stageIndex, -1);
  assert.notEqual(participantIndex, -1);
  assert.equal(stageIndex < participantIndex, true);
});

test('admin idle stage start button stays on idle screen instead of stage list cards', () => {
  const html = readUtf8('public/admin/index.html');
  const js = readUtf8('public/admin/admin.js');
  assert.equal(html.includes('id="stageIdleActions"'), true);
  assert.equal(js.includes('function getStartableStage(s)'), true);
  assert.equal(js.includes("return getStages(s).find(stage => !s?.stageResults?.[stage.id] && !stage.complete) || null;"), true);
  assert.equal(js.includes('const activeStage = getStartableStage(s);'), true);
  assert.equal(js.includes('const actions = document.getElementById(\'stageIdleActions\');'), true);
  assert.equal(js.includes('onclick="startStage('), true);
  assert.equal(js.includes('if (canStart) actions.push(`<button class="btn btn-secondary btn-sm" onclick="startStage('), false);
});

test('admin swiss flow decisions live in center arena after a completed round', () => {
  const js = readUtf8('public/admin/admin.js');
  const css = readUtf8('public/admin/admin.css');
  assert.equal(js.includes('function renderStageArenaActions(s, stage, matches)'), true);
  assert.equal(js.includes("if (isSwiss) return '';"), true);
  assert.equal(js.includes("const continueLabel = currentRound >= plannedRounds ? '额外继续一轮' : '继续一轮';"), true);
  assert.equal(js.includes("onclick=\"completeStage('${stage.id}')\">结束资格赛</button>"), true);
  assert.equal(js.includes('onclick="revertSwissRound()">回退一轮</button>'), true);
  assert.equal(js.includes('${resultHtml}${actionsHtml}${matchHtml}'), true);
  assert.equal(js.includes("rows.push(['轮数', '按人数自动']);"), true);
  assert.equal(css.includes('.stage-flow-actions'), true);
  assert.equal(css.includes('.stage-flow-buttons'), true);
});

test('admin swiss rollback calls existing route from the modular stage panel', () => {
  const js = readUtf8('public/admin/stages-panel.js');
  assert.equal(js.includes('async function revertSwissRound()'), true);
  assert.equal(js.includes("confirmAction('确认回退到上一轮结束后的状态？本轮配对和已录入结果会被撤销。'"), true);
  assert.equal(js.includes("api(tournamentApi('/revert-round'))"), true);
  assert.equal(js.includes('revertSwissRound'), true);
});

test('admin group stage arena shows grouped standings and group match context', () => {
  const js = readUtf8('public/admin/admin.js');
  const css = readUtf8('public/admin/admin.css');
  const requiredJs = [
    'function isGroupStage(stage)',
    'function buildGroupViews(s, stage, matches)',
    'function renderGroupArena(s, stage, matches)',
    'function renderGroupStageArenaActions(s, stage)',
    'function currentGroupRound(s, stage)',
    'function groupRoundCount(matches)',
    'function renderGroupSection(s, group, advancePerGroup)',
    'function renderGroupStandingRow(entry, advancePerGroup)',
    '进入下一轮',
    '结束小组赛',
    "if (isGroupStage(stage) && s.phase === 'groups')",
    'group-standings-mini',
    'group-match-list',
    'const groupText = isGroupStage(stage) ? matchGroupLabel(m) : \'\';',
    'matchGroupLabel(m)',
  ];
  const requiredCss = [
    '.group-stage-arena',
    '.group-stage-overview',
    '.group-board',
    '.group-section',
    '.group-standings-mini',
    '.group-standing-row',
    '.group-match-list',
  ];

  for (const token of requiredJs) {
    assert.equal(js.includes(token), true, `admin group stage JS should include: ${token}`);
  }
  for (const token of requiredCss) {
    assert.equal(css.includes(token), true, `admin group stage CSS should include: ${token}`);
  }
});
