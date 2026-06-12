import { teamCodeFor } from '../data/teamNames';

/**
 * Yellow/red cards from TheSportsDB match timelines — the one free
 * source that has them (football-data.org keeps bookings behind the
 * paid tier; openfootball has goals only).
 *
 * Shared by the build-time archiver (scripts/fetch-match-details.ts,
 * runs in the daily Action and commits matchDetails.json) and the
 * match drawer's browser fallback for matches not yet archived
 * (TheSportsDB allows CORS).
 */

export interface CardEvent {
  minute: number;
  /** 0 = our match's team A, 1 = team B */
  side: 0 | 1;
  player: string;
  /** Y = yellow, R = straight red, YR = second yellow */
  type: 'Y' | 'R' | 'YR';
}

export interface MatchDetail {
  cards: CardEvent[];
}

/** Archive shape: { [matchN]: MatchDetail } */
export type MatchDetailsArchive = Record<string, MatchDetail>;

export interface SdbEvent {
  idEvent: string;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  strLeague?: string | null;
  dateEvent?: string | null;
}

export interface SdbTimelineEntry {
  strTimeline?: string | null;
  strTimelineDetail?: string | null;
  strHome?: string | null;
  strPlayer?: string | null;
  intTime?: string | number | null;
}

export interface CardJoinableMatch {
  n: number;
  a?: string;
  b?: string;
}

/**
 * Finds the TheSportsDB event for one of our matches (same day, both
 * team names resolve to the same FIFA codes, either orientation).
 */
export function matchEventToMatch(
  event: SdbEvent,
  matches: CardJoinableMatch[],
): { match: CardJoinableMatch; swapped: boolean } | null {
  if (event.strLeague && !/world cup/i.test(event.strLeague)) return null;
  const home = teamCodeFor(event.strHomeTeam ?? '');
  const away = teamCodeFor(event.strAwayTeam ?? '');
  if (!home || !away) return null;
  for (const m of matches) {
    if (!m.a || !m.b) continue;
    if (m.a === home && m.b === away) return { match: m, swapped: false };
    if (m.a === away && m.b === home) return { match: m, swapped: true };
  }
  return null;
}

/** Extracts card events from a timeline; `swapped` flips home/away → A/B. */
export function parseTimelineCards(timeline: SdbTimelineEntry[], swapped: boolean): CardEvent[] {
  const out: CardEvent[] = [];
  for (const t of timeline) {
    if (!/card/i.test(t.strTimeline ?? '')) continue;
    const detail = t.strTimelineDetail ?? '';
    const type: CardEvent['type'] = /second/i.test(detail) ? 'YR' : /red/i.test(detail) ? 'R' : 'Y';
    const isHome = t.strHome === 'Yes';
    const minute = parseInt(String(t.intTime ?? ''), 10);
    if (!t.strPlayer || Number.isNaN(minute)) continue;
    out.push({
      minute,
      side: (isHome !== swapped ? 0 : 1) as 0 | 1,
      player: t.strPlayer,
      type,
    });
  }
  return out.sort((x, y) => x.minute - y.minute);
}

export function hasRedCard(detail: MatchDetail | undefined): boolean {
  return !!detail?.cards.some((c) => c.type === 'R' || c.type === 'YR');
}
