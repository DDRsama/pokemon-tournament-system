async function startStage(stageId) {
  const confirmed = await confirmStageStartWithUncheckedEntrants();
  if (!confirmed) return;
  const res = await api(tournamentApi(`/stages/${encodeURIComponent(stageId)}/start`));
  if (!res.ok && res.err) toast(res.err, 'error');
  if (res.state) render(res.state);
}

function uncheckedEntrantsBeforeStageStart() {
  if (!currentState || currentState.phase !== 'setup') return [];
  const entrants = Array.isArray(currentState.entrants) ? currentState.entrants : [];
  return (Array.isArray(currentState.players) ? currentState.players : [])
    .filter(name => {
      const entrant = entrants.find(item => (item.displayName || item.teamName || item.name) === name);
      return !entrant || entrant.checkedIn !== true;
    });
}

function stageStartParticipantLabel() {
  const settings = currentState?.tournamentSettings || {};
  const isTeam = settings.entrantType === 'team'
    || (Array.isArray(currentState?.entrants) && currentState.entrants.some(entrant => entrant?.entrantType === 'team'));
  return isTeam ? '队伍' : '选手';
}

async function confirmStageStartWithUncheckedEntrants() {
  const unchecked = uncheckedEntrantsBeforeStageStart();
  if (unchecked.length === 0) return true;
  const label = stageStartParticipantLabel();
  const sampleNames = unchecked.slice(0, 6);
  const sample = `${sampleNames.join('、')}${unchecked.length > sampleNames.length ? '…' : ''}`;
  const message = `还有 ${unchecked.length} 名${label}尚未签到：${sample}。确认开始阶段吗？`;
  return confirmAction(message, {
    title: '仍有未签到',
    okText: '继续开始',
    tone: 'primary',
  });
}
async function advanceStage(stageId) {
  const res = await api(tournamentApi(`/stages/${encodeURIComponent(stageId)}/advance`));
  if (!res.ok && res.err) toast(res.err, 'error');
  if (res.state) render(res.state);
}
async function completeStage(stageId) {
  const res = await api(tournamentApi(`/stages/${encodeURIComponent(stageId)}/complete`));
  if (!res.ok && res.err) toast(res.err, 'error');
  if (res.state) render(res.state);
}

async function revertSwissRound() {
  const confirmed = await confirmAction('确认回退到上一轮结束后的状态？本轮配对和已录入结果会被撤销。', {
    title: '回退瑞士轮',
    okText: '确认回退',
    tone: 'danger',
  });
  if (!confirmed) return;
  const res = await api(tournamentApi('/revert-round'));
  if (!res.ok && res.err) toast(res.err, 'error');
  if (res.state) render(res.state);
}

Object.assign(window.PTSAdmin, { startStage, advanceStage, completeStage, revertSwissRound, uncheckedEntrantsBeforeStageStart, confirmStageStartWithUncheckedEntrants });
