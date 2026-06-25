const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DOCS = [
  'docs/tournament-engine-3.0-design.md',
  'docs/tournament-engine-3.0-implementation-plan.md',
];

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('3.0 docs use the current league-binding scoring model', () => {
  const text = DOCS.map(readUtf8).join('\n');
  const required = [
    '比赛只负责产出本场阶段结果和最终排名',
    '积分规则只负责把比赛排名转换为积分',
    '联赛通过绑定记录选择读取哪些比赛',
    '联赛绑定比赛时选择',
    '比赛进入非 setup 阶段后核心赛制由服务端锁定',
    '后台不再修改核心赛制',
    '瑞士轮开始时按当前参赛人数自动生成计划轮数',
    '每轮完成后，后台可继续追加一轮或结束资格赛',
  ];

  for (const token of required) {
    assert.equal(text.includes(token), true, `3.0 docs should contain current model token: ${token}`);
  }
});

test('3.0 docs do not reintroduce deprecated scoring-model terms', () => {
  const text = DOCS.map(readUtf8).join('\n');
  const forbidden = [
    '计分赛',
    '赛季',
    '比赛是否计分',
    'pointsProfileRef',
    'leagueBindingPointsProfileId',
    '`ranked`',
    '联赛联赛',
    '计分比赛',
    '修改瑞士轮轮数后能按新轮数运行',
    '修改 BO、瑞士轮轮数、Top Cut 人数后能保存',
  ];

  for (const token of forbidden) {
    assert.equal(text.includes(token), false, `3.0 docs should not contain deprecated token: ${token}`);
  }
});
