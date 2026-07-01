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
  assert.match(loader, /pts-languagechange/);
  assert.match(loader, /data-pts-font-language/);
  for (const page of pages) {
    assert.equal(readUtf8(page).includes('/shared/font-loader.js?v=3.3-font-loader-2'), true, `${page} should load font loader`);
  }
});

test('font discovery prefers language folders and feeds language-aware PDF candidates', () => {
  const { getActiveFontConfig, getPdfFontCandidates } = require('../src/core/fonts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-fonts-'));
  fs.mkdirSync(path.join(dir, 'zh'));
  fs.mkdirSync(path.join(dir, 'en'));
  fs.mkdirSync(path.join(dir, 'ja'));
  fs.writeFileSync(path.join(dir, 'zh', 'UD-Shin-Go-SC-R.ttf'), '');
  fs.writeFileSync(path.join(dir, 'en', 'Inter-Custom.ttf'), '');
  fs.writeFileSync(path.join(dir, 'ja', 'UD-Kaku-Go-JP.ttf'), '');
  fs.writeFileSync(path.join(dir, 'UD-Flat-Legacy.ttf'), '');

  const config = getActiveFontConfig({ fontsDir: dir, rootDir: root });
  assert.equal(config.fonts.zh.fileName, 'UD-Shin-Go-SC-R.ttf');
  assert.equal(config.fonts.zh.url, '/user-fonts/zh/UD-Shin-Go-SC-R.ttf');
  assert.equal(config.fonts.en.fileName, 'Inter-Custom.ttf');
  assert.equal(config.fonts.ja.fileName, 'UD-Kaku-Go-JP.ttf');
  assert.equal(config.fonts.ja.url, '/user-fonts/ja/UD-Kaku-Go-JP.ttf');

  const zhCandidates = getPdfFontCandidates({ fontsDir: dir, rootDir: root, language: 'zh-CN' });
  assert.equal(zhCandidates[0], path.join(dir, 'zh', 'UD-Shin-Go-SC-R.ttf'));
  assert.equal(zhCandidates.includes(path.join(root, 'public/shared/fonts/NotoSansSC-Medium.ttf')), true);
  assert.equal(zhCandidates.includes(path.join(root, 'public/shared/fonts/NotoSansJP-Medium.ttf')), true);
  assert.equal(zhCandidates.includes(path.join(root, 'public/shared/fonts/NotoSansSC-VF.ttf')), true);
  assert.equal(zhCandidates.includes(path.join(root, 'public/shared/fonts/NotoSansCJKsc-Medium.otf')), false);
  assert.equal(zhCandidates.includes('C:\\Windows\\Fonts\\msyhbd.ttc'), false);
  assert.equal(zhCandidates.indexOf(path.join(root, 'public/shared/fonts/NotoSansSC-Medium.ttf')) < zhCandidates.indexOf(path.join(root, 'public/shared/fonts/NotoSansSC-VF.ttf')), true);
  assert.equal(zhCandidates.indexOf(path.join(root, 'public/shared/fonts/NotoSansSC-Medium.ttf')) < zhCandidates.indexOf('C:\\Windows\\Fonts\\msyh.ttc'), true);

  const jaCandidates = getPdfFontCandidates({ fontsDir: dir, rootDir: root, language: 'ja' });
  assert.equal(jaCandidates[0], path.join(dir, 'ja', 'UD-Kaku-Go-JP.ttf'));
  assert.equal(jaCandidates.indexOf(path.join(dir, 'ja', 'UD-Kaku-Go-JP.ttf')) < jaCandidates.indexOf(path.join(dir, 'zh', 'UD-Shin-Go-SC-R.ttf')), true);

  const enCandidates = getPdfFontCandidates({ fontsDir: dir, rootDir: root, language: 'en' });
  assert.equal(enCandidates[0], path.join(dir, 'en', 'Inter-Custom.ttf'));
  assert.equal(enCandidates.includes(path.join(root, 'public/shared/fonts/InterVariable.woff2')), true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('language folders disable ambiguous flat-directory fallback for missing languages', () => {
  const { getActiveFontConfig } = require('../src/core/fonts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-fonts-'));
  fs.mkdirSync(path.join(dir, 'zh'));
  fs.writeFileSync(path.join(dir, 'zh', 'UD-Shin-Go-SC-R.ttf'), '');
  fs.writeFileSync(path.join(dir, 'UD-Kaku-Go-JP.ttf'), '');

  const config = getActiveFontConfig({ fontsDir: dir, rootDir: root });
  assert.equal(config.fonts.zh.fileName, 'UD-Shin-Go-SC-R.ttf');
  assert.equal(config.fonts.ja.fileName, undefined);
  assert.equal(config.fonts.ja.family, 'PTS Noto Sans JP');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('legacy flat font directory remains a fallback', () => {
  const { getActiveFontConfig, getPdfFontCandidates } = require('../src/core/fonts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-fonts-'));
  fs.writeFileSync(path.join(dir, 'UD-Shin-Go-SC-R.ttf'), '');
  fs.writeFileSync(path.join(dir, 'UD-Kaku-Go-JP.ttf'), '');

  const config = getActiveFontConfig({ fontsDir: dir, rootDir: root });
  assert.equal(config.fonts.zh.fileName, 'UD-Shin-Go-SC-R.ttf');
  assert.equal(config.fonts.zh.url, '/user-fonts/UD-Shin-Go-SC-R.ttf');
  assert.equal(config.fonts.ja.fileName, 'UD-Kaku-Go-JP.ttf');

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
  assert.match(app, /getPdfFontCandidates\(options\.language\)/);
  assert.match(app, /language = 'zh-CN'/);
  assert.match(pdf, /fontCandidates/);
  assert.doesNotMatch(pdf, /ud-shin-go-sc-r/);
  assert.match(dockerfile, /ENV FONTS_DIR=\/data\/fonts/);
  assert.match(dockerfile, /\/data\/fonts/);
});
