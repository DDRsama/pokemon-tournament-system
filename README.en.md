# Pokemon Tournament System

[简体中文](./README.md) | English | [日本語](./README.ja.md) | [Roadmap](./ROADMAP.en.md)

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-ddrsama%2Fpokemon--tournament--system-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/ddrsama/pokemon-tournament-system)
[![Docker Pulls](https://img.shields.io/docker/pulls/ddrsama/pokemon-tournament-system?logo=docker&label=pulls)](https://hub.docker.com/r/ddrsama/pokemon-tournament-system)
[![Docker Image Size](https://img.shields.io/docker/image-size/ddrsama/pokemon-tournament-system/latest?logo=docker&label=image%20size)](https://hub.docker.com/r/ddrsama/pokemon-tournament-system/tags)
[![Release](https://img.shields.io/github/v/release/DDRsama/pokemon-tournament-system?label=release)](https://github.com/DDRsama/pokemon-tournament-system/releases)
[![License](https://img.shields.io/github/license/DDRsama/pokemon-tournament-system)](https://github.com/DDRsama/pokemon-tournament-system/blob/main/LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/DDRsama/pokemon-tournament-system)](https://github.com/DDRsama/pokemon-tournament-system/commits/main)

`Pokemon Tournament System`, or `PTS`, is a tournament management system for offline Pokemon events. It was originally designed around Pokemon VGC events, but its core flow also fits PTCG, Yu-Gi-Oh, and other self-hosted events that use Swiss rounds.

PTS combines admin management, livestream overlays, player-facing mobile pages, Swiss rounds, Top 8 playoffs, report export, and Docker deployment in one system.

Latest stable version: `3.2.0`

Current beta version: none

Release channels:

- `latest`: stable Docker image
- `beta`: beta Docker image
- Tags such as `3.3.0-beta`: pinned beta image
- Tags such as `3.2.0`: pinned stable image

Roadmap: [ROADMAP.en.md](./ROADMAP.en.md)

## Purpose

PTS started as a simple livestream overlay, then grew into a full tournament toolchain. It is designed for:

- Organizers who need to manage players, rounds, matches, live tables, and reports
- Stream operators who need an OBS-ready browser overlay
- Players who need a mobile page for registration, pairing lookup, result submission, and personal reports
- Local community tournaments, monthly events, store events, and self-hosted Swiss-round events

## Core Features

### Admin

- Add players manually
- Import players in bulk
- Remove players
- Rename tournaments
- Configure live-room codes
- Configure the public access URL
- Preview overlays
- Export reports

### Swiss Rounds

- Configure Swiss round count
- Generate pairings automatically
- Record wins, losses, and draws
- Handle drops
- Rank players by match points and tiebreakers
- Confirm Top 8 after Swiss rounds

### Ranking And Tiebreakers

- Sort by match points
- Sort by opponent win rate
- Sort by opponents' opponent win rate
- Support common offline-event drop handling

### Top 8 Playoffs

- Manage Top 8 bracket matches
- Record BO3 game wins
- Advance semifinals, finals, and bronze match automatically
- Set live tables
- Sync overlay display

### Player Page

- Enter a tournament through QR code
- Register or log in as a player
- View current table and opponent
- View current record
- View pairing history and results
- Submit wins
- View live-room code
- Export personal reports after the event
- Open `/player/` as a standalone player center and install it on the phone home screen

### Reports And Records

- Export a full tournament report after the event

  <img width="50%" alt="Tournament report example" src="https://github.com/user-attachments/assets/2c6aeeb6-c28f-4c98-9f4a-dfefacef807f" />

- Export personal reports after winning, dropping, being eliminated, or finishing Swiss rounds

  <img width="20%" alt="Personal report example" src="https://github.com/user-attachments/assets/f8cbd2ae-2457-4ae2-accc-f2658abeac0d" />

- Keep records for Swiss rounds and Top 8 playoffs

## Pages

### 0. Home

<img width="1598" height="1163" alt="Home page" src="https://github.com/user-attachments/assets/40079de9-65a7-4d13-bd15-6a1f17eefb0e" />

Path:

```text
/
```

Used for:

- Creating tournaments
- Renaming or deleting tournaments
- Entering a tournament admin page
- Copying player and overlay links

### 1. Admin

<img width="48%" alt="Admin page" src="https://github.com/user-attachments/assets/36940de0-4a06-4884-8de9-1228a10d306e" />
<img width="48%" alt="Admin page" src="https://github.com/user-attachments/assets/925e794a-7872-4e8b-9cff-bd4ef447a61a" />
<img width="48%" alt="Admin page" src="https://github.com/user-attachments/assets/7b1fe3cc82c40723908c8356811eb53a" />
<img width="48%" alt="Admin page" src="https://github.com/user-attachments/assets/7676ad6f-c6fb-4ab7-90a3-20c0549f9376" />

Path:

```text
/t/<tournamentId>/admin
```

Used for tournament flow, players, rounds, results, overlay preview, and reports.

### 2. Overlay

<img width="48%" alt="Overlay" src="https://github.com/user-attachments/assets/872f54ca-6444-4357-98b9-92be58d93ffd" />
<img width="48%" alt="Overlay" src="https://github.com/user-attachments/assets/1d36aeb7-8f91-4b9e-b290-fba2eb1874aa" />
<img width="48%" alt="Overlay" src="https://github.com/user-attachments/assets/91a9801e-1c5d-4392-a5f0-93b021715eab" />
<img width="48%" alt="Overlay" src="https://github.com/user-attachments/assets/714afa6e-13a2-44e4-9724-92f1dc738417" />

Path:

```text
/t/<tournamentId>/overlay
```

Used for:

- OBS browser-source integration
- Live table display
- Tournament overview display
- Top 8 bracket display

### 3. Player Page

<img width="24%" alt="Player page" src="https://github.com/user-attachments/assets/459c4488-be7a-4555-ba20-a4fd29c77994" />
<img width="24%" alt="Player page" src="https://github.com/user-attachments/assets/5d651856-cb23-4ce5-8a21-e51f90bdd7af" />
<img width="24%" alt="Player page" src="https://github.com/user-attachments/assets/bdfe0a30-5c33-44da-91e4-e54e8d769864" />
<img width="24%" alt="Player page" src="https://github.com/user-attachments/assets/1da1c121-dad0-40c1-84a9-434d56bde1f2" />

Path:

```text
/t/<tournamentId>/player-login
```

Used for QR-code entry, registration, login, pairing lookup, history, and win submission.

### 4. Player Center

Path:

```text
/player/
```

Used for:

- Entering the player center from a phone home-screen icon or a stable link outside tournament time
- Logging into a player profile through the current lightweight name-confirmation flow
- Viewing current tournaments, open registration entries, and personal report history
- Installing the entry on iOS Safari and Android Chrome

## Project Structure

- `src/`
  Server-side logic
- `public/admin/`
  Admin page
- `public/overlay/`
  Livestream overlay page
- `public/player/`
  Player-facing page
- `public/player-center/`
  Standalone player center and phone home-screen entry
- `public/shared/`
  Shared styles, QR-code script, fonts, and assets
- `data/`
  Local tournament data and reports

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Install Python report dependency

Report export requires Python and `reportlab`.

```bash
pip install reportlab
```

### 3. Start the server

```bash
npm start
```

Default port:

```text
18765
```

After startup:

- Home: `/`
- Admin: `/t/<tournamentId>/admin`
- Overlay: `/t/<tournamentId>/overlay`
- Player page: `/t/<tournamentId>/player-login`
- Player center: `/player/`

Examples:

- `http://localhost:18765/`
- `http://localhost:18765/t/t_123456/admin`
- `http://localhost:18765/t/t_123456/overlay`
- `http://localhost:18765/t/t_123456/player-login`
- `http://localhost:18765/player/`

Legacy entries `/admin`, `/overlay`, and `/player-login` redirect to the home page. `/player` and `/player/` are the standalone player-center entry.

## Docker Deployment

### Docker Hub image

```bash
docker pull ddrsama/pokemon-tournament-system:latest
```

You can also pull beta:

```bash
docker pull ddrsama/pokemon-tournament-system:beta
```

You can also pin a specific version:

```bash
docker pull ddrsama/pokemon-tournament-system:3.2.0
```

### Local Development Docker Compose

```bash
docker compose up -d --build
```

This builds the image directly from the current workspace.

### Stable Docker Compose Deployment

```bash
docker compose -f docker-compose.deploy.yml up -d
```

To pin a specific stable image:

```bash
PTS_TAG=3.2.0 docker compose -f docker-compose.deploy.yml up -d
```

### Beta Docker Compose Deployment

```bash
docker compose -f docker-compose.deploy.yml -f docker-compose.deploy.beta.yml up -d
```

Default port:

```text
18765:18765
```

Docker Compose stores persistent data under `./data` by default:

- `./data/tournaments`
- `./data/players`
- `./data/leagues`
- `./data/points`
- `./data/reports`

## GitHub And Docker Releases

The repository supports two release channels:

- Stable GitHub Release:
  publishes `x.y.z` and `latest`
- GitHub pre-release:
  publishes `x.y.z-beta` and `beta`
- Manual GitHub Actions dispatch:
  can push an additional beta image

## Environment Variables

- `PORT`
  Server port, default `18765`
- `PUBLIC_BASE_URL`
  Public access URL used for QR codes and player links
- `DATA_ROOT`
  Data root directory. Defaults to `/data` in Docker
- `DATA_DIR`
  Tournament data directory
- `PLAYERS_DIR`
  Player profile directory
- `LEAGUES_DIR`
  League directory
- `POINTS_DIR`
  Points profile directory
- `REPORTS_DIR`
  Report output directory
- `PYTHON_BIN`
  Python executable path. In Docker, the default is `/usr/local/bin/python`

## Fonts And Reports

The project includes a UI font based on the Pokemon game style:

- `public/shared/fonts/ud-shin-go-sc-r.ttf`

Report export tries to use available Chinese fonts first. The Docker image includes Chinese fonts and the `reportlab` runtime.

## Roadmap

Future plans are available in [ROADMAP.en.md](./ROADMAP.en.md).

## Suitable Usage

- Local network desktop management
- Docker deployment
- OBS browser-source overlay
- Player mobile QR-code access

## Development Notes

This project has been developed and refined with Codex-assisted iteration. Many workflow, integration, testing, and repair tasks were completed through collaboration with GPT-5.5.

## Acknowledgements

Special thanks to [ssccinng](https://github.com/ssccinng) for generous sponsorship and support.
