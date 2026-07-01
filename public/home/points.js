'use strict';
window.PTSHome = window.PTSHome || {};

function pointsProfileName(profile) {
  return profile?.name || '未命名积分规则';
}

function presetPointsProfile(profileId) {
  const presets = {
    top8: [
      { rank: 1, points: 30 },
      { rank: 2, points: 24 },
      { rankMin: 3, rankMax: 4, points: 18 },
      { rankMin: 5, rankMax: 8, points: 12 },
    ],
    top4: [
      { rank: 1, points: 20 },
      { rank: 2, points: 15 },
      { rankMin: 3, rankMax: 4, points: 10 },
    ],
    winner: [
      { rank: 1, points: 10 },
    ],
  };
  const rows = presets[profileId] || [];
  els.pointsRows.innerHTML = '';
  rows.forEach(row => addPointsRow(row));
}

function normalizePointsRows() {
  return Array.from(els.pointsRows.querySelectorAll('.points-row')).map(row => {
    const rank = row.querySelector('[data-field="rank"]')?.value.trim();
    const rankMin = row.querySelector('[data-field="rankMin"]')?.value.trim();
    const rankMax = row.querySelector('[data-field="rankMax"]')?.value.trim();
    const points = row.querySelector('[data-field="points"]')?.value.trim();
    return {
      rank,
      rankMin,
      rankMax,
      points: Number(points || 0),
    };
  }).filter(row => row.points || row.rank || row.rankMin || row.rankMax).map(row => {
    const payload = { points: row.points };
    if (row.rank) payload.rank = Number(row.rank);
    if (row.rankMin) payload.rankMin = Number(row.rankMin);
    if (row.rankMax) payload.rankMax = Number(row.rankMax);
    return payload;
  });
}

function addPointsRow(data = {}) {
  const rowId = `pointsRow_${Date.now()}_${pointsRowSeed += 1}`;
  const row = document.createElement('div');
  row.className = 'points-row';
  row.dataset.rowId = rowId;
  row.innerHTML = `
    <div>
      <label class="label">名次</label>
      <input class="input" data-field="rank" type="number" step="1" placeholder="如 1" value="${escAttr(data.rank ?? '')}">
    </div>
    <div>
      <label class="label">起始名次</label>
      <input class="input" data-field="rankMin" type="number" step="1" placeholder="如 3" value="${escAttr(data.rankMin ?? '')}">
    </div>
    <div>
      <label class="label">结束名次</label>
      <input class="input" data-field="rankMax" type="number" step="1" placeholder="如 4" value="${escAttr(data.rankMax ?? '')}">
    </div>
    <div>
      <label class="label">分数</label>
      <input class="input" data-field="points" type="number" step="1" placeholder="如 18" value="${escAttr(data.points ?? '')}">
    </div>
    <button class="btn btn-danger" type="button" data-action="removePointsRow">删除</button>
  `;
  els.pointsRows.appendChild(row);
}

function resetPointsProfileForm(profile = null) {
  editingPointsProfileId = profile ? profile.id : '';
  els.pointsProfileModalTitle.textContent = profile ? '编辑积分规则' : '新建积分规则';
  form.pointsProfileNameInput.value = profile?.name || '';
  form.pointsParticipationInput.value = profile?.participationPoints ?? 1;
  form.pointsMultiplierInput.value = profile?.eventTierMultiplier ?? 1;
  form.pointsPresetSelect.value = '';
  els.pointsRows.innerHTML = '';
  const rows = Array.isArray(profile?.placementPoints) && profile.placementPoints.length
    ? profile.placementPoints
    : [{ rank: 1, points: 30 }, { rank: 2, points: 24 }, { rankMin: 3, rankMax: 4, points: 18 }, { rankMin: 5, rankMax: 8, points: 12 }];
  rows.forEach(row => addPointsRow(row));
}

function placementSummary(profile) {
  const rows = Array.isArray(profile.placementPoints) ? profile.placementPoints : [];
  if (rows.length === 0) return '无名次分';
  return rows.slice(0, 2).map(row => {
    if (row.rank) return `#${row.rank} +${row.points || 0}`;
    if (row.rankMin && row.rankMax) return `#${row.rankMin}-${row.rankMax} +${row.points || 0}`;
    return `+${row.points || 0}`;
  }).join(' / ');
}

function renderPointsProfiles() {
  if (appState.pointsProfiles.length === 0) {
    els.pointsProfileList.innerHTML = '<div class="summary-note">暂无积分规则。联赛纳入比赛时需要选择或创建规则。</div>';
    els.pointsManagerList.innerHTML = '<div class="empty">暂无积分规则</div>';
    return;
  }
  const latest = sortByUpdated(appState.pointsProfiles)[0];
  els.pointsProfileList.innerHTML = `
    <div class="summary-note">最近更新：${escHtml(pointsProfileName(latest))} · ${escHtml(formatDate(latest.updatedAt || latest.createdAt))}</div>
  `;
  els.pointsManagerList.innerHTML = sortByUpdated(appState.pointsProfiles).map(profile => `
    <article class="data-item">
      <div class="data-top">
        <div>
          <div class="data-name">${escHtml(pointsProfileName(profile))}</div>
          <div class="item-meta">
            <span>参赛 +${Number(profile.participationPoints || 0)}</span>
            <span>x${Number(profile.eventTierMultiplier || 1)}</span>
            <span>${escHtml(placementSummary(profile))}</span>
          </div>
        </div>
        <span class="tag">Points</span>
      </div>
      <div class="data-actions">
        <button class="btn btn-secondary" type="button" data-action="detailPoints" data-id="${escAttr(profile.id)}">查看</button>
        <button class="btn btn-secondary" type="button" data-action="editPoints" data-id="${escAttr(profile.id)}">编辑</button>
        <button class="btn btn-danger" type="button" data-action="deletePoints" data-id="${escAttr(profile.id)}" data-name="${escAttr(pointsProfileName(profile))}">删除</button>
      </div>
    </article>
  `).join('');
}

async function createPointsProfile() {
  const name = form.pointsProfileNameInput.value.trim();
  if (!name) {
    showToast('请输入积分规则名称');
    form.pointsProfileNameInput.focus();
    return;
  }
  try {
    const payload = {
      name,
      participationPoints: Number(form.pointsParticipationInput.value || 0),
      placementPoints: normalizePointsRows(),
      eventTierMultiplier: Number(form.pointsMultiplierInput.value || 1),
    };
    const wasEditing = !!editingPointsProfileId;
    if (wasEditing) {
      await apiMethod(`/api/points-profiles/${encodeURIComponent(editingPointsProfileId)}`, 'PATCH', payload);
    } else {
      await api('/api/points-profiles', { action: 'create', ...payload });
    }
    resetPointsProfileForm();
    closeAllModals();
    await loadAll();
    showToast(wasEditing ? '积分规则已保存' : '积分规则已创建');
  } catch (err) {
    showToast(err.message || '保存积分规则失败');
  }
}

function openPointsEditor(id = '') {
  const profile = id ? appState.pointsProfiles.find(item => item.id === id) : null;
  resetPointsProfileForm(profile || null);
  openModal(els.createPointsProfileModal);
}

async function deletePointsProfile(id, name) {
  if (!id) return;
  deletingPointsProfileId = id;
  deletingPointsProfileName = name || '未命名积分规则';
  els.deletePointsProfileName.textContent = `「${deletingPointsProfileName}」`;
  openModal(els.deletePointsModal);
}

async function submitDeletePointsProfile() {
  if (!deletingPointsProfileId) return;
  try {
    await apiMethod(`/api/points-profiles/${encodeURIComponent(deletingPointsProfileId)}`, 'DELETE');
    deletingPointsProfileId = '';
    deletingPointsProfileName = '';
    closeAllModals();
    await loadAll();
    showToast('积分规则已删除');
  } catch (err) {
    showToast(err.message || '删除积分规则失败');
  }
}

function openPointsDetail(id) {
  const profile = appState.pointsProfiles.find(item => item.id === id);
  if (!profile) return;
  els.detailTitle.textContent = pointsProfileName(profile);
  const placementRows = Array.isArray(profile.placementPoints) && profile.placementPoints.length > 0
    ? `<div class="detail-block">${profile.placementPoints.map(row => {
        const rank = row.rank ? `#${row.rank}` : row.rankMin && row.rankMax ? `#${row.rankMin}-${row.rankMax}` : '-';
        return `
          <div class="detail-row">
            <div class="detail-key">${escHtml(rank)}</div>
            <div class="detail-value">+${Number(row.points || 0)} pt</div>
          </div>
        `;
      }).join('')}</div>`
    : '<div class="detail-block">无名次分</div>';
  els.detailBody.innerHTML = detailRows([
    ['参赛分', `+${Number(profile.participationPoints || 0)} pt`],
    ['倍率', `x${Number(profile.eventTierMultiplier || 1)}`],
  ]) + placementRows;
  translateHomeDynamic(els.detailBody);
  openModal(els.detailModal);
}

Object.assign(window.PTSHome, { presetPointsProfile, normalizePointsRows, addPointsRow, resetPointsProfileForm, placementSummary, renderPointsProfiles, createPointsProfile, openPointsEditor, deletePointsProfile, submitDeletePointsProfile, openPointsDetail });
