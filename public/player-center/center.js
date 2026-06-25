(function () {
  const profileKey = 'pts_player_center_profile_id';
  const params = new URLSearchParams(location.search);
  const launchedProfileId = (params.get('profileId') || '').trim();
  if (launchedProfileId) localStorage.setItem(profileKey, launchedProfileId);
  const state = {
    profiles: [],
    tournaments: [],
    activeProfileId: launchedProfileId || localStorage.getItem(profileKey) || '',
    activeSummary: null,
    pendingLogin: null,
    pendingTournament: null,
  };

  function qs(id) {
    return document.getElementById(id);
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

  async function api(path, data = null, method = 'POST') {
    const init = data
      ? {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      : {};
    const res = await fetch(path, init);
    return res.json();
  }

  function showToast(message) {
    const el = qs('toast');
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  function phaseText(phase) {
    return {
      setup: '报名阶段',
      swiss: '瑞士轮',
      'swiss-ended': '瑞士轮已结束',
      groups: '小组赛',
      'groups-ended': '小组赛已结束',
      top8: '淘汰赛',
      double_elimination: '双败淘汰',
      'double_elimination-ended': '双败淘汰已结束',
      done: '已结束',
    }[phase] || phase || '-';
  }

  function formatDate(value) {
    const date = Number(value || 0);
    if (!date) return '';
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  }

  function isFinished(phase) {
    return phase === 'done' || phase === 'groups-ended' || phase === 'double_elimination-ended';
  }

  function tournamentIdOf(item) {
    return String(item?.tournamentId || item?.id || '').trim();
  }

  function tournamentById(tournamentId) {
    const targetId = String(tournamentId || '').trim();
    if (!targetId) return null;
    return state.tournaments.find(item => tournamentIdOf(item) === targetId) || null;
  }

  function effectiveTournamentPhase(item) {
    const tournament = tournamentById(tournamentIdOf(item));
    return tournament?.phase || item?.phase || 'setup';
  }

  function isTournamentItemFinished(item) {
    return isFinished(effectiveTournamentPhase(item));
  }

  function getActiveProfile() {
    return state.profiles.find(profile => profile.id === state.activeProfileId) || null;
  }

  function findProfileByName(name) {
    const target = String(name || '').trim();
    if (!target) return null;
    return state.profiles.find(profile =>
      profile.displayName === target || (Array.isArray(profile.aliases) && profile.aliases.includes(target))
    ) || null;
  }

  function hideProfileConfirm() {
    state.pendingLogin = null;
    qs('profileConfirmBox').classList.add('hidden');
  }

  function hideTournamentConfirm() {
    state.pendingTournament = null;
    qs('tournamentConfirmBox').classList.add('hidden');
  }

  function showProfileConfirm(pending) {
    state.pendingLogin = pending;
    const exists = pending.mode === 'login';
    qs('profileConfirmTitle').textContent = exists ? '确认登录档案' : '确认注册档案';
    qs('profileConfirmMessage').textContent = exists
      ? `后台已有「${pending.profile.displayName || pending.name}」的选手档案。确认这是你本人后进入选手中心。`
      : `后台还没有「${pending.name}」的选手档案。确认后会注册新的长期选手档案。`;
    qs('profileConfirmOkBtn').textContent = exists ? '确认登录' : '确认注册';
    qs('profileConfirmBox').classList.remove('hidden');
  }

  function renderTournamentList(targetId, items, options = {}) {
    const list = qs(targetId);
    if (!items.length) {
      list.innerHTML = `<div class="empty-state">${escHtml(options.emptyText || '暂无记录')}</div>`;
      return;
    }
    list.innerHTML = items.map(item => {
      const phase = effectiveTournamentPhase(item);
      const meta = options.history
        ? `${item.leagueName || '未计入联赛'}${item.pointsProfileName ? ` · ${item.pointsProfileName}` : ''}${item.rank ? ` · 第 ${item.rank} 名` : ''}`
        : `${formatDate(item.date)}${item.date ? ' · ' : ''}${phaseText(phase)}`;
      const tournamentId = tournamentIdOf(item);
      const exportPlayerName = item.entrantName || state.activeSummary?.profile?.displayName || getActiveProfile()?.displayName || '';
      const actionLabel = options.action === 'register' ? '报名' : '返回';
      const actionAttr = options.action === 'register' ? 'data-register-tournament' : 'data-return-tournament';
      const right = options.action
        ? `<button class="join-action ${options.action === 'register' ? 'register-action' : ''}" type="button" ${actionAttr}="${escHtml(tournamentId)}">${actionLabel}</button>`
        : (options.history && isTournamentItemFinished(item) && tournamentId
          ? `<button class="join-action export-action" type="button" data-export-tournament="${escHtml(tournamentId)}" data-export-player="${escHtml(exportPlayerName)}">导出战报</button>`
          : `<span class="${phase === 'done' ? 'phase-tag done' : 'points-tag'}">${options.history ? `${Number(item.points || 0)} pt` : phaseText(phase)}</span>`);
      return `
        <div class="tournament-row">
          <div class="tournament-main">
            <div class="tournament-name">${escHtml(item.name || item.tournamentName || item.tournamentId || item.id)}</div>
            <div class="tournament-meta">${escHtml(meta)}</div>
          </div>
          <div class="tournament-actions">${right}</div>
        </div>
      `;
    }).join('');
  }

  async function loadSummary(profileId) {
    if (!profileId) return null;
    const res = await fetch(`/api/player-profiles/${encodeURIComponent(profileId)}/summary`).then(r => r.json());
    return res.ok ? res.summary : null;
  }

  async function refreshData() {
    const [profilesRes, tournamentsRes] = await Promise.all([
      fetch('/api/player-profiles').then(r => r.json()),
      fetch('/api/tournaments').then(r => r.json()),
    ]);
    state.profiles = Array.isArray(profilesRes.players) ? profilesRes.players : [];
    state.tournaments = Array.isArray(tournamentsRes) ? tournamentsRes : [];
    if (state.activeProfileId) {
      try {
        state.activeSummary = await loadSummary(state.activeProfileId);
      } catch (err) {
        state.activeSummary = null;
      }
      if (!state.activeSummary) {
        localStorage.removeItem(profileKey);
        state.activeProfileId = '';
      }
    }
    render();
  }

  function render() {
    const profile = getActiveProfile() || state.activeSummary?.profile || null;
    const signedIn = !!profile && !!state.activeProfileId;
    qs('signedOutView').classList.toggle('hidden', signedIn);
    qs('signedInView').classList.toggle('hidden', !signedIn);
    qs('profileContentGrid').classList.toggle('hidden', !signedIn);
    if (signedIn) hideProfileConfirm();

    if (!signedIn) {
      return;
    }

    const summary = state.activeSummary || {};
    const tournaments = Array.isArray(summary.tournaments) ? summary.tournaments : [];
    const registeredTournamentIds = new Set(tournaments.map(tournamentIdOf).filter(Boolean));
    qs('activeProfileName').textContent = profile.displayName || '-';
    qs('totalPoints').textContent = Number(summary.totalPoints || 0);
    qs('rankedEvents').textContent = Number(summary.rankedEvents || 0);
    qs('historyCount').textContent = tournaments.length;
    renderTournamentList(
      'currentTournamentList',
      tournaments.filter(item => !isTournamentItemFinished(item)),
      { action: 'return', emptyText: '当前没有正在参加的比赛。' },
    );
    renderTournamentList(
      'historyTournamentList',
      tournaments.slice(0, 8),
      { history: true, emptyText: '暂无过往比赛记录。' },
    );

    const openTournaments = state.tournaments
      .filter(item => item.phase === 'setup' && !registeredTournamentIds.has(tournamentIdOf(item)))
      .slice(0, 8);
    renderTournamentList('openTournamentList', openTournaments, {
      action: 'register',
      emptyText: '当前没有可报名的新比赛。',
    });
    hideTournamentConfirm();
  }

  function setActiveProfile(profileId) {
    state.activeProfileId = profileId || '';
    if (state.activeProfileId) localStorage.setItem(profileKey, state.activeProfileId);
    else localStorage.removeItem(profileKey);
    refreshData().catch(() => showToast('刷新选手中心失败。'));
  }

  function prepareProfileLogin() {
    const name = qs('profileNameInput').value.trim();
    if (!name) {
      showToast('请输入选手名称。');
      return;
    }
    const existing = findProfileByName(name);
    if (existing) {
      showProfileConfirm({ mode: 'login', name, profile: existing });
      return;
    }
    showProfileConfirm({ mode: 'register', name });
  }

  async function confirmProfileLogin() {
    const pending = state.pendingLogin;
    if (!pending) return;
    if (pending.mode === 'login' && pending.profile?.id) {
      setActiveProfile(pending.profile.id);
      hideProfileConfirm();
      return;
    }
    const name = String(pending.name || '').trim();
    if (!name) {
      hideProfileConfirm();
      showToast('请输入选手名称。');
      return;
    }
    const res = await api('/api/player-profiles', { action: 'create', displayName: name });
    if (!res.ok || !res.player?.id) {
      showToast(res.err || '登记档案失败。');
      return;
    }
    setActiveProfile(res.player.id);
    hideProfileConfirm();
  }

  function getTournamentName(tournamentId) {
    const targetId = String(tournamentId || '').trim();
    const tournament = state.tournaments.find(item => tournamentIdOf(item) === targetId)
      || (state.activeSummary?.tournaments || []).find(item => tournamentIdOf(item) === targetId)
      || null;
    return tournament?.name || tournament?.tournamentName || targetId || '这场比赛';
  }

  function buildTournamentEntryUrl(tournamentId, profile) {
    const url = new URL(`/t/${encodeURIComponent(tournamentId)}/player-login`, location.origin);
    url.searchParams.set('profileId', profile.id);
    url.searchParams.set('name', profile.displayName || '');
    return url;
  }

  function buildPlayerReportUrl(tournamentId, playerName) {
    return `/api/tournaments/${encodeURIComponent(tournamentId)}/export-player-report?playerName=${encodeURIComponent(playerName || '')}`;
  }

  function enterTournament(tournamentId) {
    const profile = getActiveProfile() || state.activeSummary?.profile || null;
    if (!profile) {
      showToast('请先选择或登记选手档案。');
      return;
    }
    location.href = buildTournamentEntryUrl(tournamentId, profile).toString();
  }

  function exportPlayerReport(tournamentId, playerName) {
    const targetId = String(tournamentId || '').trim();
    const targetName = String(playerName || '').trim();
    if (!targetId || !targetName) {
      showToast('缺少战报导出信息。');
      return;
    }
    window.open(buildPlayerReportUrl(targetId, targetName), '_blank');
  }

  function showTournamentConfirm(tournamentId) {
    const profile = getActiveProfile() || state.activeSummary?.profile || null;
    if (!profile) {
      showToast('请先选择或登记选手档案。');
      return;
    }
    const tournamentName = getTournamentName(tournamentId);
    state.pendingTournament = { tournamentId, profile };
    qs('tournamentConfirmTitle').textContent = '确认报名';
    qs('tournamentConfirmMessage').textContent = `将以「${profile.displayName || '当前档案'}」报名「${tournamentName}」。确认后会进入该比赛的选手页。`;
    qs('tournamentConfirmOkBtn').textContent = '确认报名';
    qs('tournamentConfirmBox').classList.remove('hidden');
    qs('tournamentConfirmCancelBtn').focus();
  }

  async function confirmTournamentRegistration() {
    const pending = state.pendingTournament;
    if (!pending?.tournamentId || !pending.profile?.id) return;
    const displayName = String(pending.profile.displayName || '').trim();
    if (!displayName) {
      showToast('当前档案缺少选手名称。');
      return;
    }
    const res = await api(`/api/tournaments/${encodeURIComponent(pending.tournamentId)}/player-login`, {
      playerName: displayName,
      profileId: pending.profile.id,
    });
    if (!res.ok) {
      showToast(res.message || res.err || '报名失败。');
      return;
    }
    hideTournamentConfirm();
    location.href = buildTournamentEntryUrl(pending.tournamentId, pending.profile).toString();
  }

  document.addEventListener('click', evt => {
    const returnBtn = evt.target.closest('[data-return-tournament]');
    if (returnBtn) {
      enterTournament(returnBtn.dataset.returnTournament);
      return;
    }
    const exportBtn = evt.target.closest('[data-export-tournament]');
    if (exportBtn) {
      exportPlayerReport(exportBtn.dataset.exportTournament, exportBtn.dataset.exportPlayer);
      return;
    }
    const registerBtn = evt.target.closest('[data-register-tournament]');
    if (registerBtn) {
      showTournamentConfirm(registerBtn.dataset.registerTournament);
    }
  });

  qs('createProfileBtn').addEventListener('click', () => {
    prepareProfileLogin();
  });
  qs('profileNameInput').addEventListener('keydown', evt => {
    if (evt.key === 'Enter') prepareProfileLogin();
  });
  qs('profileConfirmCancelBtn').addEventListener('click', hideProfileConfirm);
  qs('profileConfirmOkBtn').addEventListener('click', () => {
    confirmProfileLogin().catch(() => showToast('进入选手中心失败。'));
  });
  qs('tournamentConfirmCancelBtn').addEventListener('click', hideTournamentConfirm);
  qs('tournamentConfirmBox').addEventListener('click', evt => {
    if (evt.target === qs('tournamentConfirmBox')) hideTournamentConfirm();
  });
  qs('tournamentConfirmOkBtn').addEventListener('click', () => {
    confirmTournamentRegistration().catch(() => showToast('报名失败。'));
  });
  qs('changeProfileBtn').addEventListener('click', () => {
    setActiveProfile('');
    hideProfileConfirm();
    hideTournamentConfirm();
    qs('profileNameInput').focus();
  });

  refreshData().catch(() => showToast('加载选手中心失败。'));
})();
