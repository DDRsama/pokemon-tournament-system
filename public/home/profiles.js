'use strict';
window.PTSHome = window.PTSHome || {};

function profileDisplayName(profile) {
  return profile && (profile.displayName || profile.name) ? (profile.displayName || profile.name) : '未命名选手';
}

const profilePaging = {
  managerPage: 1,
  managerPageSize: 10,
};

function profileSearchText(profile) {
  return [
    profileDisplayName(profile),
    Array.isArray(profile.aliases) ? profile.aliases.join(' ') : '',
  ].join(' ').toLowerCase();
}

function getProfileQuery(input) {
  return String(input?.value || '').trim().toLowerCase();
}

function filterProfiles(query) {
  const sorted = sortByUpdated(appState.players);
  if (!query) return sorted;
  return sorted.filter(profile => profileSearchText(profile).includes(query));
}

function clampProfilePage(page, totalPages) {
  return Math.min(Math.max(Number(page) || 1, 1), Math.max(totalPages, 1));
}

function paginateProfiles(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = clampProfilePage(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    totalPages,
    currentPage,
    pageItems: items.slice(start, start + pageSize),
  };
}

function renderProfilePager(container, scope, page, totalPages, totalItems) {
  if (!container) return;
  container.classList.toggle('hidden', totalItems === 0 || totalPages <= 1);
  if (totalItems === 0 || totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <button class="btn btn-secondary" type="button" data-profile-page="${escAttr(scope)}" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>上一页</button>
    <span class="pager-status">${page} / ${totalPages}</span>
    <button class="btn btn-secondary" type="button" data-profile-page="${escAttr(scope)}" data-page="${Math.min(totalPages, page + 1)}" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
  `;
}

function profileSummary(player) {
  const aliases = Array.isArray(player.aliases) ? player.aliases.length : 0;
  const points = Number(player.totalPoints ?? player.stats?.leaguePoints ?? 0);
  const rankedEvents = Number(player.rankedEvents ?? player.stats?.rankedTournamentsPlayed ?? 0);
  return { aliases, points, rankedEvents, displayName: profileDisplayName(player) };
}

function renderProfileCard(player, options = {}) {
  const { compact = false } = options;
  const { aliases, points, rankedEvents, displayName } = profileSummary(player);
  return `
    <article class="data-item ${compact ? 'compact-profile' : ''}">
      <div class="data-top">
        <div>
          <div class="data-name">${escHtml(displayName)}</div>
          <div class="item-meta">
            <span>${aliases} 个别名</span>
            <span>${points} pt</span>
            <span>${rankedEvents} 条计分记录</span>
          </div>
        </div>
        <span class="tag">Profile</span>
      </div>
      <div class="data-actions">
        <button class="btn btn-secondary" type="button" data-action="detailProfile" data-id="${escAttr(player.id)}">查看</button>
        ${compact ? '' : `<button class="btn btn-secondary" type="button" data-action="editProfile" data-id="${escAttr(player.id)}">编辑</button>`}
        ${compact ? '' : `<button class="btn btn-danger" type="button" data-action="deleteProfile" data-id="${escAttr(player.id)}" data-name="${escAttr(displayName)}">删除</button>`}
      </div>
    </article>
  `;
}

function renderPlayers() {
  if (appState.players.length === 0) {
    els.profileList.innerHTML = '<div class="summary-note">暂无选手档案。选手注册后会在这里形成长期档案。</div>';
    els.profileManagerList.innerHTML = '<div class="empty">暂无选手档案</div>';
    if (els.profileManagerPager) els.profileManagerPager.innerHTML = '';
    return;
  }

  const latest = sortByUpdated(appState.players)[0];
  els.profileList.innerHTML = `
    <div class="summary-note">最近更新：${escHtml(profileDisplayName(latest))} · ${escHtml(formatDate(latest.updatedAt || latest.createdAt))}</div>
  `;

  const managerMatches = filterProfiles(getProfileQuery(els.profileManagerSearchInput));
  const managerPageSize = Number(els.profileManagerPageSizeSelect?.value || profilePaging.managerPageSize);
  profilePaging.managerPageSize = managerPageSize;
  const managerPage = paginateProfiles(managerMatches, profilePaging.managerPage, managerPageSize);
  profilePaging.managerPage = managerPage.currentPage;
  els.profileManagerList.innerHTML = managerMatches.length === 0
    ? '<div class="empty">没有匹配的选手档案</div>'
    : managerPage.pageItems.map(player => renderProfileCard(player)).join('');
  renderProfilePager(els.profileManagerPager, 'manager', managerPage.currentPage, managerPage.totalPages, managerMatches.length);
}

function setProfilePage(scope, page) {
  if (scope === 'manager') profilePaging.managerPage = Number(page) || 1;
  renderPlayers();
}

function resetProfilePage(scope) {
  if (scope === 'manager') profilePaging.managerPage = 1;
  renderPlayers();
}

function parseAliases(text) {
  return String(text || '')
    .split(/\r?\n+/)
    .map(item => item.trim())
    .filter(Boolean);
}

async function createPlayerProfile() {
  const displayName = form.profileNameInput.value.trim();
  if (!displayName) {
    showToast('请输入选手名');
    form.profileNameInput.focus();
    return;
  }
  try {
    await api('/api/player-profiles', {
      action: 'create',
      displayName,
      aliases: parseAliases(form.profileAliasesInput?.value || ''),
    });
    form.profileNameInput.value = '';
    if (form.profileAliasesInput) form.profileAliasesInput.value = '';
    closeAllModals();
    await loadAll();
    showToast('选手档案已创建');
  } catch (err) {
    showToast(err.message || '创建选手档案失败');
  }
}

function openProfileEditor(id) {
  const profile = appState.players.find(item => item.id === id);
  if (!profile) {
    showToast('未找到选手档案');
    return;
  }
  editingProfileId = profile.id;
  els.profileEditTitle.textContent = '编辑选手档案';
  form.editProfileNameInput.value = profile.displayName || '';
  form.editProfileAliasesInput.value = Array.isArray(profile.aliases) ? profile.aliases.join('\n') : '';
  els.profileEditHint.textContent = '修改显示名后，旧显示名会保留为别名。';
  openModal(els.profileEditModal);
  form.editProfileNameInput.focus();
  form.editProfileNameInput.select();
}

async function submitProfileEdit() {
  if (!editingProfileId) return;
  const displayName = form.editProfileNameInput.value.trim();
  if (!displayName) {
    showToast('请输入选手名');
    form.editProfileNameInput.focus();
    return;
  }
  try {
    await apiMethod(`/api/player-profiles/${encodeURIComponent(editingProfileId)}`, 'PATCH', {
      displayName,
      aliases: parseAliases(form.editProfileAliasesInput.value),
    });
    editingProfileId = '';
    closeAllModals();
    await loadAll();
    showToast('选手档案已保存');
  } catch (err) {
    showToast(err.message || '保存选手档案失败');
  }
}

function openProfileDelete(id, name) {
  deletingProfileId = id;
  deletingProfileName = name || '未命名选手';
  els.deleteProfileName.textContent = `「${deletingProfileName}」`;
  openModal(els.deleteProfileModal);
}

async function submitProfileDelete() {
  if (!deletingProfileId) return;
  try {
    await apiMethod(`/api/player-profiles/${encodeURIComponent(deletingProfileId)}`, 'DELETE');
    deletingProfileId = '';
    deletingProfileName = '';
    closeAllModals();
    await loadAll();
    showToast('选手档案已删除');
  } catch (err) {
    showToast(err.message || '删除选手档案失败');
  }
}

async function openProfileDetail(id) {
  const profile = appState.players.find(item => item.id === id);
  if (!profile) return;
  els.detailTitle.textContent = profileDisplayName(profile);
  els.detailBody.innerHTML = detailRows([
    ['别名', escHtml(Array.isArray(profile.aliases) && profile.aliases.length ? profile.aliases.join('、') : '-')],
    ['绑定', escHtml(Array.isArray(profile.bindings) ? profile.bindings.length : 0)],
  ]) + '<div class="detail-block">历史记录读取中</div>';
  translateHomeDynamic(els.detailBody);
  openModal(els.detailModal);
  const summaryRes = await fetch(`/api/player-profiles/${encodeURIComponent(id)}/summary`).then(r => r.json()).catch(() => null);
  const summary = summaryRes && summaryRes.ok ? summaryRes.summary : null;
  const tournaments = summary && Array.isArray(summary.tournaments) ? summary.tournaments : [];
  const history = tournaments.length === 0
    ? '<div class="detail-block profile-history-block"><div class="detail-section-title">比赛历史</div>暂无比赛记录</div>'
    : `<div class="detail-block profile-history-block"><div class="detail-section-title">比赛历史</div>${tournaments.slice(0, 8).map(item => {
      const rankLabel = item.rankLabel || item.resultLabel || (item.rank ? `#${item.rank}` : '未排名');
      const metaParts = [
        item.leagueName || '未关联联赛',
        item.pointsProfileName || '未设置积分规则',
        `${Number(item.points || 0)} pt`,
      ];
      return `
        <div class="detail-row">
          <div class="detail-key">${escHtml(formatDate(item.date))}</div>
          <div class="detail-value profile-history-value">
            <div class="profile-history-main">
              <span class="profile-history-name">${escHtml(item.tournamentName || '未命名比赛')}</span>
              <span class="profile-history-rank">${escHtml(rankLabel)}</span>
            </div>
            <div class="profile-history-meta">${escHtml(metaParts.join(' · '))}</div>
          </div>
        </div>
      `;
    }).join('')}</div>`;
  els.detailBody.innerHTML = detailRows([
    ['总积分', escHtml(summary ? summary.totalPoints : (profile.stats?.leaguePoints || 0))],
    ['计分记录', escHtml(summary ? summary.rankedEvents : 0)],
    ['别名', escHtml(Array.isArray(profile.aliases) && profile.aliases.length ? profile.aliases.join('、') : '-')],
  ]) + history;
  translateHomeDynamic(els.detailBody);
}

Object.assign(window.PTSHome, { renderPlayers, setProfilePage, resetProfilePage, createPlayerProfile, openProfileEditor, submitProfileEdit, openProfileDelete, submitProfileDelete, openProfileDetail });
