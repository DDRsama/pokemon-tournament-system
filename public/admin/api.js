function tournamentApi(path) {

  return `/api/tournaments/${encodeURIComponent(currentTourId)}${path}`;
}

function stripBaseUrlProtocol(value) {
  return String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function buildPublicBaseUrlOverride(value) {
  const host = stripBaseUrlProtocol(value);
  return host ? `http://${host}` : '';
}

function publicBaseUrlHost(value) {
  const url = buildPublicBaseUrlOverride(value);
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch (err) {
    return null;
  }
}

function isBlockedPublicBaseUrl(value) {
  const host = publicBaseUrlHost(value);
  return host === 'localhost'
    || host === '127.0.0.1'
    || /^127\./.test(host || '')
    || host === '::1'
    || host === '0:0:0:0:0:0:0:1';
}

function setPublicBaseUrlMessage(text, type = '') {
  const el = document.getElementById('publicBaseUrlMessage');
  if (!el) return;
  el.textContent = text || '';
  el.className = `address-message ${type}`.trim();
}

function setLiveRoomCodeMessage(text, type = '') {
  const el = document.getElementById('liveRoomCodeMessage');
  if (!el) return;
  el.textContent = text || '';
  el.className = `live-room-message ${type}`.trim();
}

function cancelPublicBaseUrlEdit() {
  document.getElementById('publicBaseUrlInput').value = committedPublicBaseUrlInput;
  setPublicBaseUrlMessage('');
}

async function saveTournamentConfig(options = {}) {
  const publicBaseUrlOverride = Object.prototype.hasOwnProperty.call(options, 'publicBaseUrlOverride')
    ? options.publicBaseUrlOverride
    : buildPublicBaseUrlOverride(committedPublicBaseUrlInput);
  const liveRoomCode = Object.prototype.hasOwnProperty.call(options, 'liveRoomCode')
    ? options.liveRoomCode
    : (document.getElementById('liveRoomCodeInput')?.value || '').trim();
  const res = await api(tournamentApi('/config'), { publicBaseUrlOverride, liveRoomCode });
  if (res.state) renderOrQueue(res.state);
  return res;
}

async function saveLiveRoomCode() {
  const input = document.getElementById('liveRoomCodeInput');
  const btn = document.getElementById('liveRoomCodeSaveBtn');
  if (!input || !btn) return;
  btn.disabled = true;
  setLiveRoomCodeMessage('正在保存...', '');
  try {
    await saveTournamentConfig({ liveRoomCode: input.value.trim() });
    setLiveRoomCodeMessage(input.value.trim() ? '直播桌房号已保存' : '直播桌房号已清空', 'success');
  } catch (err) {
    setLiveRoomCodeMessage(err.message || '保存失败', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function confirmPublicBaseUrl() {
  const input = document.getElementById('publicBaseUrlInput');
  const btn = document.getElementById('publicBaseUrlConfirmBtn');
  const candidate = buildPublicBaseUrlOverride(input.value);
  if (!candidate) {
    btn.disabled = true;
    try {
      await saveTournamentConfig({ publicBaseUrlOverride: '' });
      committedPublicBaseUrlInput = '';
      input.value = '';
      setPublicBaseUrlMessage('已清空，将使用默认内网地址', 'success');
    } finally {
      btn.disabled = false;
    }
    return;
  }
  if (publicBaseUrlHost(input.value) === null) {
    setPublicBaseUrlMessage('地址格式不正确', 'error');
    input.focus();
    return;
  }
  if (isBlockedPublicBaseUrl(input.value)) {
    setPublicBaseUrlMessage('不能使用 localhost 或 127.0.0.1 这类自机地址', 'error');
    input.focus();
    return;
  }
  btn.disabled = true;
  btn.textContent = '检查';
  setPublicBaseUrlMessage('正在检查地址...', '');
  try {
    const checked = await api(tournamentApi('/validate-base-url'), { publicBaseUrlOverride: candidate });
    if (!checked.ok) {
      setPublicBaseUrlMessage(checked.err || '地址无法访问', 'error');
      input.focus();
      return;
    }
    await saveTournamentConfig({ publicBaseUrlOverride: checked.publicBaseUrlOverride || candidate });
    committedPublicBaseUrlInput = stripBaseUrlProtocol(checked.publicBaseUrlOverride || candidate);
    input.value = committedPublicBaseUrlInput;
    setPublicBaseUrlMessage('地址可访问，已保存', 'success');
  } finally {
    btn.disabled = false;
    btn.textContent = '确认';
  }
}

function isTournamentFinished(s) {
  if (!s) return false;
  if (s.phase === 'done') return true;
  if (s.phase === 'swiss-ended') {
    const stages = Array.isArray(s.stages) && s.stages.length > 0 ? s.stages : (s.tournamentSettings?.stages || []);
    const swissStage = stages.find(stage => stage.id === s.activeStageId && stage.type === 'swiss')
      || stages.find(stage => stage.type === 'swiss')
      || null;
    const hasRanking = Array.isArray(s.swissRanking) && s.swissRanking.length > 0;
    if (swissStage && hasRanking && !swissStage.advancement?.targetStageId) return true;
  }
  const matches = s.matches || [];
  const finalsDone = matches.some(m => m.phase === 'Finals' && m.done);
  const bronzeDone = matches.some(m => m.phase === 'Bronze Match' && m.done);
  return finalsDone && bronzeDone;
}

function renderQrInto(containerId, text) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!text) return;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  const svg = container.querySelector('svg');
  if (svg) {
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
  }
}

async function exportReport() {
  const btn = document.getElementById('btnExportReport');
  if (!currentState || !isTournamentFinished(currentState)) return;
  btn.disabled = true;
  try {
    window.open(tournamentApi('/export-report'), '_blank');
  } finally {
    if (currentState) {
      const canExport = isTournamentFinished(currentState);
      btn.disabled = !canExport;
    }
  }
}

// ── WebSocket ─────────────────────────────────────────────
let ws;
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = protocol + '//' + location.host + '/t/' + encodeURIComponent(currentTourId) + '/ws';
  ws = new WebSocket(wsUrl);
  ws.onopen = () => { document.getElementById('wsDot').classList.add('connected'); document.getElementById('wsText').textContent = '已连接'; };
  ws.onclose = () => { document.getElementById('wsDot').classList.remove('connected'); document.getElementById('wsText').textContent = '重连中…'; setTimeout(connect, 3000); };
  ws.onmessage = evt => {
    const d = JSON.parse(evt.data);
    if (!d.data) return;
    if (currentTourId && d.data.tournamentId && d.data.tournamentId !== currentTourId) return;
    renderOrQueue(d.data);
  };
}
connect();

// ── REST ─────────────────────────────────────────────────
function apiGet(path) { return fetch(tournamentApi(path)).then(r => r.json()).catch(() => null); }
async function copyText(text) {
  const value = (text || '').trim();
  if (!value || value === '—') return false;
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  ta.style.width = '1px';
  ta.style.height = '1px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, value.length);
  let copied = false;
  try {
    copied = !!document.execCommand('copy');
  } catch (err) {
    copied = false;
  } finally {
    ta.remove();
  }
  if (copied) return true;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (err) {
      return false;
    }
  }
  return false;
}

function showManualCopyDialog(value, options = {}) {
  const text = (value || '').trim();
  if (!text) return;
  const old = document.getElementById('adminCopyOverlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'adminCopyOverlay';
  overlay.className = 'admin-confirm-overlay';
  overlay.innerHTML = `
    <div class="admin-confirm-box admin-copy-box" role="dialog" aria-modal="true" aria-labelledby="adminCopyTitle">
      <h2 id="adminCopyTitle"></h2>
      <p id="adminCopyMessage"></p>
      <textarea class="admin-copy-textarea" id="adminCopyTextarea" readonly></textarea>
      <div class="admin-copy-hint">当前浏览器没有授予自动写入剪贴板权限，请复制上方链接。</div>
      <div class="modal-actions">
        <button class="btn btn-primary" type="button" data-copy-close>关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#adminCopyTitle').textContent = options.title || '复制链接';
  overlay.querySelector('#adminCopyMessage').textContent = options.message || '链接已放在下面的文本框中。';
  const textarea = overlay.querySelector('#adminCopyTextarea');
  textarea.value = text;
  const cleanup = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
  };
  const onKeydown = evt => {
    if (evt.key === 'Escape') cleanup();
  };
  overlay.addEventListener('click', evt => {
    if (evt.target === overlay) cleanup();
  });
  overlay.querySelector('[data-copy-close]').addEventListener('click', cleanup);
  document.addEventListener('keydown', onKeydown);
  const selectText = () => {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
  };
  selectText();
  window.requestAnimationFrame(selectText);
  window.setTimeout(selectText, 0);
}

async function copyOverlayUrl(btn) {
  const value = document.getElementById('overlayUrl').textContent;
  const copied = await copyText(value);
  if (!copied) {
    showManualCopyDialog(value, {
      title: '复制 OBS 链接',
      message: '自动复制被浏览器拦截，请从这里手动复制叠加层 URL。',
    });
  }
  if (!btn) return;
  btn.textContent = copied ? '已复制' : '手动复制';
  btn.classList.toggle('copied', copied);
  window.clearTimeout(copyOverlayUrl.timer);
  copyOverlayUrl.timer = window.setTimeout(() => {
    btn.textContent = '复制';
    btn.classList.remove('copied');
  }, 1200);
}
async function copyPlayerEntryUrl() {
  const isTeamEntry = currentState && typeof isTeamTournament === 'function' && isTeamTournament(currentState);
  const value = document.getElementById('playerEntryUrl').textContent;
  const copied = await copyText(value);
  if (!copied) {
    showManualCopyDialog(value, {
      title: isTeamEntry ? '复制参赛入口' : '复制选手入口',
      message: '自动复制被浏览器拦截，请从这里手动复制入口链接。',
    });
  }
  const tip = document.querySelector('.player-qr-tip');
  if (!tip) return;
  tip.textContent = copied
    ? (isTeamEntry ? '已复制参赛入口链接' : '已复制选手入口链接')
    : '已打开手动复制窗口';
  window.clearTimeout(copyPlayerEntryUrl.timer);
  copyPlayerEntryUrl.timer = window.setTimeout(() => {
    tip.textContent = isTeamEntry ? '扫码进入参赛页面' : '扫码进入选手个人页';
  }, 1200);
}
function api(path, data = {}) {
  return fetch(`${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()).catch(() => ({ ok: false }));
}
function apiMethod(path, method, data = null) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (data) init.body = JSON.stringify(data);
  return fetch(path, init).then(r => r.json()).catch(() => ({ ok: false }));
}
function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}
const escAttr = escHtml;

// ── 选手 ─────────────────────────────────────────────────

Object.assign(window.PTSAdmin, { tournamentApi, stripBaseUrlProtocol, buildPublicBaseUrlOverride, publicBaseUrlHost, isBlockedPublicBaseUrl, setPublicBaseUrlMessage, cancelPublicBaseUrlEdit, saveTournamentConfig, confirmPublicBaseUrl, isTournamentFinished, renderQrInto, exportReport, connect, apiGet, copyText, showManualCopyDialog, copyOverlayUrl, copyPlayerEntryUrl, api, apiMethod, escHtml, escAttr });
