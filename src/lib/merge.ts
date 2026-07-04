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
  /** knockout decider, oriented to the static match's a/b sides */
  winner?: 'a' | 'b' | null;
  /** shootout tally [a, b], oriented to the static sides, when the match went to penalties */
  pens?: [number, number] | null;
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
    const winner =
      lm.winner === 'HOME_TEAM' ? (swap ? 'b' : 'a')
      : lm.winner === 'AWAY_TEAM' ? (swap ? 'a' : 'b')
      : null;
    // `fullTime` includes the shootout goals — subtract the penalty tally so
    // the scoreline is the pre-shootout result ("1–1", not "5–3").
    const p = lm.score.penalties;
    const pens: [number, number] | null =
      p && p.home !== null && p.away !== null ? [p.home, p.away] : null;
    const ftHome = lm.score.fullTime.home;
    const ftAway = lm.score.fullTime.away;
    const homeScore = ftHome !== null && pens ? ftHome - pens[0] : ftHome;
    const awayScore = ftAway !== null && pens ? ftAway - pens[1] : ftAway;
    out.push({
      n: m.n,
      status: lm.status,
      minute: lm.minute,
      home: swap ? awayScore : homeScore,
      away: swap ? homeScore : awayScore,
      winner,
      pens: pens ? (swap ? [pens[1], pens[0]] : pens) : null,
    });
  }
  return out;
}
