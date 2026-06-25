'use strict';
window.PTSHome = window.PTSHome || {};

function getTournamentById(id) {
  return appState.tournaments.find(item => item.id === id) || null;
}

function leagueTournamentName(id) {
  const tournament = getTournamentById(id);
  return tournament ? (tournament.name || tournament.id) : id;
}

function getPointsProfileById(id) {
  return appState.pointsProfiles.find(item => item.id === id) || null;
}

function defaultPointsProfileId() {
  return appState.pointsProfiles[0]?.id || '';
}

function leagueBindings(league) {
  const byTournamentId = new Map();
  const fallbackProfileId = league.pointsProfileId || defaultPointsProfileId();
  for (const binding of Array.isArray(league.tournamentBindings) ? league.tournamentBindings : []) {
    if (!binding || !binding.tournamentId) continue;
    byTournamentId.set(binding.tournamentId, {
      tournamentId: binding.tournamentId,
      pointsProfileId: binding.pointsProfileId || fallbackProfileId,
      includedAt: binding.includedAt || null,
    });
  }
  for (const id of Array.isArray(league.includedTournamentIds) ? league.includedTournamentIds : []) {
    if (!id || byTournamentId.has(id)) continue;
    byTournamentId.set(id, { tournamentId: id, pointsProfileId: fallbackProfileId, includedAt: null });
  }
  return [...byTournamentId.values()];
}

function pointsProfileLabel(id) {
  const profile = getPointsProfileById(id);
  return profile ? pointsProfileName(profile) : (id ? '未找到的积分规则' : '未选择积分规则');
}

function pointsProfileOptions(selectedId) {
  if (appState.pointsProfiles.length === 0) {
    return '<option value="">暂无积分规则</option>';
  }
  return appState.pointsProfiles.map(profile => `
    <option value="${escAttr(profile.id)}"${profile.id === selectedId ? ' selected' : ''}>${escHtml(pointsProfileName(profile))}</option>
  `).join('');
}

let leagueRuleTarget = null;

function renderLeagueTournamentList(league) {
  const bindings = leagueBindings(league);
  if (bindings.length === 0) return '<div class="empty compact">暂无包含比赛</div>';
  return `<div class="mini-list">${bindings.map(binding => {
    const tournament = getTournamentById(binding.tournamentId);
    return `
      <div class="mini-row league-binding-row">
        <div>
          <div class="mini-title">${escHtml(leagueTournamentName(binding.tournamentId))}</div>
          <div class="mini-meta">${escHtml(tournament ? phaseLabel(tournament.phase) : '比赛不存在或已删除')} · 当前规则：${escHtml(pointsProfileLabel(binding.pointsProfileId))}</div>
        </div>
        <div class="league-binding-actions">
          <button class="btn btn-secondary" type="button" data-action="editLeagueTournamentPoints" data-league-id="${escAttr(league.id)}" data-tournament-id="${escAttr(binding.tournamentId)}">修改规则</button>
          <button class="btn btn-danger" type="button" data-action="removeLeagueTournament" data-league-id="${escAttr(league.id)}" data-tournament-id="${escAttr(binding.tournamentId)}">移除</button>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function renderLeagueAvailableTournamentList(league) {
  const included = new Set(leagueBindings(league).map(binding => binding.tournamentId));
  const available = sortByDate(appState.tournaments).filter(tournament => !included.has(tournament.id));
  if (available.length === 0) return '<div class="empty compact">暂无可添加比赛</div>';
  const tournamentSelectId = `league-add-tournament-${escAttr(league.id)}`;
  const pointsSelectId = `league-add-points-${escAttr(league.id)}`;
  return `<div class="league-add-control">
    <label class="label" for="${tournamentSelectId}">选择要加入的比赛</label>
    <select id="${tournamentSelectId}" class="select league-add-select">
      ${available.map(tournament => `
        <option value="${escAttr(tournament.id)}">${escHtml(tournament.name || tournament.id)} · ${escHtml(phaseLabel(tournament.phase))} · ${escHtml(formatDate(tournament.date))}</option>
      `).join('')}
    </select>
    <label class="label" for="${pointsSelectId}">本联赛内使用的积分规则</label>
    <select id="${pointsSelectId}" class="select league-add-select">
      ${pointsProfileOptions(league.pointsProfileId || defaultPointsProfileId())}
    </select>
    <button class="btn btn-secondary" type="button" data-action="includeLeagueTournamentFromSelect" data-league-id="${escAttr(league.id)}" data-select-id="${tournamentSelectId}" data-points-select-id="${pointsSelectId}">加入比赛</button>
  </div>`;
}

function renderLeagues() {
  if (appState.leagues.length === 0) {
    els.leagueList.innerHTML = '<div class="summary-note">暂无联赛。需要长期积分榜时再创建。</div>';
    els.leagueManagerList.innerHTML = '<div class="empty">暂无联赛</div>';
    return;
  }
  const latest = sortByUpdated(appState.leagues)[0];
  els.leagueList.innerHTML = `
    <div class="summary-note">最近更新：${escHtml(latest.name || '未命名联赛')} · ${escHtml(formatDate(latest.updatedAt || latest.createdAt))}</div>
  `;
  els.leagueManagerList.innerHTML = sortByUpdated(appState.leagues).map(league => `
    <article class="data-item">
      <div class="data-top">
        <div>
          <div class="data-name">${escHtml(league.name || '未命名联赛')}</div>
          <div class="item-meta">
            <span>${Array.isArray(league.includedTournamentIds) ? league.includedTournamentIds.length : 0} 场比赛</span>
            <span>最佳计分场次 ${escHtml(league.bestFinishLimit || '不限')}</span>
          </div>
        </div>
        <span class="tag">League</span>
      </div>
      <div class="data-actions">
        <button class="btn btn-secondary" type="button" data-action="detailLeague" data-id="${escAttr(league.id)}">查看</button>
        <button class="btn btn-danger" type="button" data-action="deleteLeague" data-id="${escAttr(league.id)}" data-name="${escAttr(league.name || league.id)}">删除</button>
      </div>
    </article>
  `).join('');
}

async function createLeague() {
  const name = form.leagueNameInput.value.trim();
  const bestFinishLimitRaw = form.leagueBestFinishLimitInput.value.trim();
  if (!name) {
    showToast('请输入联赛名称');
    form.leagueNameInput.focus();
    return;
  }
  const bestFinishLimit = bestFinishLimitRaw ? Number(bestFinishLimitRaw) : null;
  if (bestFinishLimitRaw && (!Number.isInteger(bestFinishLimit) || bestFinishLimit <= 0)) {
    showToast('最佳计分场次必须是正整数');
    form.leagueBestFinishLimitInput.focus();
    return;
  }
  try {
    await api('/api/leagues', {
      action: 'create',
      name,
      bestFinishLimit,
      includedTournamentIds: [],
      divisions: ['open'],
    });
    form.leagueNameInput.value = '';
    form.leagueBestFinishLimitInput.value = '';
    closeAllModals();
    await loadAll();
    showToast('联赛已创建');
  } catch (err) {
    showToast(err.message || '创建联赛失败');
  }
}

function deleteLeague(id, name) {
  deletingLeagueId = id || '';
  deletingLeagueName = name || id || '';
  els.deleteLeagueName.textContent = `「${deletingLeagueName}」`;
  openModal(els.deleteLeagueModal);
}

async function submitDeleteLeague() {
  if (!deletingLeagueId) return;
  try {
    await apiMethod(`/api/leagues/${encodeURIComponent(deletingLeagueId)}`, 'DELETE');
    deletingLeagueId = '';
    deletingLeagueName = '';
    closeAllModals();
    await loadAll();
    showToast('联赛已删除');
  } catch (err) {
    showToast(err.message || '删除联赛失败');
  }
}

async function includeLeagueTournament(leagueId, tournamentId, selectedPointsProfileId = null) {
  const league = appState.leagues.find(item => item.id === leagueId);
  const pointsProfileId = selectedPointsProfileId || league?.pointsProfileId || defaultPointsProfileId();
  if (!pointsProfileId) {
    showToast('请先创建积分规则');
    return;
  }
  try {
    await api(`/api/leagues/${encodeURIComponent(leagueId)}/include-tournament`, { tournamentId, pointsProfileId });
    await loadAll();
    await openLeagueDetail(leagueId);
    showToast('比赛已加入联赛');
  } catch (err) {
    showToast(err.message || '加入比赛失败');
  }
}

function includeLeagueTournamentFromSelect(leagueId, selectId, pointsSelectId) {
  const tournamentId = document.getElementById(selectId)?.value || '';
  const pointsProfileId = document.getElementById(pointsSelectId)?.value || '';
  if (!tournamentId) {
    showToast('请选择比赛');
    return;
  }
  includeLeagueTournament(leagueId, tournamentId, pointsProfileId);
}

async function removeLeagueTournament(leagueId, tournamentId) {
  try {
    await api(`/api/leagues/${encodeURIComponent(leagueId)}/remove-tournament`, { tournamentId });
    await loadAll();
    await openLeagueDetail(leagueId);
    showToast('比赛已从联赛移除');
  } catch (err) {
    showToast(err.message || '移除比赛失败');
  }
}

function openLeagueRuleModal(leagueId, tournamentId) {
  const league = appState.leagues.find(item => item.id === leagueId);
  const binding = league ? leagueBindings(league).find(item => item.tournamentId === tournamentId) : null;
  const selectedId = binding?.pointsProfileId || league?.pointsProfileId || defaultPointsProfileId();
  leagueRuleTarget = { leagueId, tournamentId };
  els.leagueRuleTargetName.textContent = `${league ? (league.name || league.id) : '联赛'} / ${leagueTournamentName(tournamentId)}`;
  els.leagueRuleSelect.innerHTML = pointsProfileOptions(selectedId);
  openStackModal(els.leagueRuleModal);
}

function closeLeagueRuleModal() {
  leagueRuleTarget = null;
  closeStackModal(els.leagueRuleModal);
}

async function submitLeagueRule() {
  if (!leagueRuleTarget) return;
  await updateLeagueTournamentPoints(leagueRuleTarget.leagueId, leagueRuleTarget.tournamentId, els.leagueRuleSelect.value);
}

async function updateLeagueTournamentPoints(leagueId, tournamentId, selectedProfileId) {
  const pointsProfileId = selectedProfileId || defaultPointsProfileId();
  if (!pointsProfileId) {
    showToast('请先创建积分规则');
    return;
  }
  try {
    await api(`/api/leagues/${encodeURIComponent(leagueId)}/include-tournament`, { tournamentId, pointsProfileId });
    closeLeagueRuleModal();
    await loadAll();
    await openLeagueDetail(leagueId);
    showToast('计分规则已保存');
  } catch (err) {
    showToast(err.message || '保存计分规则失败');
  }
}

async function openLeagueDetail(id) {
  const league = appState.leagues.find(item => item.id === id);
  if (!league) return;
  const bindings = leagueBindings(league);
  els.detailTitle.textContent = league.name || '联赛';
  els.detailBody.innerHTML = detailRows([
    ['包含比赛', escHtml(bindings.length)],
    ['最佳计分场次', escHtml(league.bestFinishLimit || '不限')],
  ]) + '<div class="detail-block">排行榜读取中</div>';
  openModal(els.detailModal);
  const leaderboardRes = await fetch(`/api/leagues/${encodeURIComponent(id)}/leaderboard`).then(r => r.json()).catch(() => null);
  const leaderboard = leaderboardRes && Array.isArray(leaderboardRes.leaderboard) ? leaderboardRes.leaderboard : [];
  const leaderboardRows = leaderboard.length === 0
    ? '<div class="empty compact">暂无可计分选手：只有已完赛比赛中绑定了选手档案的参赛者会进入排行榜，游客参赛不会计入积分。</div>'
    : `<div class="mini-list">${leaderboard.slice(0, 12).map(entry => `
      <div class="mini-row">
        <div>
          <div class="mini-title">#${escHtml(entry.rank)} ${escHtml(entry.displayName)}</div>
          <div class="mini-meta">${Number(entry.points || 0)} pt</div>
        </div>
      </div>
    `).join('')}</div>`;
  els.detailBody.innerHTML = `
    ${detailRows([
      ['包含比赛', escHtml(bindings.length)],
      ['最佳计分场次', escHtml(league.bestFinishLimit || '不限')],
    ])}
    <div class="detail-block">
      <div class="detail-section-title">联赛包含的比赛</div>
      ${renderLeagueTournamentList(league)}
    </div>
    <div class="detail-block">
      <div class="detail-section-title">可加入比赛</div>
      ${renderLeagueAvailableTournamentList(league)}
    </div>
    <div class="detail-block">
      <div class="detail-section-title">排行榜</div>
      ${leaderboardRows}
    </div>
  `;
}

Object.assign(window.PTSHome, {
  renderLeagues,
  createLeague,
  deleteLeague,
  submitDeleteLeague,
  includeLeagueTournament,
  includeLeagueTournamentFromSelect,
  openLeagueRuleModal,
  closeLeagueRuleModal,
  submitLeagueRule,
  updateLeagueTournamentPoints,
  removeLeagueTournament,
  openLeagueDetail,
});
