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
## Version 2.3

Theme: post-modularization cleanup and component preparation

### Planned Work

- Continue cleaning the modularized overlay structure and reduce legacy compatibility code.
- Extract shared components for player nameplates, score blocks, phase labels, logo zones, connector lines, result badges, and QR blocks.
- Split overlay CSS further into base, components, and view-specific styles.
- Improve checks around state routing, View lifecycle, and OBS-safe rendering.
- Prepare the codebase for future theme systems, language systems, and richer tournament settings.

## Version 2.4

Theme: themes, languages, and tournament setup options

### Theme System

- Separate theme tokens from layout themes.
- Theme tokens cover colors, shadows, borders, typography, logo assets, transparency, and motion timing.
- Layout themes may change component structure and information hierarchy, not only colors.
- Official-style scorebug layouts should become future layout themes, not simple recolors of the current community-event style.

### Language System

- Add a frontend text dictionary for Chinese, English, and Japanese UI labels.
- Keep tournament names and player names unchanged while translating system labels.
- Prepare home, admin, player, and overlay pages for language switching.

### Tournament Creation Settings

- Add structured tournament settings during creation.
- Planned settings include Swiss BO count, Top 8 enabled/disabled, Top 8 BO count, open/hidden team-list mode, and future entertainment-event formats.
