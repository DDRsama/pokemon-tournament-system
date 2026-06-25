const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('QA seed tournaments cover realistic event sizes and formats', () => {
  const script = readUtf8('scripts/seed-qa-tournaments.js');
  const required = [
    "playerNames('红莲选手', 64)",
    "playerNames('白银选手', 64)",
    "playerNames('琉璃选手', 32)",
    "playerNames('紫堇选手', 32)",
    "teamNames('道馆队伍', 32)",
    "playerNames('冠军之路', 64)",
    "await addEntrants(id, playerNames('冠军之路', 64), 'player', { registerProfiles: true });",
    "playerNames('满编选手', 128)",
    "finalsType: 'double_elimination'",
    "entrantType: 'team'",
  ];

  for (const token of required) {
    assert.equal(script.includes(token), true, `QA seed should include: ${token}`);
  }
});

test('QA seed tournaments do not use four-player toy samples', () => {
  const script = readUtf8('scripts/seed-qa-tournaments.js');
  const forbidden = [
    'playerNames(',
    'teamNames(',
  ];
  const toySamplePattern = /(?:playerNames|teamNames)\([^)]*,\s*4\s*\)/;

  assert.equal(toySamplePattern.test(script), false);
  for (const token of forbidden) {
    assert.equal(script.includes(token), true, `QA seed should still use helper: ${token}`);
  }
});
