function registerStaticRoutes(app, deps) {
  const {
    express,
    path,
    PUBLIC_DIR,
    sendTournamentPage,
  } = deps;

  const noStore = (req, res, next) => {
    res.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  };

  app.use('/home', noStore, express.static(path.join(PUBLIC_DIR, 'home')));
  app.use('/shared', express.static(path.join(PUBLIC_DIR, 'shared')));
  app.use('/admin', noStore, express.static(path.join(PUBLIC_DIR, 'admin'), { index: false }));
  app.use('/player', noStore, express.static(path.join(PUBLIC_DIR, 'player-center'), { index: false }));
  app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'home', 'index.html')));
  app.get(['/player', '/player/'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'player-center', 'index.html')));
  app.get(['/admin', '/admin/', '/overlay', '/overlay/', '/player-login', '/player-login/'], (req, res) => res.redirect(302, '/'));
  app.get('/t/:id/admin', (req, res) => sendTournamentPage(req, res, 'admin'));
  app.get('/t/:id/overlay', (req, res) => sendTournamentPage(req, res, 'overlay'));
  app.get('/t/:id/player-login', (req, res) => sendTournamentPage(req, res, 'player'));
}

module.exports = { registerStaticRoutes };
