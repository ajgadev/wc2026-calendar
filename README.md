# MATCHDAY26 — World Cup 2026 Live Calendar

Every match of the 2026 World Cup (USA · Mexico · Canada, Jun 11 – Jul 19) on one
calendar: live scores, bracket, standings, stats, team drawers with squads, and an
iCalendar feed. Built from `PROMPT.md` with the "Lower Third" design direction from
the Claude Design handoff in `design/`. Everything runs on free tiers.

## Stack

- **Astro 5** (static output) + **Cloudflare adapter** — only `/api/*` runs on-demand
- **Tailwind CSS v4** (CSS-first tokens in `src/styles/global.css` via `@theme`)
- **React islands** for interactivity only: filter bar, live-score poller, drawer, tweaks
- **TypeScript** throughout · deploys to **Cloudflare Pages** (free tier)

## Quickstart

```sh
npm install
cp .env.example .env       # optional: add FOOTBALL_DATA_TOKEN / YOUTUBE_API_KEY
npm run dev                # http://localhost:4321
npm run build              # refreshes data, then builds to dist/
```

Without any tokens the site fully works from the static layer (schedule, results
baked at build time, RSS highlights). Tokens add: live scores + top scorers
(`FOOTBALL_DATA_TOKEN`, free at football-data.org) and the durable highlight
archive + squad photos (`YOUTUBE_API_KEY`, free Google Cloud key).

## Data architecture

| Layer | Source | When | Where |
|---|---|---|---|
| Schedule & results | openfootball worldcup.json | build (daily) | `scripts/refresh-schedule.ts` → `src/data/schedule.ts` |
| Stadiums/hosts | hardcoded (16 venues) | build | `src/data/stadiums.ts` |
| Live scores | football-data.org | runtime, 60s cache | `src/pages/api/live.ts` → `LiveOverlay` island |
| Team details | TheSportsDB (CORS-friendly) | on click, sessionStorage cache | `Drawer` island |
| Squads & photos | football-data.org + Wikipedia | build (daily) | `scripts/fetch-player-photos.ts` → `public/data/players.json` |
| Highlights | MagentaSport RSS + YouTube Data API | runtime 30min cache + build archive | `api/highlights.ts`, `scripts/fetch-highlights.ts` |
| Cards (yellow/red) | TheSportsDB timelines | daily archive + browser fallback | `scripts/fetch-match-details.ts`, drawer island |

Key invariants:

- **≤1 upstream request/min** to football-data.org regardless of visitors
  (Cloudflare Cache API + in-memory cache + `Cache-Control` on `/api/live`).
- The poller only runs inside live windows (kickoff −20 min … +150 min) and
  pauses when the tab is hidden.
- Knockout placeholders (`1C`, `W101`) render as readable labels and resolve
  into real teams on the daily rebuild with zero code changes (bracket included).
- Static-first: with JS disabled the calendar/agenda still render (stadium-local
  times, no filters/live). Tokens never reach the client — islands only call `/api/*`.

## Pages & endpoints

- `/` — agenda (mobile default) + month calendar (desktop default), URL-synced filters
- `/bracket` — wallchart R32→Final; mobile gets one round per screen with scroll-snap
- `/standings` — 12 group tables, qualification zones (top 2 + best-third dashed)
- `/stats` — top scorers (API w/ local fallback), goals by group, biggest win, clean sheets
- `/api/calendar.ics?team=GER|group=A` — subscribable feed, stable UIDs, scores in titles
- `/api/live`, `/api/scorers`, `/api/highlights` — cached proxies (60s / 10min / 30min)

## Deploying

1. Cloudflare Pages → connect repo, build command `npm run build`, output `dist`.
2. Set `FOOTBALL_DATA_TOKEN` (and optionally `YOUTUBE_API_KEY`) as encrypted env vars
   on the Pages project (used by the `/api/*` routes at runtime).
3. Add the same two as **GitHub repo secrets**, plus `CLOUDFLARE_DEPLOY_HOOK_URL`
   (Pages → Settings → Deploy hooks). `.github/workflows/daily-rebuild.yml` runs at
   06:15 UTC: it refreshes the schedule, fetches squad photos & the highlight archive
   (with rate-limit backoff and a 20-min budget), and commits the data back — that
   commit triggers the Pages deploy. Photo lookups are skipped inside Pages builds
   (`CF_PAGES` → budget 0): a fresh-cloned build can't persist progress, the Action can.

## Design

Visual spec lives in `design/world-cup-2026-calendar/` (Claude Design handoff):
"Lower Third" direction — broadcast-scoreboard dark theme, host-country color
coding as structure (MX green / US blue / CA red, loud 17% tint by default),
Archivo (stretch 125%, tabular numerals) for scores, IBM Plex Sans/Mono for
body/labels, amber LIVE badge (never red — red means Canada). The motion budget
is exactly two effects: the LIVE pulse and a score-change flash, both disabled
under `prefers-reduced-motion`. The floating Tweaks bar switches theme, text
size and tint loudness.
