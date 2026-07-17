function ensureAdminToast() {
  let el = document.getElementById('adminToast');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'adminToast';
  el.className = 'admin-toast';
  document.body.appendChild(el);
  return el;
}

function toast(message, type = '') {
  const el = ensureAdminToast();
  el.textContent = message || '';
  el.className = `admin-toast show ${type}`.trim();
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    el.classList.remove('show');
  }, 1800);
}

function confirmAction(message, options = {}) {
  const t = window.PTSI18n?.t || (value => value);
  const title = options.title || '确认操作';
  const okText = options.okText || '确认';
  const cancelText = options.cancelText || '取消';
  const tone = options.tone || 'danger';
  const old = document.getElementById('adminConfirmOverlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'adminConfirmOverlay';
  overlay.className = 'admin-confirm-overlay';
  overlay.innerHTML = `
    <div class="admin-confirm-box" role="dialog" aria-modal="true" aria-labelledby="adminConfirmTitle">
      <h2 id="adminConfirmTitle"></h2>
      <p id="adminConfirmMessage"></p>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-confirm-cancel></button>
        <button class="btn ${tone === 'danger' ? 'btn-red' : 'btn-primary'}" type="button" data-confirm-ok></button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#adminConfirmTitle').textContent = t(title);
  overlay.querySelector('#adminConfirmMessage').textContent = t(message || '');
  overlay.querySelector('[data-confirm-cancel]').textContent = t(cancelText);
  overlay.querySelector('[data-confirm-ok]').textContent = t(okText);

  return new Promise(resolve => {
    const cleanup = value => {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
      resolve(value);
    };
    const onKeydown = evt => {
      if (evt.key === 'Escape') cleanup(false);
      if (evt.key === 'Enter') cleanup(true);
    };
    overlay.addEventListener('click', evt => {
      if (evt.target === overlay) cleanup(false);
    });
    overlay.querySelector('[data-confirm-cancel]').addEventListener('click', () => cleanup(false));
    overlay.querySelector('[data-confirm-ok]').addEventListener('click', () => cleanup(true));
    document.addEventListener('keydown', onKeydown);
    overlay.querySelector('[data-confirm-cancel]').focus();
  });
}

async function addPlayer() {

  const name = document.getElementById('playerInput').value.trim();
  if (!name) return;
  const entrantType = currentState?.tournamentSettings?.entrantType === 'team' ? 'team' : 'player';
  const createMissingProfiles = entrantType !== 'team'
    && document.getElementById('singleCreateProfile')?.checked === true;
  const res = entrantType === 'team'
    ? await api(tournamentApi('/entrants'), { action: 'create', entrantType: 'team', teamName: name, teamRoster: [] })
    : await api(tournamentApi('/entrants'), { action: 'create', displayName: name, createMissingProfiles });
  if (res.profileAction?.action === 'created') toast('已新增长期档案');
  if (res.state) render(res.state);
  document.getElementById('playerInput').value = '';
  document.getElementById('playerInput').focus();
}
async function dropPlayer(name) {
  const confirmed = await confirmAction('确认将「' + name + '」标记为退赛？', {
    title: '标记退赛',
    okText: '确认退赛',
  });
  if (!confirmed) return;
  const res = await api(tournamentApi('/drop-player'), { name });
  if (res.state) render(res.state);
}
async function removePlayer(name) { const res = await api(tournamentApi('/players'), { action: 'remove', name }); if (res.state) render(res.state); }
async function bulkAdd() {
  const entrantType = currentState?.tournamentSettings?.entrantType === 'team' ? 'team' : 'player';
  const createMissingProfiles = entrantType !== 'team'
    && document.getElementById('bulkCreateProfiles')?.checked === true;
  const names = document.getElementById('bulkText').value.split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  if (names.length > 0) {
    const entrants = names.map(name => entrantType === 'team'
      ? { entrantType: 'team', teamName: name, teamRoster: [] }
      : { entrantType: 'player', displayName: name });
    const res = await api(tournamentApi('/entrants'), {
      action: 'bulk-create',
      entrantType,
      entrants,
      createMissingProfiles,
    });
    const createdCount = Array.isArray(res.profileActions)
      ? res.profileActions.filter(item => item.action === 'created').length
      : 0;
    if (createdCount > 0) toast(`已导入 ${names.length} 人，新增 ${createdCount} 个长期档案`);
  }
  closeBulkAdd();
  // 批量添加后获取最新状态刷新
  const s = await apiGet('/state');
  if (s) render(s);
}
function showBulkAdd() {
  const isTeam = currentState?.tournamentSettings?.entrantType === 'team';
  document.getElementById('bulkProfileToggle')?.classList.toggle('hidden', isTeam);
  document.getElementById('bulkModal').classList.add('open');
}
function closeBulkAdd() {
  document.getElementById('bulkModal').classList.remove('open');
  document.getElementById('bulkText').value = '';
  const profileToggle = document.getElementById('bulkCreateProfiles');
  if (profileToggle) profileToggle.checked = false;
}

// ── 赛程 ─────────────────────────────────────────────────

Object.assign(window.PTSAdmin, { toast, confirmAction, addPlayer, dropPlayer, removePlayer, bulkAdd, showBulkAdd, closeBulkAdd });
