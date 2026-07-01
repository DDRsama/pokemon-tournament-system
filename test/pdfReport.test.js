const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { PYTHON_BIN } = require('../src/config');
const { buildReportPythonSource, runPythonReport } = require('../src/reports/pdfReport');

const root = path.join(__dirname, '..');

test('pdf report python source compiles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-report-test-'));
  try {
    const scriptPath = path.join(dir, 'render_report.py');
    fs.writeFileSync(scriptPath, buildReportPythonSource(), 'utf8');
    const result = spawnSync(PYTHON_BIN, ['-m', 'py_compile', scriptPath], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tournament pdf no longer renders legacy settings or duplicated stage-round pages', () => {
  const source = buildReportPythonSource();
  [
    '比赛设置',
    'Preset',
    '游戏',
    '3.0 阶段对局',
    'if data.get("stageRounds"):',
  ].forEach(token => {
    assert.equal(source.includes(token), false, `pdf source should not render legacy report section: ${token}`);
  });
  assert.equal(source.includes('赛事阶段'), true);
  assert.equal(source.includes('淘汰赛'), true);
});

test('tournament pdf embeds fallback font for Chinese glyphs missing from Japanese font', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-report-font-fallback-'));
  try {
    const targetPath = path.join(dir, 'fallback.pdf');
    runPythonReport({
      pythonBin: PYTHON_BIN,
      reportsDir: dir,
      reportType: 'tournament',
      targetPath,
      fontCandidates: [
        path.join(root, 'public/shared/fonts/NotoSansJP-Medium.ttf'),
        path.join(root, 'public/shared/fonts/NotoSansSC-Medium.ttf'),
      ],
      data: {
        tournamentName: '涩为什么のTest',
        generatedAt: '2026/07/01 20:00:00',
        labels: {
          exportedAt: 'Exported at: ',
          stagesTitle: 'Tournament Stages',
          order: 'Order',
          stage: 'Stage',
          type: 'Type',
          rules: 'Rules',
          status: 'Status',
          finalResultsTitle: 'Final Results',
          rank: 'Rank',
          player: 'Player',
          result: 'Result',
        },
        stages: [
          { order: 1, name: 'Playoffs Stage', type: 'Single Elimination', rules: 'BO3', status: 'Completed' },
        ],
        finalPlacements: [
          { rankLabel: 'Top 8', player: '涩之律者', result: 'Top 8' },
        ],
      },
    });
    const pdf = fs.readFileSync(targetPath).toString('latin1');
    assert.match(pdf, /NotoSansJP-Medium/);
    assert.match(pdf, /NotoSansSC-Medium/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
