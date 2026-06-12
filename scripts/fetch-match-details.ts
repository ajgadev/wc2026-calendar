/**
 * Build-time card archive (ESPN public scoreboard JSON, no key).
 * For every finished match not yet archived: pull the day's scoreboard,
 * match events to our schedule by team codes, and persist yellow/red
 * cards keyed by match number. Cards are immutable once a match is
 * final, so each match is fetched exactly once across daily runs.
 *
 * Output: public/data/matchDetails.json — { [matchN]: { cards: [...] } }
 * Committed back to the repo by the daily Action (same pattern as
 * players.json).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/data/matchDetails.json');
const UA = 'wc2026-calendar/1.0 (build-time card archive)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { MATCHES } = await import('../src/data/schedule');
const { STADIUMS } = await import('../src/data/stadiums');
const { venueDate } = await import('../src/lib/time');
const { ESPN_SCOREBOARD, matchEspnEventToMatch, parseEspnCards } = await import('../src/lib/cards');
type Archive = import('../src/lib/cards').MatchDetailsArchive;
type EspnEvent = import('../src/lib/cards').EspnEvent;

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429) {
        console.warn('[cards] rate-limited — backing off 20s');
        await sleep(20_000);
        continue;
      }
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch { /* retry */ }
    await sleep(1500);
  }
  return null;
}

let archive: Archive = {};
try {
  archive = JSON.parse(readFileSync(OUT, 'utf8'));
} catch { /* first run */ }

const now = Date.now();
const pending = MATCHES.filter(
  (m) => m.ft && m.a && m.b && !archive[String(m.n)] && Date.parse(m.utc) < now,
);

if (pending.length === 0) {
  console.log('[cards] archive up to date');
  if (!existsSync(OUT)) {
    mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
    writeFileSync(OUT, '{}');
  }
} else {
  console.log(`[cards] ${pending.length} finished matches to archive`);
  const remaining = new Map(pending.map((m) => [m.n, m]));

  // ESPN buckets matches by US-Eastern-ish dates, so try both the
  // venue-local and the UTC date for each pending match.
  const days = new Set<string>();
  for (const m of pending) {
    days.add(venueDate(m.utc, STADIUMS[m.stadium].timezone));
    days.add(m.utc.slice(0, 10));
  }

  for (const day of [...days].sort()) {
    if (remaining.size === 0) break;
    const data = await getJson<{ events?: EspnEvent[] | null }>(
      `${ESPN_SCOREBOARD}?dates=${day.replace(/-/g, '')}`,
    );
    await sleep(600);
    for (const event of data?.events ?? []) {
      // only archive once ESPN also says the match is over
      if (!/full[_ -]?time|final/i.test(event.status?.type?.name ?? '')) continue;
      const hit = matchEspnEventToMatch(event, [...remaining.values()]);
      if (!hit) continue;
      const cards = parseEspnCards(event, hit.homeIsA, hit.homeTeamId);
      archive[String(hit.match.n)] = { cards };
      remaining.delete(hit.match.n);
      console.log(`[cards] match ${hit.match.n} (${hit.match.a} v ${hit.match.b}): ${cards.length} cards`);
      // incremental write — progress survives a killed run
      mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
      writeFileSync(OUT, JSON.stringify(archive, null, 1));
    }
  }
  console.log(`[cards] archive now covers ${Object.keys(archive).length} matches`);
}
