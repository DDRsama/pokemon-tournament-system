# Pokemon Tournament System Roadmap

[简体中文](./ROADMAP.md) | English | [日本語](./ROADMAP.ja.md)

## Version 2.2.0

Status: released

Theme: frontend UI polish, full overlay redraw, and overlay structural modularization

### Main Updates

- Refined the home page and tournament entry management experience.
- Reworked the admin page into a clearer single-tournament backend.
- Unified page titles, browser favicon, top branding, and version display.
- Improved home-page tournament actions, player-entry QR codes, delete confirmation, and rename dialogs.
- Cleaned up the admin-side Base URL, overlay, player page, and OBS settings modules.
- Improved Base URL validation to prevent using `localhost` or `127.0.0.1` as a public address by mistake.

### Overlay Updates

- Redesigned the 1920x1080 overlay for OBS and venue-screen usage.
- Redrew Swiss overview, Swiss live table, Swiss result splash, and Swiss-ended views.
- Redrew Top 8 bracket, Top 8 live table, Top 8 result splash, and podium views.
- Improved long player-name handling for both Chinese and English names.
- Added Swiss overview auto-scroll, ranking motion, and large-player-list display support.
- Improved Top 8 advancement paths, winner highlights, target-card transitions, and podium information hierarchy.
- Preserved the transparent-background overlay design for livestream and venue-screen compositing.

### Overlay Architecture

- Rebuilt `/t/<tournamentId>/overlay` as an Overlay Shell + View Registry + lifecycle-managed structure.
- Uses templates and independent Views to manage overlay screens.
- Adds double-buffered transitions to reduce OBS black screens, flicker, and stale-view residue.
- Timers, event listeners, auto-scroll, and animation side effects are cleaned through View lifecycle contexts.
- Same-View state updates prefer `update()` to avoid unnecessary remounts and repeated entrance animations.
- Existing external routes, OBS links, backend APIs, and Docker deployment remain compatible.

### Tournament Flow Fixes

- Added Swiss snapshot rollback and disabled rollback before round 1.
- Fixed Swiss draw result display.
- Fixed ended tournaments still showing as playoff stage on the admin and home pages.
- Fixed report-export paths and APIs under single-tournament routing.
- Fixed tournament binding for overlay, player, and admin pages, including legacy-entry redirects.

## Version 2.2.5-dev.0

Status: source development snapshot, no GitHub Release, no Docker image published

Theme: server-side engineering refactor and unit test expansion

### Planned Scope

- Split the server from one large entry file into app, config, core, storage, reports, realtime, and routes modules.
- Keep user-visible behavior, frontend routes, API paths, and JSON data format compatible with 2.2.0.
- Add native Node.js unit tests for Swiss rounds, standings, Top 8, storage, player views, and report data.
- Tighten low-risk validation for safe tournament IDs, BO3 score ranges, and legal match winners.
- Use this as a source-only foundation for later development; push source and tag only, without publishing Docker Hub images.
## Version 3.0

Status: in development

Theme: tournament engine rewrite, league points, and long-term player identity

### Planned Work

- Move the fixed Swiss + Top 8 single-elimination flow into a configurable tournament stage model.
- Add `schemaVersion: 3`, `tournamentSettings`, `stages`, `matchRules`, and related engine data structures.
- Keep the current default flow as a built-in preset so old tournaments and existing workflows stay usable.
- Generalize BO1 / BO3 / BO5 match result handling.
- Add a server-side player registry, separating long-term player profiles from per-tournament entries.
- Allow guest entrants to play, while excluding unbound guests from league / season points.
- Add baseline league / season, points profile, ranked event, and leaderboard support.
- Gradually adapt home, admin, player, overlay, and report flows to the new tournament engine view models.
- Add tests for migration, stage advancement, BO handling, player profiles, guest entrants, and league points.

### Later Themes

- Language system.
- Theme system.
- Overlay componentization and theme preparation.
- Complete UI for group stages, double elimination, team events, and other expanded formats.

## Version 3.1

Status: in development

Theme: experience polish, visual cleanup, and deployment reliability

### Planned Scope

- Keep the standalone `/player/` player-center entry, installable from phone home screens.
- Keep Docker `/data` single-directory persistence to simplify Synology and single-container deployment.
- Compact the player-center layout while preserving login, registration, return-to-match, and report-export flows.
- Fix overlay internal English labels, TopN wording, completed-event podium priority, score visuals, animation clipping, and overflowing labels.
- Polish admin group-stage visibility, waiting-opponent disabled states, overlay-preview clarity, and home profile-manager list density.
- Update README files and release notes, restoring the three-language changelog format.

### Out Of Scope

- No full theme system.
- No real account-login system.
- No new core tournament-format model.
- No overlay architecture rewrite.

## Version 3.x

Theme: language system, theme system, and expanded formats

### Language System

- Add a frontend text dictionary for Chinese, English, and Japanese UI labels.
- Keep tournament names and player names unchanged while translating system labels.
- Prepare home, admin, player, and overlay pages for language switching.

### Theme System

- Separate theme tokens from layout themes.
- Theme tokens cover colors, shadows, borders, typography, logo assets, transparency, and motion timing.
- Layout themes may change component structure and information hierarchy, not only colors.
- Official-style scorebug layouts should become future layout themes, not simple recolors of the current community-event style.
