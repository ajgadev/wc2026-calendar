/**
 * Build-time card archive (TheSportsDB free tier).
 * For every finished match not yet archived: find the TheSportsDB event
 * for that day, pull its timeline, and persist the yellow/red cards
 * keyed by match number. Cards are immutable once a match is final, so
 * each match is fetched exactly once across all daily runs.
 *
 * Output: public/data/matchDetails.json — { [matchN]: { cards: [...] } }
 * Committed back to the repo by the daily Action (same pattern as
 * players.json). No API key needed.
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
const { matchEventToMatch, parseTimelineCards } = await import('../src/lib/cards');
type Archive = import('../src/lib/cards').MatchDetailsArchive;
type Event = import('../src/lib/cards').SdbEvent;

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

  // Event sources, most reliable first: the league's recent results
  // (one call), then per-day listings — TheSportsDB files late-evening
  // venue kickoffs under the UTC date, so try both candidate days.
  const WC_LEAGUE_ID = 4429;
  const eventBatches: (() => Promise<Event[]>)[] = [
    async () => {
      const data = await getJson<{ events?: Event[] | null }>(
        `https://www.thesportsdb.com/api/v1/json/123/eventspastleague.php?id=${WC_LEAGUE_ID}`,
      );
      return data?.events ?? [];
    },
  ];
  const days = new Set<string>();
  for (const m of pending) {
    days.add(venueDate(m.utc, STADIUMS[m.stadium].timezone));
    days.add(m.utc.slice(0, 10));
  }
  for (const day of [...days].sort()) {
    eventBatches.push(async () => {
      const data = await getJson<{ events?: Event[] | null }>(
        `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${day}&s=Soccer`,
      );
      return data?.events ?? [];
    });
  }

  for (const batch of eventBatches) {
    if (remaining.size === 0) break;
    const events = await batch();
    await sleep(600);
    for (const event of events) {
      const hit = matchEventToMatch(event, [...remaining.values()]);
      if (!hit) continue;
      const tl = await getJson<{ timeline?: import('../src/lib/cards').SdbTimelineEntry[] | null }>(
        `https://www.thesportsdb.com/api/v1/json/123/lookuptimeline.php?id=${event.idEvent}`,
      );
      await sleep(600);
      const timeline = tl?.timeline ?? [];
      // Empty timelines for very recent matches may just be lag — only
      // persist those once the match is >48h old (then it's truly empty).
      const matchAge = now - Date.parse(MATCHES.find((m) => m.n === hit.match.n)!.utc);
      const cards = parseTimelineCards(timeline, hit.swapped);
      if (timeline.length > 0 || matchAge > 48 * 3600_000) {
        archive[String(hit.match.n)] = { cards };
        remaining.delete(hit.match.n);
        console.log(`[cards] match ${hit.match.n} (${hit.match.a} v ${hit.match.b}): ${cards.length} cards`);
      } else {
        console.log(`[cards] match ${hit.match.n}: timeline not ready yet — will retry next run`);
      }
      // incremental write — progress survives a killed run
      mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
      writeFileSync(OUT, JSON.stringify(archive, null, 1));
    }
  }
  console.log(`[cards] archive now covers ${Object.keys(archive).length} matches`);
}
