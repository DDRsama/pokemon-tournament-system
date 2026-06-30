'use strict';
window.PTSHome = window.PTSHome || {};

function renderStats() {
  els.tournamentTotalCount.textContent = appState.tournaments.length;
  els.leagueCount.textContent = appState.leagues.length;
  els.leagueCountSummary.textContent = `${appState.leagues.length} 个`;
  els.leagueCountSummaryNumber.textContent = appState.leagues.length;
  els.profileCount.textContent = appState.players.length;
  els.profileCountSummary.textContent = appState.players.length;
  els.pointsProfileCountSummary.textContent = appState.pointsProfiles.length;
  els.tournamentCount.textContent = `${appState.tournaments.length} 场`;
}

function renderAll() {
  renderStats();
  renderTournaments();
  renderLeagues();
  renderPlayers();
  renderPointsProfiles();
}

async function loadAll() {
  const [tournaments, leaguesRes, playersRes, pointsRes] = await Promise.all([
    api('/api/tournaments').catch(() => []),
    api('/api/leagues').catch(() => ({ leagues: [] })),
    api('/api/player-profiles').catch(() => ({ players: [] })),
    api('/api/points-profiles').catch(() => ({ pointsProfiles: [] })),
  ]);
  appState.tournaments = Array.isArray(tournaments) ? tournaments : [];
  appState.leagues = Array.isArray(leaguesRes.leagues) ? leaguesRes.leagues : [];
  appState.players = Array.isArray(playersRes.players) ? playersRes.players : [];
  appState.pointsProfiles = Array.isArray(pointsRes.pointsProfiles) ? pointsRes.pointsProfiles : [];
  renderAll();
}

function handleAction(action, target) {
  if (action === 'openCreateTournament') openModal(els.createTournamentModal);
  if (action === 'openCreateLeague') openModal(els.createLeagueModal);
  if (action === 'openCreateProfile') openModal(els.createProfileModal);
  if (action === 'openCreatePointsProfile') openPointsEditor();
  if (action === 'openLeagueManager') openModal(els.leagueManagerModal);
  if (action === 'openProfileManager') openModal(els.profileManagerModal);
  if (action === 'openPointsManager') openModal(els.pointsManagerModal);
  if (action === 'editProfile') openProfileEditor(target.dataset.id);
  if (action === 'deleteProfile') openProfileDelete(target.dataset.id, target.dataset.name);
  if (action === 'editPoints') openPointsEditor(target.dataset.id);
  if (action === 'deletePoints') deletePointsProfile(target.dataset.id, target.dataset.name);
  if (action === 'deleteLeague') deleteLeague(target.dataset.id, target.dataset.name);
  if (action === 'includeLeagueTournament') includeLeagueTournament(target.dataset.leagueId, target.dataset.tournamentId);
  if (action === 'includeLeagueTournamentFromSelect') includeLeagueTournamentFromSelect(target.dataset.leagueId, target.dataset.selectId, target.dataset.pointsSelectId);
  if (action === 'editLeagueTournamentPoints') openLeagueRuleModal(target.dataset.leagueId, target.dataset.tournamentId);
  if (action === 'removeLeagueTournament') removeLeagueTournament(target.dataset.leagueId, target.dataset.tournamentId);
  if (action === 'removePointsRow') target.closest('.points-row')?.remove();
  if (action === 'addPointsRow') addPointsRow();
  if (action === 'closeModal') closeAllModals();
  if (action === 'admin') location.href = target.dataset.url;
  if (action === 'copy') copyText(location.origin + target.dataset.url);
  if (action === 'playerQr') openQrModal(target.dataset.url, target.dataset.name);
  if (action === 'rename') openRenameModal(target.dataset.id, target.dataset.name);
  if (action === 'delete') openDeleteModal(target.dataset.id, target.dataset.name);
  if (action === 'detailLeague') openLeagueDetail(target.dataset.id);
  if (action === 'detailProfile') openProfileDetail(target.dataset.id);
  if (action === 'detailPoints') openPointsDetail(target.dataset.id);
}

document.addEventListener('click', evt => {
  const target = evt.target.closest('[data-action]');
  if (!target) return;
  handleAction(target.dataset.action, target);
}, true);

els.profileManagerList.addEventListener('click', evt => {
  const target = evt.target.closest('[data-action]');
  if (!target || !els.profileManagerList.contains(target)) return;
  if (!['detailProfile', 'editProfile', 'deleteProfile'].includes(target.dataset.action)) return;
  evt.preventDefault();
  evt.stopPropagation();
  handleAction(target.dataset.action, target);
});

document.addEventListener('click', evt => {
  const target = evt.target.closest('[data-profile-page]');
  if (!target) return;
  setProfilePage(target.dataset.profilePage, target.dataset.page);
});

els.profileManagerSearchInput?.addEventListener('input', () => resetProfilePage('manager'));
els.profileManagerPageSizeSelect?.addEventListener('change', () => resetProfilePage('manager'));

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', evt => {
    if (evt.target !== modal) return;
    if (modal.classList.contains('modal-stack')) {
      if (modal === els.leagueRuleModal) closeLeagueRuleModal();
      else closeStackModal(modal);
      return;
    }
    closeAllModals();
  });
});

document.getElementById('openCreateTournamentBtn').addEventListener('click', () => openModal(els.createTournamentModal));
document.getElementById('refreshBtn').addEventListener('click', loadAll);
document.getElementById('createBtn').addEventListener('click', createTournament);
document.getElementById('createLeagueBtn').addEventListener('click', createLeague);
document.getElementById('createProfileBtn').addEventListener('click', createPlayerProfile);
document.getElementById('createPointsProfileBtn').addEventListener('click', createPointsProfile);
document.getElementById('addPointsRowBtn').addEventListener('click', () => addPointsRow());
document.getElementById('renameSaveBtn').addEventListener('click', submitRename);
document.getElementById('renameCancelBtn').addEventListener('click', closeAllModals);
document.getElementById('qrCopyBtn').addEventListener('click', () => copyText(currentQrUrl));
document.getElementById('qrCloseBtn').addEventListener('click', closeAllModals);
document.getElementById('deleteConfirmBtn').addEventListener('click', submitDelete);
document.getElementById('deleteCancelBtn').addEventListener('click', closeAllModals);
document.getElementById('deleteLeagueConfirmBtn').addEventListener('click', submitDeleteLeague);
document.getElementById('deleteLeagueCancelBtn').addEventListener('click', closeAllModals);
document.getElementById('deletePointsConfirmBtn').addEventListener('click', submitDeletePointsProfile);
document.getElementById('deletePointsCancelBtn').addEventListener('click', closeAllModals);
document.getElementById('profileEditSaveBtn').addEventListener('click', submitProfileEdit);
document.getElementById('profileEditDeleteBtn').addEventListener('click', () => {
  const profile = appState.players.find(item => item.id === editingProfileId);
  if (profile) openProfileDelete(profile.id, profile.displayName || profile.name || '未命名选手');
});
document.getElementById('profileEditCancelBtn').addEventListener('click', closeAllModals);
document.getElementById('deleteProfileConfirmBtn').addEventListener('click', submitProfileDelete);
document.getElementById('deleteProfileCancelBtn').addEventListener('click', closeAllModals);
document.getElementById('leagueRuleConfirmBtn').addEventListener('click', submitLeagueRule);
document.getElementById('leagueRuleCancelBtn').addEventListener('click', closeLeagueRuleModal);

form.qualificationTypeSelect.addEventListener('change', () => {
  form.finalsTypeSelect.value = '';
  updateCreateTournamentHint();
});

[
  form.qualificationBestOfSelect,
  form.groupCountInput,
  form.advancePerGroupInput,
  form.finalsTypeSelect,
  form.topCutSizeInput,
  form.finalsBestOfSelect,
  form.bronzeMatchToggle,
].forEach(control => {
  if (control) control.addEventListener('change', updateCreateTournamentHint);
});

form.nameInput.addEventListener('keydown', evt => { if (evt.key === 'Enter') createTournament(); });
form.leagueNameInput.addEventListener('keydown', evt => { if (evt.key === 'Enter') createLeague(); });
form.profileNameInput.addEventListener('keydown', evt => { if (evt.key === 'Enter') createPlayerProfile(); });
form.editProfileNameInput.addEventListener('keydown', evt => { if (evt.key === 'Enter') submitProfileEdit(); });
form.pointsProfileNameInput.addEventListener('keydown', evt => { if (evt.key === 'Enter') createPointsProfile(); });
form.pointsParticipationInput.addEventListener('keydown', evt => { if (evt.key === 'Enter') createPointsProfile(); });
form.pointsMultiplierInput.addEventListener('keydown', evt => { if (evt.key === 'Enter') createPointsProfile(); });

form.pointsPresetSelect.addEventListener('change', evt => {
  if (evt.target.value) presetPointsProfile(evt.target.value);
});

document.addEventListener('keydown', evt => {
  if (evt.key === 'Escape') closeAllModals();
});

resetPointsProfileForm();
updateCreateTournamentHint();
window.addEventListener('pts-languagechange', () => {
  renderAll();
  updateCreateTournamentHint();
  window.setTimeout(() => window.PTSI18n?.translateNode?.(document.documentElement), 0);
});
loadAll().catch(err => {
  els.tournamentList.innerHTML = `<div class="empty">${escHtml(err.message || '加载失败')}</div>`;
});

Object.assign(window.PTSHome, { renderStats, renderAll, loadAll, handleAction });
