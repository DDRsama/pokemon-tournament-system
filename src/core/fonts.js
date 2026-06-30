const fs = require('fs');
const path = require('path');

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.woff', '.woff2']);

const DEFAULT_WEB_FONTS = {
  latin: {
    family: 'PTS Inter',
    url: '/shared/fonts/InterVariable.woff2',
    format: 'woff2',
  },
  sc: {
    family: 'PTS Noto Sans SC',
    url: '/shared/fonts/NotoSansSC-VF.ttf',
    format: 'truetype',
    pdfPath: path.join('public', 'shared', 'fonts', 'NotoSansSC-VF.ttf'),
  },
  jp: {
    family: 'PTS Noto Sans JP',
    url: '/shared/fonts/NotoSansJP-VF.ttf',
    format: 'truetype',
    pdfPath: path.join('public', 'shared', 'fonts', 'NotoSansJP-VF.ttf'),
  },
};

const DEFAULT_PDF_FONTS = {
  sc: path.join('public', 'shared', 'fonts', 'NotoSansSC-Medium.ttf'),
  jp: path.join('public', 'shared', 'fonts', 'NotoSansJP-Medium.ttf'),
  scFallback: DEFAULT_WEB_FONTS.sc.pdfPath,
  jpFallback: DEFAULT_WEB_FONTS.jp.pdfPath,
};

function listFontFiles(fontsDir = '') {
  if (!fontsDir || !fs.existsSync(fontsDir)) return [];
  return fs.readdirSync(fontsDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => FONT_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function fontFormatForFile(fileName = '') {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.woff2') return 'woff2';
  if (ext === '.woff') return 'woff';
  if (ext === '.otf') return 'opentype';
  if (ext === '.ttc') return 'truetype-collection';
  return 'truetype';
}

function normalizeFontSlug(fileName = '') {
  return path.basename(fileName, path.extname(fileName))
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'custom';
}

function scoreFontFile(fileName = '', role = 'sc') {
  const lower = fileName.toLowerCase();
  const scores = {
    sc: [
      ['ud', 90],
      ['shin', 80],
      ['sc', 70],
      ['cn', 64],
      ['chinese', 60],
      ['hans', 60],
      ['sourcehan', 48],
      ['noto', 36],
      ['sans', 12],
    ],
    jp: [
      ['ud', 90],
      ['kaku', 84],
      ['gothic', 76],
      ['jp', 70],
      ['japanese', 64],
      ['japan', 60],
      ['go', 52],
      ['sourcehan', 48],
      ['noto', 36],
      ['sans', 12],
    ],
    latin: [
      ['inter', 80],
      ['latin', 70],
      ['english', 64],
      ['sans', 20],
    ],
  }[role] || [];
  return scores.reduce((score, [needle, value]) => score + (lower.includes(needle) ? value : 0), 0);
}

function pickUserFont(files = [], role = 'sc') {
  const scored = files
    .map(fileName => ({ fileName, score: scoreFontFile(fileName, role) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.fileName.localeCompare(b.fileName, 'en'));
  return scored[0]?.fileName || null;
}

function buildUserFont(fontsDir, fileName, role) {
  if (!fileName) return null;
  const family = `PTS User ${role.toUpperCase()}`;
  return {
    family,
    fileName,
    path: path.join(fontsDir, fileName),
    url: `/user-fonts/${encodeURIComponent(fileName)}`,
    format: fontFormatForFile(fileName),
  };
}

function getActiveFontConfig({ fontsDir = '', rootDir = process.cwd() } = {}) {
  const files = listFontFiles(fontsDir);
  const user = {
    latin: buildUserFont(fontsDir, pickUserFont(files, 'latin'), 'latin'),
    sc: buildUserFont(fontsDir, pickUserFont(files, 'sc'), 'sc'),
    jp: buildUserFont(fontsDir, pickUserFont(files, 'jp'), 'jp'),
  };
  const defaultPdfFonts = {
    sc: path.join(rootDir, DEFAULT_PDF_FONTS.sc),
    jp: path.join(rootDir, DEFAULT_PDF_FONTS.jp),
    scFallback: path.join(rootDir, DEFAULT_PDF_FONTS.scFallback),
    jpFallback: path.join(rootDir, DEFAULT_PDF_FONTS.jpFallback),
  };
  return {
    files,
    fonts: {
      latin: user.latin || DEFAULT_WEB_FONTS.latin,
      sc: user.sc || { ...DEFAULT_WEB_FONTS.sc, path: defaultPdfFonts.sc },
      jp: user.jp || { ...DEFAULT_WEB_FONTS.jp, path: defaultPdfFonts.jp },
    },
    userFonts: Object.fromEntries(Object.entries(user).filter(([, value]) => !!value)),
    defaultPdfFonts,
  };
}

function getPdfFontCandidates({ fontsDir = '', rootDir = process.cwd() } = {}) {
  const config = getActiveFontConfig({ fontsDir, rootDir });
  const candidates = [];
  for (const role of ['sc', 'jp', 'latin']) {
    const font = config.fonts[role];
    if (font?.path && /\.(ttf|otf|ttc)$/i.test(font.path)) candidates.push(font.path);
  }
  candidates.push(
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
  );
  return [...new Set(candidates.filter(Boolean))];
}

module.exports = {
  DEFAULT_WEB_FONTS,
  DEFAULT_PDF_FONTS,
  listFontFiles,
  getActiveFontConfig,
  getPdfFontCandidates,
  fontFormatForFile,
  scoreFontFile,
};
