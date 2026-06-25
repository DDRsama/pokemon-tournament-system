const { normalizeEngineState } = require('./rules');

function migrateTournamentState(rawState = {}) {
  return normalizeEngineState(rawState || {});
}

function migrateTournamentListItem(rawState = {}) {
  const state = migrateTournamentState(rawState);
  return {
    id: state._id || null,
    name: state.tournamentName || '未命名比赛',
    schemaVersion: state.schemaVersion,
    presetId: state.tournamentSettings.presetId,
  };
}

module.exports = {
  migrateTournamentState,
  migrateTournamentListItem,
};
