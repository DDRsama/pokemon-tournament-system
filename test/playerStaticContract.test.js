const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readPngSize(relativePath) {
  const buffer = fs.readFileSync(path.join(ROOT, relativePath));
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG', `${relativePath} should be a png file`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
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
    "const launchFromCenter = params.get('fromCenter') === '1';",
    'const launchIdentityName = launchEntrantName || launchName;',
    'const suggestedLoginName = looksLikePlayerId(launchIdentityName) ?',
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
    '<div class="version">3.3.5</div>',
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
    '选手中心',
    '/shared/i18n.js?v=3.3-i18n-scan-1',
    'profileNameInput',
    'currentTournamentList',
    'openTournamentList',
    'historyTournamentList',
    "const profileKey = 'pts_player_center_profile_id';",
    '/api/player-profiles',
    '/api/tournaments',
    'data-return-tournament',
    'data-entrant-name',
    'data-register-tournament',
    'refreshProfileBtn',
    'function refreshProfileCenter()',
    "url.searchParams.set('fromCenter', '1');",
    'profileEditBox',
    'editProfileBtn',
    '/api/player-profiles/${encodeURIComponent(profile.id)}',
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
    '<button class="secondary-action" id="editProfileBtn" type="button">改名</button>',
    '<button class="secondary-action" id="refreshProfileBtn" type="button">刷新</button>',
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
    '/player/center.js?v=3.3.5-refresh-1',
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
    '/player/center.js?v=3.0-compact-center',
    '/player/center.js?v=3.0-current-tournaments-all',
    '/player/center.js?v=3.0-finished-report-actions',
    '/player/center.js?v=3.3-profile-rename-1',
    '/player/center.js?v=3.3-profile-rename-i18n-1',
  ];

  for (const token of required) {
    assert.equal(source.includes(token), true, `player center should contain finished report token: ${token}`);
  }
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `player center should not contain stale finished report token: ${token}`);
  }
});

test('player center registration can separate profile name from tournament entry name', () => {
  const html = readUtf8('public/player-center/index.html');
  const js = readUtf8('public/player-center/center.js');
  const tournamentPage = readUtf8('public/player/index.html');
  const source = html + js + tournamentPage;
  const required = [
    'tournamentEntryNameInput',
    '本场参赛名',
    "url.searchParams.set('profileName', profile.displayName || '');",
    'entrantName',
    'profileName',
    "const launchProfileName = (params.get('profileName') || '').trim();",
  ];

  for (const token of required) {
    assert.equal(source.includes(token), true, `player center should support entry-name separation token: ${token}`);
  }
});

test('player center lets the signed-in player rename their profile', () => {
  const html = readUtf8('public/player-center/index.html');
  const css = readUtf8('public/player-center/center.css');
  const js = readUtf8('public/player-center/center.js');
  const source = html + css + js;
  const required = [
    'id="profileEditBox"',
    'id="profileEditNameInput"',
    'id="profileEditSaveBtn"',
    'id="editProfileBtn"',
    'function showProfileEdit()',
    'function submitProfileEdit()',
    "'PATCH'",
    '这个名称已有选手档案使用。',
    '保存后会同步到已经绑定这个档案的比赛记录。',
    '.profile-actions',
    '.profile-edit-dialog',
  ];

  for (const token of required) {
    assert.equal(source.includes(token), true, `player center profile rename should contain: ${token}`);
  }
});

test('player center can be installed from phone home screens', () => {
  const html = readUtf8('public/player-center/index.html');
  const css = readUtf8('public/player-center/center.css');
  const js = readUtf8('public/player-center/center.js');
  const manifest = JSON.parse(readUtf8('public/player-center/manifest.webmanifest'));
  const sw = readUtf8('public/player-center/sw.js');
  const source = html + css + js + sw;

  [
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="PTS选手中心">',
    '<link rel="apple-touch-icon" href="/shared/apple-touch-icon.png">',
    '<link rel="manifest" href="/player/manifest.webmanifest">',
    'id="installBanner"',
    'id="installAppBtn"',
    'function setupInstallPrompt()',
    'beforeinstallprompt',
    'navigator.standalone',
    "window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1",
    "navigator.serviceWorker\n        .register('/player/sw.js', { scope: '/player/' })",
    '.install-banner',
  ].forEach(token => assert.equal(source.includes(token), true, `installable player center should contain: ${token}`));

  assert.equal(manifest.start_url, '/player/');
  assert.equal(manifest.scope, '/player/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons.some(icon => icon.src === '/shared/app-icon-192.png' && icon.sizes === '192x192'), true);
  assert.equal(manifest.icons.some(icon => icon.src === '/shared/app-icon-512.png' && icon.sizes === '512x512'), true);
  assert.equal(sw.includes("if (url.pathname.startsWith('/api/')) return;"), true);

  [
    ['public/shared/apple-touch-icon.png', 180],
    ['public/shared/app-icon-192.png', 192],
    ['public/shared/app-icon-512.png', 512],
  ].forEach(([relativePath, size]) => {
    assert.equal(fs.existsSync(path.join(ROOT, relativePath)), true, `missing app icon: ${relativePath}`);
    assert.deepEqual(readPngSize(relativePath), { width: size, height: size });
  });
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
    'min-height: 44px;',
    'min-height: 32px;',
    'font-size: 12px;',
    'gap: 5px;',
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
