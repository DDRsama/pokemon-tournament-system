const { WebSocketServer } = require('ws');

function attachTournamentWebSocket(server, { syncTournamentRequest, buildClientState }) {
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const routeMatch = url.pathname.match(/^\/t\/([^/]+)\/ws\/?$/);
    const tournamentId = routeMatch ? decodeURIComponent(routeMatch[1]).trim() : '';
    ws.tournamentId = tournamentId;
    if (!tournamentId || !syncTournamentRequest(tournamentId)) {
      ws.send(JSON.stringify({ type: 'error', err: 'tournament not found' }));
      ws.close();
      return;
    }
    ws.send(JSON.stringify({ type: 'state', data: buildClientState() }));
  });
  return wss;
}

module.exports = { attachTournamentWebSocket };
