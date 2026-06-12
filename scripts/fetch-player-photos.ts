/**
 * Build-time squad + player-photo pipeline.
 *
 *  1. Squads: football-data.org GET /v4/competitions/WC/teams (one
 *     request, free tier). Cached into src/data/generated/squads.json so
 *     dev rebuilds don't re-hit the API.
 *  2. Photos: Wikipedia pageimages (free, no key, fine to hotlink
 *     Wikimedia thumbs), retried with "(footballer)" on a miss; fallback
 *     to TheSportsDB strCutout/strThumb; final fallback is null → the UI
 *     renders an initials avatar (never a broken image).
 *
 * Output: public/data/players.json — { teamCode: [{ name, position,
 * shirtNumber, dob, photoUrl|null }] }, fetched lazily by the team
 * drawer. Squads freeze once the tournament starts, so this runs in the
 * daily rebuild at zero runtime cost.
 *
 * Without FOOTBALL_DATA_TOKEN: keeps whatever was generated before and
 * exits with a warning (never fails the build).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SQUADS_CACHE = resolve(ROOT, 'src/data/generated/squads.json');
const PLAYERS_OUT = resolve(ROOT, 'public/data/players.json');
const UA = 'wc2026-calendar/1.0 (build-time photo pipeline; contact: site owner)';

interface FdPlayer { name: string; position: string | null; dateOfBirth: string | null; shirtNumber?: number | null }
interface FdTeam { name: string; tla?: string; squad?: FdPlayer[]; coach?: { name?: string } }
interface PlayerOut { name: string; position: string; shirtNumber: number | null; dob: string | null; photoUrl: string | null }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Same alias logic as src/data/teamNames.ts, duplicated minimally so the
// script stays runnable standalone via tsx without Vite-specific imports.
const { TEAMS } = await import('../src/data/teams');
const { teamCodeFor } = await import('../src/data/teamNames');

async function loadSquads(token: string | undefined): Promise<Record<string, FdTeam> | null> {
  if (existsSync(SQUADS_CACHE)) {
    try {
      const cached = JSON.parse(readFileSync(SQUADS_CACHE, 'utf8'));
      if (cached && Object.keys(cached).length > 0) {
        console.log('[squads] using cached squads.json');
        return cached;
      }
    } catch { /* fall through to fetch */ }
  }
  if (!token) {
    console.warn('[squads] WARNING: FOOTBALL_DATA_TOKEN not set and no cache — skipping squad generation');
    return null;
  }
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/teams', {
    headers: { 'X-Auth-Token': token },
  });
  if (!res.ok) {
    console.warn(`[squads] WARNING: upstream ${res.status} — skipping squad generation`);
    return null;
  }
  const data = (await res.json()) as { teams?: FdTeam[] };
  const byCode: Record<string, FdTeam> = {};
  for (const t of data.teams ?? []) {
    const code = (t.tla && TEAMS[t.tla] ? t.tla : null) ?? teamCodeFor(t.name);
    if (code) byCode[code] = t;
    else console.warn(`[squads] unmatched team: "${t.name}"`);
  }
  mkdirSync(resolve(ROOT, 'src/data/generated'), { recursive: true });
  writeFileSync(SQUADS_CACHE, JSON.stringify(byCode, null, 1));
  console.log(`[squads] cached ${Object.keys(byCode).length} squads`);
  return byCode;
}

/** Throttled fetch with 429/403 backoff — Wikipedia rate-limits bursts. */
let throttleUntil = 0;
async function politeFetch(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = throttleUntil - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status === 403) {
        const retryAfter = Number(res.headers.get('Retry-After')) || 8 * (attempt + 1);
        console.warn(`[photos] rate-limited (${res.status}) — backing off ${retryAfter}s`);
        throttleUntil = Date.now() + retryAfter * 1000;
        continue;
      }
      return res;
    } catch { /* network blip — retry */ }
    await sleep(1000);
  }
  return null;
}

async function wikipediaPhoto(name: string): Promise<string | null> {
  for (const title of [name, `${name} (footballer)`]) {
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=400&format=json&redirects=1&titles=' +
      encodeURIComponent(title);
    const res = await politeFetch(url);
    if (res?.ok) {
      try {
        const data = (await res.json()) as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } };
        const pages = Object.values(data.query?.pages ?? {});
        const src = pages[0]?.thumbnail?.source;
        if (src) return src;
      } catch { /* malformed — try next title */ }
    }
    await sleep(250); // ~4 req/s, politely
  }
  return null;
}

async function sportsDbPhoto(name: string): Promise<string | null> {
  try {
    const res = await politeFetch(
      `https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=${encodeURIComponent(name)}`,
    );
    if (!res?.ok) return null;
    const data = (await res.json()) as { player?: { strSport?: string; strCutout?: string; strThumb?: string }[] };
    const p = (data.player ?? []).find((x) => x.strSport === 'Soccer');
    return p?.strCutout || p?.strThumb || null;
  } catch {
    return null;
  }
}

const POSITION_MAP: Record<string, string> = {
  'Goalkeeper': 'GK',
  'Defence': 'DEF', 'Defender': 'DEF', 'Centre-Back': 'DEF', 'Left-Back': 'DEF', 'Right-Back': 'DEF',
  'Midfield': 'MID', 'Midfielder': 'MID', 'Defensive Midfield': 'MID', 'Central Midfield': 'MID', 'Attacking Midfield': 'MID',
  'Offence': 'FWD', 'Forward': 'FWD', 'Attacker': 'FWD', 'Centre-Forward': 'FWD', 'Left Winger': 'FWD', 'Right Winger': 'FWD',
};

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  const squads = await loadSquads(token);
  if (!squads) {
    if (!existsSync(PLAYERS_OUT)) {
      mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
      writeFileSync(PLAYERS_OUT, '{}');
    }
    return;
  }

  // Reuse previously found photos so the daily rebuild only looks up new players.
  let previous: Record<string, PlayerOut[]> = {};
  try {
    previous = JSON.parse(readFileSync(PLAYERS_OUT, 'utf8'));
  } catch { /* first run */ }
  const knownPhoto = new Map<string, string | null>();
  for (const list of Object.values(previous)) {
    for (const p of list) knownPhoto.set(p.name, p.photoUrl);
  }

  const out: Record<string, PlayerOut[]> = {};
  for (const [code, team] of Object.entries(squads)) {
    const players: PlayerOut[] = [];
    for (const p of team.squad ?? []) {
      let photoUrl = knownPhoto.get(p.name) ?? null;
      if (!knownPhoto.has(p.name) || photoUrl === null) {
        photoUrl = (await wikipediaPhoto(p.name)) ?? (await sportsDbPhoto(p.name));
        await sleep(120);
      }
      players.push({
        name: p.name,
        position: POSITION_MAP[p.position ?? ''] ?? 'MID',
        shirtNumber: p.shirtNumber ?? null,
        dob: p.dateOfBirth ?? null,
        photoUrl,
      });
    }
    out[code] = players;
    console.log(`[photos] ${code}: ${players.length} players, ${players.filter((x) => x.photoUrl).length} photos`);
  }

  mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
  writeFileSync(PLAYERS_OUT, JSON.stringify(out));
  console.log(`[photos] wrote ${PLAYERS_OUT}`);
}

await main();
