function emptyRecord() {
  return { wins: 0, draws: 0, losses: 0, points: 0 };
}

function getRecordBeforeRound(player, roundNumber, state = {}) {
  if (!player || player === 'BYE' || typeof roundNumber !== 'number' || roundNumber <= 1) {
    return emptyRecord();
  }

  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const m of (state.matches || [])) {
    if (typeof m.round !== 'number' || m.round >= roundNumber || !m.done) continue;
    if (m.p1 !== player && m.p2 !== player) continue;

    if (m.p1 === 'BYE' || m.p2 === 'BYE') {
      wins++;
      continue;
    }
    if (m.draw) {
      draws++;
      continue;
    }
    if (m.winner === player) wins++;
    else losses++;
  }
  return { wins, draws, losses, points: wins * 3 + draws };
}

function getRecord(player, state = {}) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const m of (state.matches || [])) {
    if (!m.done) continue;
    if (m.p1 === 'BYE' || m.p2 === 'BYE') {
      if (m.p1 === player || m.p2 === player) wins++;
      continue;
    }
    if (m.draw) {
      if (m.p1 === player || m.p2 === player) draws++;
      continue;
    }
    if (m.winner === player) wins++;
    else if (m.p1 === player || m.p2 === player) losses++;
  }
  return { wins, draws, losses, points: wins * 3 + draws };
}

function formatRecordLine(record) {
  const safe = record || emptyRecord();
  return `${safe.wins || 0}-${safe.draws || 0}-${safe.losses || 0}`;
}

module.exports = {
  emptyRecord,
  getRecordBeforeRound,
  getRecord,
  formatRecordLine,
};
