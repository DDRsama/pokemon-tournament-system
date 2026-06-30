const fs = require('fs');
const path = require('path');

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.woff', '.woff2']);
const PDF_FONT_EXTENSIONS = /\.(ttf|otf|ttc)$/i;

const FONT_LANGUAGE_DIRS = {
  zh: ['zh', 'zh-CN', 'cn', 'sc', 'chinese'],
  en: ['en', 'latin', 'english'],
  ja: ['ja', 'jp', 'japanese'],
};

const DEFAULT_WEB_FONTS = {
  en: {
    family: 'PTS Inter',
    url: '/shared/fonts/InterVariable.woff2',
    format: 'woff2',
  },
  zh: {
    family: 'PTS Noto Sans SC',
    url: '/shared/fonts/NotoSansSC-VF.ttf',
    format: 'truetype',
    pdfPath: path.join('public', 'shared', 'fonts', 'NotoSansSC-VF.ttf'),
  },
  ja: {
    family: 'PTS Noto Sans JP',
    url: '/shared/fonts/NotoSansJP-VF.ttf',
    format: 'truetype',
    pdfPath: path.join('public', 'shared', 'fonts', 'NotoSansJP-VF.ttf'),
  },
};

const DEFAULT_PDF_FONTS = {
  zh: path.join('public', 'shared', 'fonts', 'NotoSansSC-Medium.ttf'),
  ja: path.join('public', 'shared', 'fonts', 'NotoSansJP-Medium.ttf'),
  zhFallback: DEFAULT_WEB_FONTS.zh.pdfPath,
  jaFallback: DEFAULT_WEB_FONTS.ja.pdfPath,
};

function normalizeLanguageRole(role = 'zh') {
  const value = String(role || '').toLowerCase();
  if (value === 'zh-cn' || value === 'sc' || value === 'cn' || value === 'chinese' || value === 'latin') {
    return value === 'latin' ? 'en' : 'zh';
  }
  if (value === 'jp' || value === 'japanese') return 'ja';
  if (value === 'english') return 'en';
  return ['zh', 'en', 'ja'].includes(value) ? value : 'zh';
}

function listFontFilesInDir(dir = '') {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => FONT_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function listFontFiles(fontsDir = '') {
  return listFontFilesInDir(fontsDir);
}

function fontFormatForFile(fileName = '') {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.woff2') return 'woff2';
  if (ext === '.woff') return 'woff';
  if (ext === '.otf') return 'opentype';
  if (ext === '.ttc') return 'truetype-collection';
  return 'truetype';
}

function scoreFontFile(fileName = '', role = 'zh') {
  const normalizedRole = normalizeLanguageRole(role);
  const lower = fileName.toLowerCase();
  const scores = {
    zh: [
      ['ud', 90],
      ['shin', 80],
      ['zh', 76],
      ['sc', 70],
      ['cn', 64],
      ['chinese', 60],
      ['hans', 60],
      ['sourcehan', 48],
      ['noto', 36],
      ['sans', 12],
    ],
    ja: [
      ['ud', 90],
      ['kaku', 84],
      ['gothic', 76],
      ['ja', 74],
      ['jp', 70],
      ['japanese', 64],
      ['japan', 60],
      ['go', 52],
      ['sourcehan', 48],
      ['noto', 36],
      ['sans', 12],
    ],
    en: [
      ['inter', 80],
      ['latin', 70],
      ['en', 66],
      ['english', 64],
      ['sans', 20],
    ],
  }[normalizedRole] || [];
  return scores.reduce((score, [needle, value]) => score + (lower.includes(needle) ? value : 0), 0);
}

function pickUserFont(files = [], role = 'zh') {
  const scored = files
    .map(fileName => ({ fileName, score: scoreFontFile(fileName, role) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.fileName.localeCompare(b.fileName, 'en'));
  return scored[0]?.fileName || null;
}

function pickFirstFont(files = []) {
  const preferred = files.find(name => PDF_FONT_EXTENSIONS.test(name)) || files[0];
  return preferred || null;
}

function languageDirForRole(fontsDir, role) {
  if (!fontsDir) return null;
  for (const dirName of FONT_LANGUAGE_DIRS[normalizeLanguageRole(role)] || []) {
    const candidate = path.join(fontsDir, dirName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  }
  return null;
}

function buildUserFont({ fontsDir, fileName, role, subdir = '' }) {
  if (!fileName) return null;
  const normalizedRole = normalizeLanguageRole(role);
  const relativePath = subdir ? `${subdir}/${fileName}` : fileName;
  return {
    family: `PTS User ${normalizedRole.toUpperCase()}`,
    fileName,
    subdir,
    path: path.join(fontsDir, subdir, fileName),
    url: `/user-fonts/${relativePath.split('/').map(encodeURIComponent).join('/')}`,
    format: fontFormatForFile(fileName),
  };
}

function pickLanguageFolderFont(fontsDir, role) {
  const dir = languageDirForRole(fontsDir, role);
  if (!dir) return null;
  const files = listFontFilesInDir(dir);
  const fileName = pickFirstFont(files);
  if (!fileName) return null;
  return buildUserFont({
    fontsDir,
    fileName,
    role,
    subdir: path.basename(dir),
  });
}

function getLegacyUserFonts(fontsDir) {
  const files = listFontFiles(fontsDir);
  return {
    en: buildUserFont({ fontsDir, fileName: pickUserFont(files, 'en'), role: 'en' }),
    zh: buildUserFont({ fontsDir, fileName: pickUserFont(files, 'zh'), role: 'zh' }),
    ja: buildUserFont({ fontsDir, fileName: pickUserFont(files, 'ja'), role: 'ja' }),
  };
}

function withDefaultPath(font, rootDir) {
  if (!font) return font;
  if (font.path) return font;
  const role = normalizeLanguageRole(font === DEFAULT_WEB_FONTS.en ? 'en' : font === DEFAULT_WEB_FONTS.ja ? 'ja' : 'zh');
  const pdfPath = role === 'ja' ? DEFAULT_PDF_FONTS.ja : (role === 'zh' ? DEFAULT_PDF_FONTS.zh : '');
  return pdfPath ? { ...font, path: path.join(rootDir, pdfPath) } : font;
}

function getActiveFontConfig({ fontsDir = '', rootDir = process.cwd() } = {}) {
  const languageDirs = Object.fromEntries(
    Object.entries(FONT_LANGUAGE_DIRS)
      .map(([role]) => [role, languageDirForRole(fontsDir, role)])
      .filter(([, dir]) => !!dir)
  );
  const hasLanguageDirs = Object.keys(languageDirs).length > 0;
  const languageFonts = {
    en: pickLanguageFolderFont(fontsDir, 'en'),
    zh: pickLanguageFolderFont(fontsDir, 'zh'),
    ja: pickLanguageFolderFont(fontsDir, 'ja'),
  };
  const legacyFonts = getLegacyUserFonts(fontsDir);
  const fonts = {
    en: languageFonts.en || (!hasLanguageDirs ? legacyFonts.en : null) || DEFAULT_WEB_FONTS.en,
    zh: languageFonts.zh || (!hasLanguageDirs ? legacyFonts.zh : null) || withDefaultPath(DEFAULT_WEB_FONTS.zh, rootDir),
    ja: languageFonts.ja || (!hasLanguageDirs ? legacyFonts.ja : null) || withDefaultPath(DEFAULT_WEB_FONTS.ja, rootDir),
  };
  const defaultPdfFonts = {
    zh: path.join(rootDir, DEFAULT_PDF_FONTS.zh),
    ja: path.join(rootDir, DEFAULT_PDF_FONTS.ja),
    zhFallback: path.join(rootDir, DEFAULT_PDF_FONTS.zhFallback),
    jaFallback: path.join(rootDir, DEFAULT_PDF_FONTS.jaFallback),
  };
  return {
    files: listFontFiles(fontsDir),
    languageDirs,
    fonts,
    legacyFonts: Object.fromEntries(Object.entries(legacyFonts).filter(([, value]) => !!value)),
    userFonts: Object.fromEntries(Object.entries(fonts).filter(([, value]) => !!value?.fileName)),
    defaultPdfFonts,
  };
}

function fontCandidatesForRole(config, role) {
  const normalizedRole = normalizeLanguageRole(role);
  const order = normalizedRole === 'ja'
    ? ['ja', 'en', 'zh']
    : (normalizedRole === 'en' ? ['en', 'zh', 'ja'] : ['zh', 'en', 'ja']);
  return order
    .map(item => config.fonts[item])
    .filter(font => font?.path && PDF_FONT_EXTENSIONS.test(font.path))
    .map(font => font.path);
}

function getPdfFontCandidates({ fontsDir = '', rootDir = process.cwd(), language = 'zh' } = {}) {
  const config = getActiveFontConfig({ fontsDir, rootDir });
  const candidates = [
    ...fontCandidatesForRole(config, language),
    path.join(rootDir, 'public', 'shared', 'fonts', 'NotoSansSC-Medium.ttf'),
    path.join(rootDir, 'public', 'shared', 'fonts', 'NotoSansJP-Medium.ttf'),
    path.join(rootDir, 'public', 'shared', 'fonts', 'NotoSansSC-VF.ttf'),
    path.join(rootDir, 'public', 'shared', 'fonts', 'NotoSansJP-VF.ttf'),
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf',
    '/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf',
    'C:\\Windows\\Fonts\\msyh.ttc',
    'C:\\Windows\\Fonts\\simsun.ttc',
  ];
  return [...new Set(candidates.filter(Boolean))];
}

module.exports = {
  DEFAULT_WEB_FONTS,
  DEFAULT_PDF_FONTS,
  FONT_LANGUAGE_DIRS,
  listFontFiles,
  getActiveFontConfig,
  getPdfFontCandidates,
  fontFormatForFile,
  scoreFontFile,
  normalizeLanguageRole,
};
