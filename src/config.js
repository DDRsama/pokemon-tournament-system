const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 18765);
const DATA_ROOT = String(process.env.PTS_DATA_ROOT || process.env.DATA_ROOT || '').trim();
function resolveDataPath(envName, legacyEnvName, subdir) {
  return process.env[envName]
    || process.env[legacyEnvName]
    || (DATA_ROOT ? path.join(DATA_ROOT, subdir) : path.join(ROOT_DIR, 'data', subdir));
}
const DATA_DIR = resolveDataPath('PTS_DATA_DIR', 'DATA_DIR', 'tournaments');
const PLAYERS_DIR = resolveDataPath('PTS_PLAYERS_DIR', 'PLAYERS_DIR', 'players');
const LEAGUES_DIR = resolveDataPath('PTS_LEAGUES_DIR', 'LEAGUES_DIR', 'leagues');
const POINTS_DIR = resolveDataPath('PTS_POINTS_DIR', 'POINTS_DIR', 'points');
const FONTS_DIR = resolveDataPath('PTS_FONTS_DIR', 'FONTS_DIR', 'fonts');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const REPORTS_DIR = resolveDataPath('PTS_REPORT_DIR', 'REPORTS_DIR', 'reports');
const CODEX_PYTHON_BIN = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
const PYTHON_BIN = process.env.PYTHON_BIN
  || process.env.PYTHON
  || (fs.existsSync(CODEX_PYTHON_BIN) ? CODEX_PYTHON_BIN : (process.platform === 'win32' ? 'python' : 'python3'));

module.exports = {
  ROOT_DIR,
  PORT,
  DATA_ROOT,
  DATA_DIR,
  PLAYERS_DIR,
  LEAGUES_DIR,
  POINTS_DIR,
  FONTS_DIR,
  PUBLIC_DIR,
  PUBLIC_BASE_URL,
  REPORTS_DIR,
  PYTHON_BIN,
};
