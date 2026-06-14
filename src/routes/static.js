function registerStaticRoutes(app, deps) {
  const {
    express,
    path,
    PUBLIC_DIR,
    sendTournamentPage,
  } = deps;

app.use('/home', express.static(path.join(PUBLIC_DIR, 'home')));
app.use('/shared', express.static(path.join(PUBLIC_DIR, 'shared')));
app.use(['/admin', '/overlay', '/player', '/player-login'], (req, res) => res.redirect(302, '/'));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'home', 'index.html')));
app.get('/t/:id/admin', (req, res) => sendTournamentPage(req, res, 'admin'));
app.get('/t/:id/overlay', (req, res) => sendTournamentPage(req, res, 'overlay'));
app.get('/t/:id/player-login', (req, res) => sendTournamentPage(req, res, 'player'));
}

module.exports = { registerStaticRoutes };
