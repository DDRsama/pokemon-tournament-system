const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 18765);
const DATA_DIR = process.env.PTS_DATA_DIR || process.env.DATA_DIR || path.join(ROOT_DIR, 'data', 'tournaments');
const PLAYERS_DIR = process.env.PTS_PLAYERS_DIR || process.env.PLAYERS_DIR || path.join(ROOT_DIR, 'data', 'players');
const LEAGUES_DIR = process.env.PTS_LEAGUES_DIR || process.env.LEAGUES_DIR || path.join(ROOT_DIR, 'data', 'leagues');
const POINTS_DIR = process.env.PTS_POINTS_DIR || process.env.POINTS_DIR || path.join(ROOT_DIR, 'data', 'points');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const REPORTS_DIR = process.env.PTS_REPORT_DIR || process.env.REPORTS_DIR || path.join(ROOT_DIR, 'data', 'reports');
const CODEX_PYTHON_BIN = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
const PYTHON_BIN = process.env.PYTHON_BIN
  || process.env.PYTHON
  || (fs.existsSync(CODEX_PYTHON_BIN) ? CODEX_PYTHON_BIN : (process.platform === 'win32' ? 'python' : 'python3'));

module.exports = {
  ROOT_DIR,
  PORT,
  DATA_DIR,
  PLAYERS_DIR,
  LEAGUES_DIR,
  POINTS_DIR,
  PUBLIC_DIR,
  PUBLIC_BASE_URL,
  REPORTS_DIR,
  PYTHON_BIN,
};
