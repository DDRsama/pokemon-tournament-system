const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { PYTHON_BIN } = require('../src/config');
const { buildReportPythonSource } = require('../src/reports/pdfReport');

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
