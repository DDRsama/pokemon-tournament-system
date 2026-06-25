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
