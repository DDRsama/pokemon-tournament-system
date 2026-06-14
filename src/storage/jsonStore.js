const fs = require('fs');
const path = require('path');

const SAFE_TOURNAMENT_ID = /^[A-Za-z0-9_-]+$/;

function isSafeTournamentId(id) {
  return SAFE_TOURNAMENT_ID.test(String(id || ''));
}

function assertSafeTournamentId(id) {
  if (!isSafeTournamentId(id)) {
    throw new Error('invalid tournament id');
  }
}

function createJsonStore({ dataDir, displayPhaseForTournament }) {
  fs.mkdirSync(dataDir, { recursive: true });

  function tournamentFilePath(id) {
    assertSafeTournamentId(id);
    return path.join(dataDir, `${id}.json`);
  }

  function exists(id) {
    if (!isSafeTournamentId(id)) return false;
    return fs.existsSync(tournamentFilePath(id));
  }

  function load(id) {
    const filePath = tournamentFilePath(id);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function save(id, state) {
    fs.writeFileSync(tournamentFilePath(id), JSON.stringify(state, null, 2));
  }

  function remove(id) {
    const filePath = tournamentFilePath(id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  function list() {
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    return files
      .map(file => {
        const id = file.replace(/\.json$/, '');
        if (!isSafeTournamentId(id)) return null;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
          return {
            id,
            name: data.tournamentName,
            phase: displayPhaseForTournament(data),
            date: data._createdAt,
          };
        } catch (err) {
          console.warn(`Skipping invalid tournament file ${file}: ${err.message}`);
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.date - a.date);
  }

  return {
    tournamentFilePath,
    exists,
    load,
    save,
    remove,
    list,
  };
}

module.exports = {
  SAFE_TOURNAMENT_ID,
  isSafeTournamentId,
  assertSafeTournamentId,
  createJsonStore,
};
