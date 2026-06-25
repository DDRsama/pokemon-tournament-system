// Overlay shared utilities. Loaded before view renderers.

function getRecord(player, matches) {
  let w = 0, d = 0, l = 0;
  for (const m of matches) {
    if (!m.done) continue;
    if (m.draw) { if (m.p1 === player || m.p2 === player) d++; continue; }
    if (m.winner === player) w++;
    else if (m.p1 === player || m.p2 === player) l++;
  }
  return { w, d, l, pts: w * 3 + d };
}

function renderRecordChips(record) {
  if (!record) return '';
  return [
    ['w', 'W', record.w],
    ['d', 'D', record.d],
    ['l', 'L', record.l],
  ].map(([cls, label, value]) => (
    `<span class="record-chip ${cls}"><span class="label">${label}</span><span class="value">${value}</span></span>`
  )).join('');
}

function top8PhaseName(phase) {
  return ({
    top8: '\u6dd8\u6c70\u8d5b',
    single_elimination: '\u5355\u8d25\u6dd8\u6c70',
    double_elimination: '\u53cc\u8d25\u6dd8\u6c70',
    'double_elimination-ended': '\u53cc\u8d25\u6dd8\u6c70\u7ed3\u679c',
    winners: '\u80dc\u8005\u7ec4',
    losers: '\u8d25\u8005\u7ec4',
    grand_final: '\u603b\u51b3\u8d5b',
    'Quarter Finals': '\u56db\u5206\u4e4b\u4e00\u51b3\u8d5b',
    'Semi Finals': '\u534a\u51b3\u8d5b',
    'Bronze Match': '\u5b63\u519b\u8d5b',
    'Finals': '\u51b3\u8d5b',
    'Round of 16': '\u5341\u516d\u5f3a\u8d5b',
    'Round of 32': '\u4e09\u5341\u4e8c\u5f3a\u8d5b',
  })[phase] || phase || '\u6dd8\u6c70\u8d5b';
}

function inferTop8ResultPhase(info, matches) {
  if (info?.phase && info.phase !== 'top8') return info.phase;
  const match = (matches || []).find(m =>
    m.done &&
    m.winner === info?.winner &&
    m.p1 === info?.p1 &&
    m.p2 === info?.p2 &&
    (m.p1Wins || 0) === (info?.p1Wins || 0) &&
    (m.p2Wins || 0) === (info?.p2Wins || 0)
  );
  return match?.phase || info?.phase || '';
}

function renderTop8ResultScore(info) {
  const p1Wins = info.p1Wins || 0;
  const p2Wins = info.p2Wins || 0;
  return `
    <span class="score-name">${info.p1 || '-'}</span>
    <span class="score-value">${p1Wins}</span>
    <span class="score-dash">-</span>
    <span class="score-value">${p2Wins}</span>
    <span class="score-name right">${info.p2 || '-'}</span>
  `;
}

function renderMarqueeText(value) {
  return `<span class="pts-marquee-text"><span>${escapeHtml(value || '-')}</span></span>`;
}

function markOverflowingText(root = document) {
  root.querySelectorAll('.pts-marquee-text').forEach(el => {
    const inner = el.firstElementChild;
    const innerWidth = inner
      ? Math.max(inner.scrollWidth, Math.ceil(inner.getBoundingClientRect().width))
      : 0;
    const overflow = Math.max(0, innerWidth - el.clientWidth);
    const travel = overflow ? overflow + 12 : 0;
    el.style.setProperty('--marquee-travel', `${travel}px`);
    el.classList.toggle('is-overflowing', overflow > 6);
  });
}

function renderOverviewRecordChips(record) {
  if (!record) return '';
  return [
    ['w', 'W', record.w],
    ['d', 'D', record.d],
    ['l', 'L', record.l],
  ].map(([cls, label, value]) => (
    `<span class="record-chip ${cls}"><span class="label">${label}</span><span class="value">${value}</span></span>`
  )).join('');
}

function renderQrInto(containerId, text) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!text) return;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  container.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  const svg = container.querySelector('svg');
  if (svg) {
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
  }
}

function recCmp(a, b, matches) {
  if (a === 'BYE') return 1;
  if (b === 'BYE') return -1;
  const ra = getRecord(a, matches), rb = getRecord(b, matches);
  if (rb.pts !== ra.pts) return rb.pts - ra.pts;
  const aB = matches.filter(m => m.done && !m.draw && m.winner === a && m.p1 !== 'BYE' && m.p2 !== 'BYE' && m.p1 !== 'DROPPED' && m.p2 !== 'DROPPED' &&
    ((m.p1===a&&m.p2===b)||(m.p2===a&&m.p1===b))).length;
  const bB = matches.filter(m => m.done && !m.draw && m.winner === b && m.p1 !== 'BYE' && m.p2 !== 'BYE' && m.p1 !== 'DROPPED' && m.p2 !== 'DROPPED' &&
    ((m.p1===b&&m.p2===a)||(m.p2===b&&m.p1===a))).length;
  return bB - aB;
}

// ── 渲染入口 ─────────────────────────────────────────────

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}
