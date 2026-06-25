const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_URL = process.env.PTS_BASE_URL || 'http://127.0.0.1:18765';
const EDGE_PATH =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const OUTPUT_DIR = path.resolve(
  process.cwd(),
  'tmp-visual-audit',
  `qa-${new Date().toISOString().replace(/[:.]/g, '-')}`
);
const BROWSER_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-gpu-compositing',
  '--disable-software-rasterizer',
  '--disable-features=UseSkiaRenderer,VizDisplayCompositor,DawnGraphite',
];

function ensureEdge() {
  if (!fs.existsSync(EDGE_PATH)) {
    throw new Error(`Edge executable not found: ${EDGE_PATH}`);
  }
}

async function getQaTournaments() {
  const response = await fetch(`${BASE_URL}/api/tournaments`);
  if (!response.ok) {
    throw new Error(`Failed to load tournaments: HTTP ${response.status}`);
  }
  const body = await response.json();
  const list = Array.isArray(body) ? body : body.tournaments || [];
  return list
    .filter((item) => item.name && item.name.startsWith('QA-'))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    return null;
  }
}

async function captureWithPlaywright(playwright, url, file, width, height) {
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: EDGE_PATH,
    args: BROWSER_ARGS,
  });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: file, fullPage: false });
  } finally {
    await browser.close();
  }
}

function captureWithEdgeCli(url, file, width, height) {
  const profileDir = path.join(
    OUTPUT_DIR,
    `${path.basename(file, '.png')}-profile`
  );
  const args = [
    '--headless=new',
    ...BROWSER_ARGS,
    '--no-first-run',
    '--disable-extensions',
    '--hide-scrollbars',
    `--user-data-dir=${profileDir}`,
    '--virtual-time-budget=4500',
    `--window-size=${width},${height}`,
    `--screenshot=${file}`,
    url,
  ];
  const result = spawnSync(EDGE_PATH, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `Edge screenshot failed for ${url}`,
        `exit=${result.status}`,
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error(`Screenshot was not created: ${file}`);
  }
}

async function capture(playwright, url, file, width, height) {
  if (playwright) {
    await captureWithPlaywright(playwright, url, file, width, height);
  } else {
    captureWithEdgeCli(url, file, width, height);
  }
}

async function main() {
  ensureEdge();
  const playwright = loadPlaywright();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const tournaments = await getQaTournaments();
  if (!tournaments.length) {
    throw new Error('No QA tournaments found.');
  }

  const manifest = [];
  for (const tournament of tournaments) {
    const key = tournament.name.slice(0, 5).toLowerCase();
    const adminUrl = `${BASE_URL}/t/${encodeURIComponent(
      tournament.id
    )}/admin?v=3.0-admin-stage-cleanup-19`;
    const overlayUrl = `${BASE_URL}/t/${encodeURIComponent(
      tournament.id
    )}/overlay`;
    const adminFile = path.join(OUTPUT_DIR, `${key}-admin.png`);
    const overlayFile = path.join(OUTPUT_DIR, `${key}-overlay.png`);

    await capture(playwright, adminUrl, adminFile, 1440, 1000);
    await capture(playwright, overlayUrl, overlayFile, 1920, 1080);
    manifest.push({
      id: tournament.id,
      name: tournament.name,
      phase: tournament.phase,
      adminUrl,
      overlayUrl,
      adminFile,
      overlayFile,
    });
  }

  const manifestFile = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ outputDir: OUTPUT_DIR, manifest }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
