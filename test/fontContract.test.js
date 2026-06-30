const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function readUtf8(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('frontend uses open bundled fonts and runtime font override loader', () => {
  const theme = readUtf8('public/shared/theme.css');
  const loader = readUtf8('public/shared/font-loader.js');
  const pages = [
    'public/home/index.html',
    'public/admin/index.html',
    'public/player/index.html',
    'public/player-center/index.html',
    'public/overlay/index.html',
  ];

  assert.ok(fs.existsSync(path.join(root, 'public/shared/fonts/InterVariable.woff2')));
  assert.ok(fs.existsSync(path.join(root, 'public/shared/fonts/NotoSansSC-VF.ttf')));
  assert.ok(fs.existsSync(path.join(root, 'public/shared/fonts/NotoSansJP-VF.ttf')));
  assert.ok(fs.existsSync(path.join(root, 'public/shared/fonts/NotoSansSC-Medium.ttf')));
  assert.ok(fs.existsSync(path.join(root, 'public/shared/fonts/NotoSansJP-Medium.ttf')));
  assert.equal(fs.existsSync(path.join(root, 'public/shared/fonts/ud-shin-go-sc-r.ttf')), false);
  assert.match(theme, /PTS Inter/);
  assert.match(theme, /PTS Noto Sans SC/);
  assert.match(theme, /PTS Noto Sans JP/);
  assert.match(loader, /\/api\/fonts\/active/);
  assert.match(loader, /--pts-font-sans/);
  assert.match(loader, /--pto-font-sans/);
  for (const page of pages) {
    assert.equal(readUtf8(page).includes('/shared/font-loader.js?v=3.3-font-loader-1'), true, `${page} should load font loader`);
  }
});

test('font discovery prefers user fonts and feeds PDF candidates', () => {
  const { getActiveFontConfig, getPdfFontCandidates } = require('../src/core/fonts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-fonts-'));
  fs.writeFileSync(path.join(dir, 'UD-Shin-Go-SC-R.ttf'), '');
  fs.writeFileSync(path.join(dir, 'UD-Kaku-Go-JP.ttf'), '');

  const config = getActiveFontConfig({ fontsDir: dir, rootDir: root });
  assert.equal(config.fonts.sc.fileName, 'UD-Shin-Go-SC-R.ttf');
  assert.equal(config.fonts.sc.url, '/user-fonts/UD-Shin-Go-SC-R.ttf');
  assert.equal(config.fonts.jp.fileName, 'UD-Kaku-Go-JP.ttf');

  const candidates = getPdfFontCandidates({ fontsDir: dir, rootDir: root });
  assert.equal(candidates[0], path.join(dir, 'UD-Shin-Go-SC-R.ttf'));
  assert.equal(candidates.includes(path.join(root, 'public/shared/fonts/NotoSansSC-Medium.ttf')), true);
  assert.equal(candidates.includes(path.join(root, 'public/shared/fonts/NotoSansJP-Medium.ttf')), true);
  assert.equal(candidates.includes(path.join(root, 'public/shared/fonts/NotoSansSC-VF.ttf')), true);
  assert.equal(candidates.includes(path.join(root, 'public/shared/fonts/NotoSansCJKsc-Medium.otf')), false);
  assert.equal(candidates.includes('C:\\Windows\\Fonts\\msyhbd.ttc'), false);
  assert.equal(candidates.indexOf(path.join(root, 'public/shared/fonts/NotoSansSC-Medium.ttf')) < candidates.indexOf(path.join(root, 'public/shared/fonts/NotoSansSC-VF.ttf')), true);
  assert.equal(candidates.indexOf(path.join(root, 'public/shared/fonts/NotoSansSC-Medium.ttf')) < candidates.indexOf('C:\\Windows\\Fonts\\msyh.ttc'), true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('server exposes font override routes and PDF no longer hard-codes private font asset', () => {
  const staticRoutes = readUtf8('src/routes/static.js');
  const app = readUtf8('src/app.js');
  const pdf = readUtf8('src/reports/pdfReport.js');
  const dockerfile = readUtf8('Dockerfile');

  assert.match(staticRoutes, /\/user-fonts/);
  assert.match(staticRoutes, /\/api\/fonts\/active/);
  assert.match(app, /FONTS_DIR/);
  assert.match(app, /getPdfFontCandidates\(\)/);
  assert.match(pdf, /fontCandidates/);
  assert.doesNotMatch(pdf, /ud-shin-go-sc-r/);
  assert.match(dockerfile, /ENV FONTS_DIR=\/data\/fonts/);
  assert.match(dockerfile, /\/data\/fonts/);
});
