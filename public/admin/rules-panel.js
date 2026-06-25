function setSettingsMessage(text, cls = '') {

  const el = document.getElementById('settingsMessage');
  if (!el) return;
  el.textContent = text || '';
  el.className = `settings-message ${cls}`.trim();
}
async function saveTournamentSettings() {
  setSettingsMessage('赛事规则需在新建比赛时确定，后台不再提供修改权限', 'err');
}
function getCurrentSettingsFromUi() {
  const settings = currentState?.tournamentSettings || {};
  return { ...settings };
}
async function applyPreset() {
  setSettingsMessage('赛事结构已锁定，请在主页新建比赛时设置', 'err');
}
function parsePositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
function normalizeOdd(value, fallback) {
  const number = parsePositiveInt(value, fallback);
  return number % 2 === 1 ? number : number + 1;
}
async function saveStageSettings(stageId) {
  setSettingsMessage('阶段规则需在新建比赛时确定，后台只负责执行阶段', 'err');
}

Object.assign(window.PTSAdmin, { setSettingsMessage, saveTournamentSettings, getCurrentSettingsFromUi, applyPreset, parsePositiveInt, normalizeOdd, saveStageSettings });
