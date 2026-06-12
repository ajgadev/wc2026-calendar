import { teamCodeFor } from '../data/teamNames';

/**
 * Yellow/red cards from ESPN's public scoreboard JSON (no key, CORS
 * open). Chosen after auditing the alternatives: football-data.org
 * keeps bookings behind the paid tier, API-Football's free plan
 * excludes season 2026, and TheSportsDB timelines proved incomplete
 * (1 of 3 red cards in the opener).
 *
 * Shared by the build-time archiver (scripts/fetch-match-details.ts,
 * runs in the daily Action and commits matchDetails.json) and the
 * match drawer's browser fallback for matches not yet archived.
 */

export interface CardEvent {
  minute: number;
  /** 0 = our match's team A, 1 = team B */
  side: 0 | 1;
  player: string;
  /** Y = yellow, R = straight red, YR = second yellow */
  type: 'Y' | 'R' | 'YR';
}

export interface GoalEvent {
  minute: number;
  /** 0 = our match's team A, 1 = team B — the side credited with the goal */
  side: 0 | 1;
  player: string;
  penalty?: boolean;
  owngoal?: boolean;
}

export interface MatchDetail {
  cards: CardEvent[];
  /** Scorers from ESPN — bridges the gap until openfootball's nightly data lands */
  goals?: GoalEvent[];
  lineups?: import('./lineups').MatchLineups;
}

/** Archive shape: { [matchN]: MatchDetail } */
export type MatchDetailsArchive = Record<string, MatchDetail>;

/* ---- ESPN scoreboard shapes (the fields we read) ---- */

export interface EspnCompetitor {
  homeAway?: 'home' | 'away';
  team?: { id?: string; displayName?: string | null };
}

export interface EspnDetail {
  type?: { text?: string | null };
  clock?: { displayValue?: string | null };
  team?: { id?: string };
  athletesInvolved?: { displayName?: string | null }[];
}

export interface EspnEvent {
  id?: string;
  status?: { type?: { name?: string } };
  competitions?: {
    competitors?: EspnCompetitor[];
    details?: EspnDetail[];
  }[];
}

export const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

export interface CardJoinableMatch {
  n: number;
  a?: string;
  b?: string;
}

/**
 * Finds the ESPN event for one of our matches: both competitor names
 * resolve to the same FIFA codes, either orientation.
 */
export function matchEspnEventToMatch(
  event: EspnEvent,
  matches: CardJoinableMatch[],
): { match: CardJoinableMatch; homeIsA: boolean; homeTeamId: string } | null {
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  const homeCode = teamCodeFor(home?.team?.displayName ?? '');
  const awayCode = teamCodeFor(away?.team?.displayName ?? '');
  const homeTeamId = home?.team?.id;
  if (!homeCode || !awayCode || !homeTeamId) return null;
  for (const m of matches) {
    if (!m.a || !m.b) continue;
    if (m.a === homeCode && m.b === awayCode) return { match: m, homeIsA: true, homeTeamId };
    if (m.a === awayCode && m.b === homeCode) return { match: m, homeIsA: false, homeTeamId };
  }
  return null;
}

/** "90'+2'" → 92, "49'" → 49 */
function parseClock(v: string | null | undefined): number | null {
  const m = /^(\d+)'(?:\s*\+\s*(\d+)'?)?/.exec((v ?? '').trim());
  return m ? Number(m[1]) + Number(m[2] ?? 0) : null;
}

/** Extracts card events from an ESPN event's details. */
export function parseEspnCards(event: EspnEvent, homeIsA: boolean, homeTeamId: string): CardEvent[] {
  const out: CardEvent[] = [];
  for (const d of event.competitions?.[0]?.details ?? []) {
    const text = d.type?.text ?? '';
    const isYellow = /yellow/i.test(text);
    const isRed = /red/i.test(text);
    if (!isYellow && !isRed) continue;
    const minute = parseClock(d.clock?.displayValue);
    const player = d.athletesInvolved?.[0]?.displayName ?? '';
    if (minute === null || !player) continue;
    out.push({
      minute,
      side: ((d.team?.id === homeTeamId) === homeIsA ? 0 : 1) as 0 | 1,
      player,
      type: isRed ? 'R' : 'Y',
    });
  }
  out.sort((x, y) => x.minute - y.minute);
  // a red preceded by a yellow for the same player = second yellow
  const yellowed = new Set<string>();
  for (const c of out) {
    if (c.type === 'Y') yellowed.add(c.player);
    else if (c.type === 'R' && yellowed.has(c.player)) c.type = 'YR';
  }
  return out;
}

/**
 * Extracts goal events from an ESPN event's details. Type texts seen:
 * "Goal", "Goal - Header", "Goal - Volley", "Goal - Free-kick",
 * "Penalty - Scored", "Own Goal". "Penalty - Missed" must not count.
 */
export function parseEspnGoals(event: EspnEvent, homeIsA: boolean, homeTeamId: string): GoalEvent[] {
  const out: GoalEvent[] = [];
  for (const d of event.competitions?.[0]?.details ?? []) {
    const text = d.type?.text ?? '';
    const isGoal = /^goal/i.test(text) || /penalty.*scored/i.test(text) || /own goal/i.test(text);
    if (!isGoal) continue;
    const minute = parseClock(d.clock?.displayValue);
    const player = d.athletesInvolved?.[0]?.displayName ?? '';
    if (minute === null || !player) continue;
    out.push({
      minute,
      side: ((d.team?.id === homeTeamId) === homeIsA ? 0 : 1) as 0 | 1,
      player,
      ...(/penalty/i.test(text) ? { penalty: true } : {}),
      ...(/own goal/i.test(text) ? { owngoal: true } : {}),
    });
  }
  return out.sort((x, y) => x.minute - y.minute);
}

export function hasRedCard(detail: MatchDetail | undefined): boolean {
  return !!detail?.cards.some((c) => c.type === 'R' || c.type === 'YR');
}
