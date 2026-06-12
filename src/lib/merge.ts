import { teamCodeFor } from '../data/teamNames';
import type { LiveMatch } from './types';

/**
 * Joins the live payload from /api/live onto static matches.
 * Join key: UTC day + normalized team names (both sides funneled
 * through the teamNames map — sources disagree on spellings).
 */

export interface LiveStatus {
  /** static match number */
  n: number;
  status: LiveMatch['status'];
  minute: number | null;
  home: number | null;
  away: number | null;
}

export interface JoinableMatch {
  n: number;
  a?: string;
  b?: string;
  utc: string;
}

export function joinLive(staticMatches: JoinableMatch[], live: LiveMatch[]): LiveStatus[] {
  const byKey = new Map<string, JoinableMatch>();
  for (const m of staticMatches) {
    if (!m.a || !m.b) continue;
    byKey.set(`${m.utc.slice(0, 10)}|${m.a}|${m.b}`, m);
  }

  const out: LiveStatus[] = [];
  for (const lm of live) {
    const day = lm.utcDate.slice(0, 10);
    const home = teamCodeFor(lm.homeTeam);
    const away = teamCodeFor(lm.awayTeam);
    if (!home || !away) {
      if (import.meta.env?.DEV) {
        console.warn(`[merge] unmatched live pair: "${lm.homeTeam}" vs "${lm.awayTeam}"`);
      }
      continue;
    }
    // try both orientations — sources can disagree on home/away
    const direct = byKey.get(`${day}|${home}|${away}`);
    const flipped = direct ? undefined : byKey.get(`${day}|${away}|${home}`);
    const m = direct ?? flipped;
    if (!m) continue;
    const swap = !!flipped;
    out.push({
      n: m.n,
      status: lm.status,
      minute: lm.minute,
      home: swap ? lm.score.fullTime.away : lm.score.fullTime.home,
      away: swap ? lm.score.fullTime.home : lm.score.fullTime.away,
    });
  }
  return out;
}
