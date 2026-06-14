const { registerStaticRoutes } = require('./static');
const { registerTournamentsRoutes } = require('./tournaments');
const { registerPlayersRoutes } = require('./players');
const { registerSwissRoutes } = require('./swiss');
const { registerTop8Routes } = require('./top8');
const { registerMatchesRoutes } = require('./matches');
const { registerReportsRoutes } = require('./reports');

function registerRoutes(app, deps) {
  registerStaticRoutes(app, deps);
  registerTournamentsRoutes(app, deps);
  registerPlayersRoutes(app, deps);
  registerSwissRoutes(app, deps);
  registerTop8Routes(app, deps);
  registerMatchesRoutes(app, deps);
  registerReportsRoutes(app, deps);
}

module.exports = { registerRoutes };
