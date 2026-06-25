async function startStage(stageId) {
  const res = await api(tournamentApi(`/stages/${encodeURIComponent(stageId)}/start`));
  if (!res.ok && res.err) toast(res.err, 'error');
  if (res.state) render(res.state);
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

Object.assign(window.PTSAdmin, { startStage, advanceStage, completeStage, revertSwissRound });
