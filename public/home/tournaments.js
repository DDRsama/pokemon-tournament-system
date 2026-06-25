'use strict';
window.PTSHome = window.PTSHome || {};

function tournamentCard(t) {
  const admin = adminUrl(t.id);
  const player = playerUrl(t.id);
  const overlay = overlayUrl(t.id);
  const createdAt = formatDate(t.date);
  return `
    <article class="tour-card">
      <div class="tour-top">
        <div>
          <div class="tour-name">${escHtml(t.name || '未命名比赛')}</div>
          <div class="tour-meta">
            <span class="tour-id">${escHtml(t.id)}</span>
            <span>${escHtml(createdAt)}</span>
          </div>
        </div>
        <span class="phase ${phaseClass(t.phase)}">${escHtml(phaseLabel(t.phase))}</span>
      </div>
      <div class="tour-actions">
        <button class="btn btn-primary" type="button" data-action="admin" data-url="${escAttr(admin)}">进入后台</button>
        <button class="btn btn-secondary" type="button" data-action="playerQr" data-url="${escAttr(player)}" data-name="${escAttr(t.name || '')}">选手入口二维码</button>
        <button class="btn btn-secondary" type="button" data-action="copy" data-url="${escAttr(overlay)}">复制叠加层链接</button>
        <span class="tour-action-spacer"></span>
        <button class="btn btn-secondary" type="button" data-action="rename" data-id="${escAttr(t.id)}" data-name="${escAttr(t.name || '')}">重命名</button>
        <button class="btn btn-danger" type="button" data-action="delete" data-id="${escAttr(t.id)}" data-name="${escAttr(t.name || '')}">删除</button>
      </div>
    </article>
  `;
}

function renderTournaments() {
  if (appState.tournaments.length === 0) {
    els.tournamentList.innerHTML = '<div class="empty">暂无比赛</div>';
    return;
  }
  els.tournamentList.innerHTML = sortByDate(appState.tournaments).map(t => tournamentCard(t)).join('');
}

function updateCreateTournamentHint() {
  const qualificationType = form.qualificationTypeSelect?.value || '';
  const finalsType = form.finalsTypeSelect?.value || '';
  const swissBlock = document.querySelector('[data-qualification-extra=\"swiss\"]');
  const groupsBlock = document.querySelector('[data-qualification-extra=\"groups\"]');
  const qualificationBestOfBlock = document.getElementById('qualificationBestOfBlock');
  const finalsStageSection = document.getElementById('finalsStageSection');
  const bronzeRow = document.getElementById('bronzeMatchRow');
  const finalsOptions = document.getElementById('finalsOptions');
  const topCutSizeLabel = document.getElementById('topCutSizeLabel');
  const noFinalsOption = form.finalsTypeSelect?.querySelector('option[value="none"]');

  if (swissBlock) swissBlock.classList.toggle('hidden', qualificationType !== 'swiss');
  if (groupsBlock) groupsBlock.classList.toggle('hidden', qualificationType !== 'groups');
  if (qualificationBestOfBlock) qualificationBestOfBlock.classList.toggle('hidden', !['swiss', 'groups'].includes(qualificationType));
  if (finalsStageSection) finalsStageSection.classList.toggle('hidden', !qualificationType);

  if (noFinalsOption) noFinalsOption.disabled = qualificationType === 'none';
  if (qualificationType === 'none' && finalsType === 'none') {
    form.finalsTypeSelect.value = '';
  }

  const currentFinalsType = form.finalsTypeSelect?.value || '';
  if (finalsOptions) finalsOptions.classList.toggle('hidden', !currentFinalsType || currentFinalsType === 'none');
  if (bronzeRow) bronzeRow.classList.toggle('hidden', currentFinalsType !== 'single_elimination');
  if (topCutSizeLabel) topCutSizeLabel.textContent = qualificationType === 'none' ? '淘汰赛人数' : '晋级人数';

  const hint = document.getElementById('createTournamentHint');
  if (hint) {
    if (!qualificationType) {
      hint.textContent = '请先选择资格赛规则。';
      return;
    }
    if (!currentFinalsType) {
      hint.textContent = qualificationType === 'none'
        ? '无资格赛时必须设置单败或双败淘汰赛。'
        : '请继续选择淘汰赛规则。';
      return;
    }
    const qLabel = {
      swiss: '瑞士轮资格赛（自动轮数）',
      groups: '小组赛资格赛',
      none: '无资格赛',
    }[qualificationType] || '资格赛';
    const fLabel = {
      single_elimination: qualificationType === 'none' ? `${form.topCutSizeInput?.value || 8} 人单败淘汰赛` : `前 ${form.topCutSizeInput?.value || 8} 名进入单败淘汰赛`,
      double_elimination: qualificationType === 'none' ? `${form.topCutSizeInput?.value || 8} 人双败淘汰赛` : `前 ${form.topCutSizeInput?.value || 8} 名进入双败淘汰赛`,
      none: '不进入第二阶段',
    }[currentFinalsType] || '淘汰赛';
    hint.textContent = `${qLabel}，${fLabel}。`;
  }
}

function buildTournamentSettingsFromCreateForm() {
  const qualificationType = form.qualificationTypeSelect?.value || '';
  const finalsType = form.finalsTypeSelect?.value || '';
  if (!qualificationType) throw new Error('请选择资格赛规则');
  if (!finalsType) throw new Error('请选择淘汰赛规则');
  if (qualificationType === 'none' && finalsType === 'none') throw new Error('无资格赛时必须设置淘汰赛');
  const entrantType = form.entrantTypeSelect?.value || 'player';
  const qualificationBestOf = Number(form.qualificationBestOfSelect?.value || 1);
  const finalsBestOf = Number(form.finalsBestOfSelect?.value || 3);
  const topCutSize = Number(form.topCutSizeInput?.value || 8);
  const stages = [];

  if (qualificationType === 'none') {
    if (finalsType === 'double_elimination') {
      stages.push({
        id: 'stage_double_elimination_1',
        role: 'finals',
        type: 'double_elimination',
        name: '淘汰赛：双败淘汰',
        entrySource: { type: 'all_entrants' },
        matchRules: { bestOf: finalsBestOf, allowDraw: false, scoreMode: 'games' },
        doubleElimination: { bracketSize: topCutSize, grandFinalReset: true, bronzeMatch: false },
      });
    } else {
      stages.push({
        id: 'stage_top_cut_1',
        role: 'finals',
        type: 'single_elimination',
        name: '淘汰赛：单败淘汰',
        entrySource: { type: 'all_entrants' },
        matchRules: { bestOf: finalsBestOf, allowDraw: false, scoreMode: 'games' },
        elimination: { bracketSize: topCutSize, bronzeMatch: form.bronzeMatchToggle?.checked !== false, seeding: 'rank_order' },
      });
    }
  } else if (qualificationType === 'swiss') {
    stages.push({
      id: 'stage_swiss_1',
      role: 'qualification',
      type: 'swiss',
      name: '资格赛：瑞士轮',
      entrySource: { type: 'all_entrants' },
      matchRules: { bestOf: qualificationBestOf, allowDraw: true, scoreMode: 'match' },
      swiss: { roundPolicy: 'auto_by_entrant_count', pairingMethod: 'swiss', byePolicy: 'avoid_repeat' },
      advancement: finalsType === 'none' ? { mode: 'none', count: 0, targetStageId: null } : { mode: 'top_cut', count: topCutSize, targetStageId: finalsType === 'double_elimination' ? 'stage_double_elimination_1' : 'stage_top_cut_1' },
    });
  } else if (qualificationType === 'groups') {
    stages.push({
      id: 'stage_groups_1',
      role: 'qualification',
      type: 'groups',
      name: '资格赛：小组赛',
      entrySource: { type: 'all_entrants' },
      matchRules: { bestOf: qualificationBestOf, allowDraw: true, scoreMode: 'match' },
      groups: {
        groupCount: Number(form.groupCountInput?.value || 4),
        advancePerGroup: Number(form.advancePerGroupInput?.value || 2),
        seeding: 'snake',
        tiebreakers: ['points', 'omw', 'oow'],
      },
      advancement: finalsType === 'none' ? { mode: 'none', count: 0, targetStageId: null } : { mode: 'per_group', count: Number(form.advancePerGroupInput?.value || 2), targetStageId: finalsType === 'double_elimination' ? 'stage_double_elimination_1' : 'stage_top_cut_1' },
    });
  }

  if (stages.length > 0 && finalsType !== 'none' && qualificationType !== 'none') {
    const entrySource = { type: 'previous_stage_advancers', fromStageId: stages[0].id };
    if (finalsType === 'double_elimination') {
      stages.push({
        id: 'stage_double_elimination_1',
        role: 'finals',
        type: 'double_elimination',
        name: '淘汰赛：双败淘汰',
        entrySource,
        matchRules: { bestOf: finalsBestOf, allowDraw: false, scoreMode: 'games' },
        doubleElimination: { bracketSize: topCutSize, grandFinalReset: true, bronzeMatch: false },
      });
    } else {
      stages.push({
        id: 'stage_top_cut_1',
        role: 'finals',
        type: 'single_elimination',
        name: '淘汰赛：单败淘汰',
        entrySource,
        matchRules: { bestOf: finalsBestOf, allowDraw: false, scoreMode: 'games' },
        elimination: { bracketSize: topCutSize, bronzeMatch: form.bronzeMatchToggle?.checked !== false, seeding: 'rank_order' },
      });
    }
  }

  return {
    presetId: 'custom_structure',
    game: 'vgc',
    entrantType,
    stages,
  };
}

async function createTournament() {
  const name = form.nameInput.value.trim() || '未命名比赛';
  try {
    const settings = buildTournamentSettingsFromCreateForm();
    const res = await api('/api/tournaments', { action: 'create', name, settings });
    if (res.id) {
      location.href = adminUrl(res.id);
      return;
    }
    closeAllModals();
    await loadAll();
  } catch (err) {
    showToast(err.message || '创建比赛失败');
  }
}

function openRenameModal(id, currentName) {
  renamingTournamentId = id;
  els.renameInput.value = currentName || '';
  openModal(els.renameModal);
  window.setTimeout(() => {
    els.renameInput.focus();
    els.renameInput.select();
  }, 30);
}

async function submitRename() {
  if (!renamingTournamentId) return;
  try {
    await api('/api/tournaments', { action: 'rename', id: renamingTournamentId, name: els.renameInput.value.trim() || '未命名比赛' });
    renamingTournamentId = '';
    closeAllModals();
    await loadAll();
  } catch (err) {
    showToast(err.message || '重命名失败');
  }
}

function openDeleteModal(id, name) {
  deletingTournamentId = id;
  deletingTournamentName = name || id;
  els.deleteTournamentName.textContent = `「${deletingTournamentName}」`;
  openModal(els.deleteModal);
}

async function submitDelete() {
  if (!deletingTournamentId) return;
  try {
    await api('/api/tournaments', { action: 'delete', id: deletingTournamentId });
    deletingTournamentId = '';
    deletingTournamentName = '';
    closeAllModals();
    await loadAll();
  } catch (err) {
    showToast(err.message || '删除失败');
  }
}

function detailRows(rows) {
  return `<div class="detail-block">${rows.map(([key, value]) => `
    <div class="detail-row">
      <div class="detail-key">${escHtml(key)}</div>
      <div class="detail-value">${value}</div>
    </div>
  `).join('')}</div>`;
}

Object.assign(window.PTSHome, { tournamentCard, renderTournaments, createTournament, openRenameModal, submitRename, openDeleteModal, submitDelete });
