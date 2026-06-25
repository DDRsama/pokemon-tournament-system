const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('player page exposes profile registration and guest-login prompts', () => {
  const html = readUtf8('public/player/index.html');
  const required = [
    'profilePromptBox',
    'registerProfileBtn',
    'guestLoginBtn',
    'nameExistsBox',
    'playerConfirmOverlay',
    '临时参赛不会获得联赛积分',
  ];

  for (const token of required) {
    assert.equal(html.includes(token), true, `player page should contain: ${token}`);
  }
});

test('player page does not use native browser alert or confirm dialogs', () => {
  const html = readUtf8('public/player/index.html');
  const forbidden = [
    'alert(',
    'confirm(',
    'window.alert',
    'window.confirm',
  ];

  for (const token of forbidden) {
    assert.equal(html.includes(token), false, `player page should not contain native dialog: ${token}`);
  }
});

test('player page scopes remembered identity per tournament and resets stale ids', () => {
  const html = readUtf8('public/player/index.html');
  const required = [
    "const storageScope = tournamentId ? `pto2_${tournamentId}` : 'pto2_unknown';",
    "const centerProfileIdKey = 'pts_player_center_profile_id';",
    'const safeStoredName = looksLikePlayerId(storedName) ?',
    'const suggestedLoginName = looksLikePlayerId(launchName) ?',
    'function resetPlayerIdentity()',
    'function isUsablePlayerView(view)',
    'looksLikePlayerId(view.playerName)',
    'localStorage.removeItem(legacyStorageNameKey)',
    "url.searchParams.delete('playerId')",
    'view.ok !== false',
    '!view.inPool',
    'showLoginCard(',
  ];

  for (const token of required) {
    assert.equal(html.includes(token), true, `player page should contain: ${token}`);
  }
});

test('player tournament page keeps global profile history out of the match page', () => {
  const html = readUtf8('public/player/index.html');
  const required = [
    'identityLabel',
    'playerCenterLink',
    '参赛身份',
    '选手中心',
    '临时参赛：本场可比赛，不计入联赛积分',
  ];
  const forbidden = [
    'profileBox',
    'profileTournamentList',
    'refreshProfileSummary',
    'renderProfileSummary',
  ];

  for (const token of required) {
    assert.equal(html.includes(token), true, `player page should contain: ${token}`);
  }
  for (const token of forbidden) {
    assert.equal(html.includes(token), false, `player page should not contain global profile block: ${token}`);
  }
});

test('player tournament page lets guest entrants upgrade to a long-term profile', () => {
  const html = readUtf8('public/player/index.html');
  const required = [
    'upgradeProfileBtn',
    '登记档案',
    '/player-upgrade-profile',
    'async function upgradeGuestProfile(options = {})',
    'CONFIRM_CREATE_PROFILE',
    'PROFILE_EXISTS',
    'confirmCreate',
    'confirmBind',
    "qs('playerCenterLink').classList.toggle('hidden', !hasProfile);",
    "qs('upgradeProfileBtn').classList.toggle('hidden', hasProfile);",
    "localStorage.setItem(centerProfileIdKey, res.player.globalProfileId);",
  ];

  for (const token of required) {
    assert.equal(html.includes(token), true, `player page should contain guest upgrade token: ${token}`);
  }
});

test('player-facing pages include the shared PTS header', () => {
  const tournamentHtml = readUtf8('public/player/index.html');
  const centerHtml = readUtf8('public/player-center/index.html');
  const centerCss = readUtf8('public/player-center/center.css');
  const headerTokens = [
    '<header class="topbar">',
    '<div class="brand">',
    '<img class="brand-mark" src="/shared/favicon.svg" alt="">',
    '<span class="brand-text">Pokemon Tournament System</span>',
    '<div class="version">3.0-beta</div>',
  ];

  for (const token of headerTokens) {
    assert.equal(tournamentHtml.includes(token), true, `player tournament page should contain PTS header token: ${token}`);
    assert.equal(centerHtml.includes(token), true, `player center should contain PTS header token: ${token}`);
  }
  for (const token of ['.topbar', '.brand', '.brand-mark', '.brand-text', '.version']) {
    assert.equal(tournamentHtml.includes(token), true, `player tournament page should style PTS header token: ${token}`);
    assert.equal(centerCss.includes(token), true, `player center should style PTS header token: ${token}`);
  }
});

test('player center page has local profile selection and tournament entry points', () => {
  const html = readUtf8('public/player-center/index.html');
  const js = readUtf8('public/player-center/center.js');
  const required = [
    'PLAYER CENTER',
    'profileNameInput',
    'currentTournamentList',
    'openTournamentList',
    'historyTournamentList',
    "const profileKey = 'pts_player_center_profile_id';",
    '/api/player-profiles',
    '/api/tournaments',
    'data-return-tournament',
    'data-register-tournament',
  ];

  for (const token of required) {
    assert.equal((html + js).includes(token), true, `player center should contain: ${token}`);
  }
});

test('player center separates return and registration tournament actions', () => {
  const html = readUtf8('public/player-center/index.html');
  const css = readUtf8('public/player-center/center.css');
  const js = readUtf8('public/player-center/center.js');
  const source = html + css + js;
  const required = [
    'tournamentConfirmBox',
    'tournamentConfirmOkBtn',
    'tournamentConfirmCancelBtn',
    'class="modal-overlay hidden" id="tournamentConfirmBox"',
    'class="modal-dialog tournament-confirm"',
    '<button class="secondary-action" id="changeProfileBtn" type="button">登出</button>',
    "const registeredTournamentIds = new Set(tournaments.map(tournamentIdOf).filter(Boolean));",
    "tournaments.filter(item => !isTournamentItemFinished(item)),",
    "{ action: 'return', emptyText: '当前没有正在参加的比赛。' }",
    ".filter(item => item.phase === 'setup' && !registeredTournamentIds.has(tournamentIdOf(item)))",
    "action: 'register'",
    "const actionLabel = options.action === 'register' ? '报名' : '返回';",
    "const actionAttr = options.action === 'register' ? 'data-register-tournament' : 'data-return-tournament';",
    'function showTournamentConfirm(tournamentId)',
    'function confirmTournamentRegistration()',
    'data-return-tournament',
    'data-register-tournament',
    '确认报名',
    'register-action',
  ];
  const forbidden = [
    'data-join-tournament',
    'confirm(',
    'window.confirm',
    'activeProfileMeta',
    '本机身份，仅用于当前浏览器',
    '本机已记住该档案',
    '<button class="secondary-action" id="changeProfileBtn" type="button">切换</button>',
    'profile-confirm tournament-confirm',
    "tournaments.filter(item => !isFinished(item.phase)).slice(",
  ];

  for (const token of required) {
    assert.equal(source.includes(token), true, `player center should contain tournament action token: ${token}`);
  }
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `player center should not contain tournament action token: ${token}`);
  }
});

test('player center exposes report export for finished tournaments only', () => {
  const html = readUtf8('public/player-center/index.html');
  const css = readUtf8('public/player-center/center.css');
  const js = readUtf8('public/player-center/center.js');
  const source = html + css + js;
  const required = [
    '/player/center.js?v=3.0-compact-center',
    'function effectiveTournamentPhase(item)',
    'function isTournamentItemFinished(item)',
    'tournaments.filter(item => !isTournamentItemFinished(item)),',
    'data-export-tournament',
    'data-export-player',
    'function buildPlayerReportUrl(tournamentId, playerName)',
    'function exportPlayerReport(tournamentId, playerName)',
    '/export-player-report?playerName=',
    "window.open(buildPlayerReportUrl(targetId, targetName), '_blank');",
    '导出战报',
    'export-action',
  ];
  const forbidden = [
    'tournaments.filter(item => !isFinished(item.phase)),',
    '/player/center.js?v=3.0-current-tournaments-all',
    '/player/center.js?v=3.0-finished-report-actions',
  ];

  for (const token of required) {
    assert.equal(source.includes(token), true, `player center should contain finished report token: ${token}`);
  }
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `player center should not contain stale finished report token: ${token}`);
  }
});

test('player center uses compact tournament list layout', () => {
  const html = readUtf8('public/player-center/index.html');
  const css = readUtf8('public/player-center/center.css');
  const js = readUtf8('public/player-center/center.js');
  const source = html + css + js;
  const required = [
    'player-center-compact',
    'compact-hero',
    'class="tournament-main"',
    'class="tournament-actions"',
    '.tournament-actions',
    'min-height: 52px;',
    'min-height: 32px;',
    'font-size: 13px;',
    'gap: 6px;',
  ];
  const forbidden = [
    'font-size: clamp(34px, 8vw, 62px);',
    'box-shadow: 0 22px 70px',
    'min-height: 48px;\n  border: 0;\n  border-radius: 8px;\n  font-weight: 900;',
  ];

  for (const token of required) {
    assert.equal(source.includes(token), true, `player center compact layout should contain: ${token}`);
  }
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `player center compact layout should not contain old bulky token: ${token}`);
  }
});

test('player center login page does not expose profile search list', () => {
  const html = readUtf8('public/player-center/index.html');
  const css = readUtf8('public/player-center/center.css');
  const js = readUtf8('public/player-center/center.js');
  const source = html + css + js;
  const required = [
    '<button class="primary-action" id="createProfileBtn" type="button">登录</button>',
    'function findProfileByName(name)',
    'function prepareProfileLogin()',
  ];
  const forbidden = [
    '查找档案',
    '查找已有档案',
    'profileSearchInput',
    'profilePickList',
    'renderProfilePicker',
    'data-select-profile',
    '暂无可选择的档案',
    'profile-picker',
    'pick-row',
  ];

  for (const token of required) {
    assert.equal(source.includes(token), true, `player center should contain: ${token}`);
  }
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `player center should not expose profile search list: ${token}`);
  }
});

test('player center keeps account content hidden before login', () => {
  const html = readUtf8('public/player-center/index.html');
  const css = readUtf8('public/player-center/center.css');
  const js = readUtf8('public/player-center/center.js');
  const source = html + css + js;
  const required = [
    'id="profileContentGrid"',
    'content-grid hidden',
    "qs('profileContentGrid').classList.toggle('hidden', !signedIn);",
    'if (!signedIn) {\n      return;',
  ];
  const forbidden = [
    'login-note',
    '系统会先检查是否已有档案',
    '选择档案后会显示正在参加的比赛。',
    '选择档案后会显示过往记录。',
  ];

  for (const token of required) {
    assert.equal(source.includes(token), true, `player center should contain: ${token}`);
  }
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `player center should not expose pre-login helper/content: ${token}`);
  }
});

test('player center confirms login or registration before entering profile', () => {
  const html = readUtf8('public/player-center/index.html');
  const js = readUtf8('public/player-center/center.js');
  const source = html + js;
  const required = [
    'profileConfirmBox',
    'profileConfirmOkBtn',
    'profileConfirmCancelBtn',
    'function prepareProfileLogin()',
    'function confirmProfileLogin()',
    'function showProfileConfirm(pending)',
    "showProfileConfirm({ mode: 'login'",
    "showProfileConfirm({ mode: 'register'",
    "qs('createProfileBtn').addEventListener('click', () =>",
    'prepareProfileLogin();',
  ];
  const forbidden = [
    'async function createOrSelectProfile()',
    "setActiveProfile(existing.id);\n      return;",
  ];

  for (const token of required) {
    assert.equal(source.includes(token), true, `player center should contain: ${token}`);
  }
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `player center should not immediately enter/create profile: ${token}`);
  }
});
