'use strict';
window.PTSHome = window.PTSHome || {};

const appState = {
  tournaments: [],
  leagues: [],
  players: [],
  pointsProfiles: [],
};

const els = {
  tournamentTotalCount: document.getElementById('tournamentTotalCount'),
  leagueCount: document.getElementById('leagueCount'),
  leagueCountSummary: document.getElementById('leagueCountSummary'),
  leagueCountSummaryNumber: document.getElementById('leagueCountSummaryNumber'),
  profileCount: document.getElementById('profileCount'),
  profileCountSummary: document.getElementById('profileCountSummary'),
  pointsProfileCountSummary: document.getElementById('pointsProfileCountSummary'),
  tournamentCount: document.getElementById('tournamentCount'),
  tournamentList: document.getElementById('tournamentList'),
  leagueList: document.getElementById('leagueList'),
  profileList: document.getElementById('profileList'),
  pointsProfileList: document.getElementById('pointsProfileList'),
  leagueManagerModal: document.getElementById('leagueManagerModal'),
  leagueManagerList: document.getElementById('leagueManagerList'),
  profileManagerModal: document.getElementById('profileManagerModal'),
  profileManagerList: document.getElementById('profileManagerList'),
  profileManagerSearchInput: document.getElementById('profileManagerSearchInput'),
  profileManagerPageSizeSelect: document.getElementById('profileManagerPageSizeSelect'),
  profileManagerPager: document.getElementById('profileManagerPager'),
  pointsManagerModal: document.getElementById('pointsManagerModal'),
  pointsManagerList: document.getElementById('pointsManagerList'),
  toast: document.getElementById('toast'),
  createTournamentModal: document.getElementById('createTournamentModal'),
  createLeagueModal: document.getElementById('createLeagueModal'),
  createProfileModal: document.getElementById('createProfileModal'),
  profileModalTitle: document.getElementById('profileModalTitle'),
  createPointsProfileModal: document.getElementById('createPointsProfileModal'),
  pointsProfileModalTitle: document.getElementById('pointsProfileModalTitle'),
  detailModal: document.getElementById('detailModal'),
  detailTitle: document.getElementById('detailTitle'),
  detailBody: document.getElementById('detailBody'),
  profileEditModal: document.getElementById('profileEditModal'),
  profileEditTitle: document.getElementById('profileEditTitle'),
  profileEditHint: document.getElementById('profileEditHint'),
  deleteProfileModal: document.getElementById('deleteProfileModal'),
  deleteProfileName: document.getElementById('deleteProfileName'),
  leagueRuleModal: document.getElementById('leagueRuleModal'),
  leagueRuleTargetName: document.getElementById('leagueRuleTargetName'),
  leagueRuleSelect: document.getElementById('leagueRuleSelect'),
  renameModal: document.getElementById('renameModal'),
  renameInput: document.getElementById('renameInput'),
  qrModal: document.getElementById('qrModal'),
  qrTournamentName: document.getElementById('qrTournamentName'),
  qrImage: document.getElementById('qrImage'),
  qrUrl: document.getElementById('qrUrl'),
  deleteModal: document.getElementById('deleteModal'),
  deleteTournamentName: document.getElementById('deleteTournamentName'),
  deleteLeagueModal: document.getElementById('deleteLeagueModal'),
  deleteLeagueName: document.getElementById('deleteLeagueName'),
  deletePointsModal: document.getElementById('deletePointsModal'),
  deletePointsProfileName: document.getElementById('deletePointsProfileName'),
  pointsRows: document.getElementById('pointsRows'),
};

const form = {
  nameInput: document.getElementById('newTournamentName'),
  entrantTypeSelect: document.getElementById('entrantTypeSelect'),
  qualificationTypeSelect: document.getElementById('qualificationTypeSelect'),
  qualificationBestOfSelect: document.getElementById('qualificationBestOfSelect'),
  groupCountInput: document.getElementById('groupCountInput'),
  advancePerGroupInput: document.getElementById('advancePerGroupInput'),
  finalsTypeSelect: document.getElementById('finalsTypeSelect'),
  topCutSizeInput: document.getElementById('topCutSizeInput'),
  finalsBestOfSelect: document.getElementById('finalsBestOfSelect'),
  bronzeMatchToggle: document.getElementById('bronzeMatchToggle'),
  leagueNameInput: document.getElementById('newLeagueName'),
  leagueBestFinishLimitInput: document.getElementById('newLeagueBestFinishLimit'),
  profileNameInput: document.getElementById('newProfileName'),
  profileAliasesInput: document.getElementById('newProfileAliases'),
  editProfileNameInput: document.getElementById('editProfileName'),
  editProfileAliasesInput: document.getElementById('editProfileAliases'),
  pointsProfileNameInput: document.getElementById('newPointsProfileName'),
  pointsParticipationInput: document.getElementById('newPointsParticipation'),
  pointsMultiplierInput: document.getElementById('newPointsMultiplier'),
  pointsPresetSelect: document.getElementById('newPointsPreset'),
};

let renamingTournamentId = '';
let currentQrUrl = '';
let deletingTournamentId = '';
let deletingTournamentName = '';
let editingPointsProfileId = '';
let pointsRowSeed = 0;
let deletingPointsProfileId = '';
let deletingPointsProfileName = '';
let deletingLeagueId = '';
let deletingLeagueName = '';
let editingProfileId = '';
let deletingProfileId = '';
let deletingProfileName = '';

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

function phaseLabel(phase) {
  return {
    setup: '准备中',
    swiss: '瑞士轮',
    'swiss-ended': '瑞士轮结束',
    groups: '小组赛',
    'groups-ended': '小组赛结束',
    top8: '淘汰赛',
    double_elimination: '双败淘汰',
    'double_elimination-ended': '双败结束',
    done: '已结束',
  }[phase] || phase || '-';
}

function phaseClass(phase) {
  return {
    swiss: 'swiss',
    'swiss-ended': 'swiss-ended',
    groups: 'groups',
    'groups-ended': 'groups',
    top8: 'top8',
    double_elimination: 'double-elimination',
    'double_elimination-ended': 'double-elimination',
    done: 'done',
  }[phase] || '';
}

function adminUrl(id) { return `/t/${encodeURIComponent(id)}/admin`; }
function overlayUrl(id) { return `/t/${encodeURIComponent(id)}/overlay`; }
function playerUrl(id) { return `/t/${encodeURIComponent(id)}/player-login`; }

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function sortByDate(items) {
  return [...items].sort((a, b) => Number(b.date || 0) - Number(a.date || 0));
}

function sortByUpdated(items) {
  return [...items].sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
}

async function api(path, data = null) {
  const init = data
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    : {};
  const res = await fetch(path, init);
  const json = await res.json();
  if (!res.ok || json.ok === false) throw new Error(json.err || '请求失败');
  return json;
}

async function apiMethod(path, method, data = null) {
  const init = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) init.body = JSON.stringify(data);
  const res = await fetch(path, init);
  const json = await res.json();
  if (!res.ok || json.ok === false) throw new Error(json.err || '请求失败');
  return json;
}

Object.assign(window.PTSHome, { appState, els, form, api, apiMethod, escHtml, escAttr, phaseLabel, phaseClass, adminUrl, overlayUrl, playerUrl, formatDate, sortByDate, sortByUpdated });
