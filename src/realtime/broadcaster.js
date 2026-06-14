function createBroadcaster({ getWebSocketServer, buildState, persistCache }) {
  function broadcast() {
    if (persistCache) persistCache();
    const state = buildState();
    const msg = JSON.stringify({ type: 'state', data: state });
    const wss = getWebSocketServer();
    if (!wss) return;
    wss.clients.forEach(ws => {
      if (ws.tournamentId !== state.tournamentId) return;
      try {
        ws.send(msg);
      } catch (err) {
        // Ignore broken socket sends; ws cleanup is handled by the server.
      }
    });
  }

  return { broadcast };
}

module.exports = { createBroadcaster };
