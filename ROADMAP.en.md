# Pokemon Tournament System Roadmap

[简体中文](./ROADMAP.md) | English | [日本語](./ROADMAP.ja.md)

## Version 2.2

Status: in progress

Theme: visual refresh, overlay stability, and maintainability

### Main Goals

- Improve the frontend UI across the home page, admin page, and player page.
- Fully redraw the overlay frontend for livestream and venue-screen usage.
- Modularize the overlay structure so each overlay screen can be maintained independently.
- Preserve existing external routes, OBS links, backend APIs, and the 1920x1080 transparent overlay contract.

### Completed Or Mostly Completed

- Home and admin visual polish.
- Unified page titles, favicon, and top branding.
- Home page tournament actions, QR-code player entry, and in-page modals.
- Admin right-side overlay/player/OBS information area cleanup.
- Podium overlay visual redesign.
- Top 8 bracket visual redesign.
- Top 8 bracket animation and behavior fixes.
- Top 8 live table visual redesign.
- Swiss live table visual redesign.
- Swiss and Top 8 result splash visual updates.
- Swiss rollback snapshot behavior, with rollback disabled before round 1.

### Overlay Modularization Plan

- Rebuild `/t/<tournamentId>/overlay` as an Overlay Shell plus independent Views.
- `index.html` becomes the shell and keeps `#overlay-root`, `#overlay-buffer`, shared containers, and inert view templates.
- No runtime HTML fetching, no Vue/React, and no build tool.
- Each View owns `init()`, `update()`, and `destroy()`.
- View side effects must go through `ViewContext`.
- Timers, event listeners, animation locks, auto-scroll, and confetti cleanup must be destroyed when a View leaves.
- View switching uses double buffering to avoid OBS black screen and layout flicker.
- Repeated state updates within the same View must call `update()` instead of remounting.

### Required Views

- `idle`
- `swiss-live`
- `swiss-result`
- `swiss-overview`
- `swiss-ended`
- `top8-live`
- `top8-result`
- `top8-bracket`
- `podium`
- `error`

Temporary compatibility:

- `top8-overview` as fallback only.

### Remaining 2.2 Work

- Finish overlay modularization without visual regression.
- Finish Swiss overview visual tuning after modularization.
- Refresh Swiss-ended and idle/signup overlay views.
- Clean duplicated overlay CSS and old `display:none` router logic.
- Verify key flows in browser and OBS after the architecture change.

## Version 2.3

Theme: post-modularization cleanup and component preparation

### Main Goals

- Turn the modularized overlay into a cleaner long-term codebase.
- Extract reusable overlay components.
- Prepare for theme and language systems without changing behavior.

### Planned Work

- Shared components for player nameplates, score blocks, phase labels, logo placement, connector lines, result badges, and QR blocks.
- Split CSS into base, components, and view-specific files.
- Reduce duplicated selectors and state-specific special cases.
- Add stricter naming conventions for overlay classes.
- Improve state routing tests and view lifecycle checks.
- Document OBS-safe rendering rules.

## Version 2.4

Theme: themes, languages, and tournament setup options

### Theme System

- Separate theme tokens from layout themes.
- Theme tokens cover colors, shadows, borders, typography, logo assets, transparency, and motion timing.
- Layout themes may change component structure, not only colors.
- Official-style scorebug should become a future layout theme, not a simple recolor of the current community-event style.

### Language System

- Add a frontend text dictionary for Chinese, English, and Japanese UI labels.
- Keep tournament names and player names unchanged while translating system labels.
- Prepare home, admin, player, and overlay pages for language switching.

### Tournament Creation Settings

- Add structured tournament settings during creation.
- Planned settings include Swiss BO count, Top 8 enabled/disabled, Top 8 BO count, open/hidden team-list mode, and future entertainment-event formats.
