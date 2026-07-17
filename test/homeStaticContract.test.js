const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('home profile history separates primary tournament info from secondary points info', () => {
  const profilesJs = readUtf8('public/home/profiles.js');
  const homeCss = readUtf8('public/home/home.css');

  assert.equal(profilesJs.includes('profile-history-main'), true);
  assert.equal(profilesJs.includes('profile-history-meta'), true);
  assert.equal(profilesJs.includes('profile-history-rank'), true);
  assert.equal(
    profilesJs.includes("`${Number(item.points || 0)} pt${source ?"),
    false,
    'profile history should not concatenate tournament, rank, points, league, and rule into one line',
  );
  assert.equal(homeCss.includes('.profile-history-main'), true);
  assert.equal(homeCss.includes('.profile-history-meta'), true);
});

test('home player profile manager supports search and pagination', () => {
  const html = readUtf8('public/home/index.html');
  const profilesJs = readUtf8('public/home/profiles.js');
  const homeJs = readUtf8('public/home/home.js');
  const homeCss = readUtf8('public/home/home.css');

  [
    'profileManagerSearchInput',
    'profileManagerPageSizeSelect',
    'profileManagerPager',
  ].forEach(token => assert.equal(html.includes(token), true, `home page should contain: ${token}`));
  assert.equal(html.includes('profileSearchInput'), false);
  assert.equal(html.includes('profilePager'), false);

  [
    'profileSearchText',
    'filterProfiles',
    'paginateProfiles',
    'renderProfilePager',
    'setProfilePage',
    'resetProfilePage',
  ].forEach(token => assert.equal(profilesJs.includes(token), true, `profile module should contain: ${token}`));

  assert.equal(homeJs.includes("resetProfilePage('main')"), false);
  assert.equal(homeJs.includes("resetProfilePage('manager')"), true);
  assert.equal(homeJs.includes('data-profile-page'), true);
  assert.equal(profilesJs.includes('最近更新：'), true);
  assert.equal(homeCss.includes('.profile-pager'), true);
  assert.equal(homeCss.includes('.manager-toolbar'), true);
  assert.equal(html.includes('/home/home.css?v=3.3-release-1'), true);
  assert.equal(html.includes('/shared/i18n.js?v=3.3-i18n-scan-1'), true);
  assert.equal(html.includes('/home/home.js?v=3.3-i18n-refresh-1'), true);
  assert.equal(html.includes('/home/profiles.js?v=3.1-visual-polish-1'), true);
  assert.equal(homeCss.includes('.manager-list .data-item'), true);
  assert.equal(homeCss.includes('min-height: 30px;'), true);
});

test('home tournament creation no longer asks for fixed swiss round count', () => {
  const html = readUtf8('public/home/index.html');
  const js = readUtf8('public/home/tournaments.js');
  const api = readUtf8('public/home/api.js');

  assert.equal(html.includes('swissRoundsInput'), false);
  assert.equal(html.includes('瑞士轮轮数'), false);
  assert.equal(html.includes('按人数自动'), true);
  assert.equal(js.includes("swiss: { roundPolicy: 'auto_by_entrant_count'"), true);
  assert.equal(js.includes('swissRoundsInput'), false);
  assert.equal(api.includes('swissRoundsInput'), false);
});

test('home swiss auto-round hint stays on one line across the create grid', () => {
  const css = readUtf8('public/home/home.css');
  assert.equal(css.includes('.create-rule-readonly'), true);
  assert.equal(css.includes('grid-column: 1 / -1;'), true);
  assert.equal(css.includes('white-space: nowrap;'), true);
});

test('main pages expose phone home screen icons', () => {
  [
    'public/home/index.html',
    'public/admin/index.html',
    'public/player/index.html',
    'public/player-center/index.html',
    'public/overlay/index.html',
  ].forEach(relativePath => {
    const html = readUtf8(relativePath);
    assert.equal(html.includes('<meta name="theme-color" content="#0f172a">'), true, `${relativePath} should expose theme color`);
    assert.equal(html.includes('<link rel="icon" type="image/png" sizes="192x192" href="/shared/app-icon-192.png">'), true, `${relativePath} should expose png app icon`);
    assert.equal(html.includes('<link rel="apple-touch-icon" href="/shared/apple-touch-icon.png">'), true, `${relativePath} should expose iOS app icon`);
  });
});

test('player-facing chrome shows the 3.3 release version label', () => {
  [
    'public/home/index.html',
    'public/admin/index.html',
    'public/player/index.html',
    'public/player-center/index.html',
  ].forEach(relativePath => {
    const html = readUtf8(relativePath);
    assert.equal(html.includes('<div class="version">3.3.5</div>'), true, `${relativePath} should expose current release label`);
    assert.equal(html.includes('<div class="version">3.1-beta</div>'), false, `${relativePath} should not expose stale beta label`);
    assert.equal(html.includes('<div class="version">3.0-beta</div>'), false, `${relativePath} should not expose stale beta label`);
  });
});
