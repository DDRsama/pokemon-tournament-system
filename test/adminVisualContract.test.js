const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('admin double elimination view exposes winners losers and grand final semantics', () => {
  const js = readUtf8('public/admin/admin.js');
  const required = [
    '双败淘汰规则',
    '胜者组落败进入败者组',
    '败者组再败淘汰',
    '胜者组冠军与败者组冠军进入总决赛',
    '总决赛重置开启',
    '胜者组',
    '败者组',
    '总决赛',
  ];

  for (const token of required) {
    assert.equal(js.includes(token), true, `double elimination UI should include: ${token}`);
  }
});

test('admin team events use entrant/team wording instead of player-only wording', () => {
  const js = readUtf8('public/admin/admin.js');
  const html = readUtf8('public/admin/index.html');
  const text = `${html}\n${js}`;
  const required = [
    '队伍',
    '团队赛',
    '参赛端',
    '扫码进入参赛页面',
  ];

  for (const token of required) {
    assert.equal(text.includes(token), true, `team UI should include: ${token}`);
  }
});

test('admin finished match cards do not expose live or score controls', () => {
  const js = readUtf8('public/admin/admin.js');
  assert.equal(js.includes('const tournamentFinished = isTournamentFinished(s);'), true);
  assert.equal(js.includes('function canOperateMatch(match, state = currentState)'), true);
  assert.equal(js.includes('const canOperate = canOperateMatch(m, s);'), true);
  assert.equal(js.includes('function usesGameScoreRules(rules = {}, stage = null)'), true);
  assert.equal(js.includes('${!tournamentFinished && !m.done && isLive'), true);
  assert.equal(js.includes('${isGamesScore && canOperate ?'), true);
  assert.equal(js.includes('${canOperate && m.p1 ?'), true);
});

test('admin overlay panel has visible fallback and project modal copy flow', () => {
  const html = readUtf8('public/admin/index.html');
  const admin = readUtf8('public/admin/admin.js');
  const api = readUtf8('public/admin/api.js');
  const text = `${html}\n${admin}\n${api}`;
  const required = [
    'overlayPreviewFallback',
    'overlay-preview-title',
    'overlay-preview-meta',
    '复制 OBS 链接',
    '自动复制被浏览器拦截',
    'copyOverlayUrl',
  ];

  for (const token of required) {
    assert.equal(text.includes(token), true, `overlay admin UI should include: ${token}`);
  }
});
