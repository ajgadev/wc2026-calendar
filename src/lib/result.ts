import type { Match } from './types';

/**
 * Resolved result of a finished match, penalty shootouts included.
 * Shared by the static components (.astro) and the live islands so a
 * knockout settled on penalties reads the same everywhere: the winner is
 * emphasised even when full time is level, and the scoreline carries the
 * shootout tally once it's known.
 */
export interface Decided {
  /** winning side, or null for a genuine draw / undecided */
  win: 'a' | 'b' | null;
  /** true when a level full time was settled by a shootout */
  pens: boolean;
  /** agenda-row score text: "2–1", "1–1 (4–3p)", or "1–1 pens" */
  scoreText: string;
}

/**
 * Resolve full time + optional shootout into a winner and display score.
 * `liveWin` is the live feed's decider side, used during the gap before
 * the nightly rebuild lands the actual pen tally ("1–1 pens").
 */
export function decide(
  ft: [number, number],
  pens?: [number, number] | null,
  liveWin?: 'a' | 'b' | null,
): Decided {
  const [a, b] = ft;
  if (a !== b) return { win: a > b ? 'a' : 'b', pens: false, scoreText: `${a}–${b}` };
  // level full time — a knockout goes to penalties, a group game stays a draw
  if (pens) {
    const [pa, pb] = pens;
    return { win: pa > pb ? 'a' : pb > pa ? 'b' : null, pens: true, scoreText: `${a}–${b} (${pa}–${pb}p)` };
  }
  if (liveWin) return { win: liveWin, pens: true, scoreText: `${a}–${b} pens` };
  return { win: null, pens: false, scoreText: `${a}–${b}` };
}

/** Static-layer result for a match, from its baked `ft`/`pens`. */
export function decideMatch(m: Match): Decided {
  return m.ft ? decide(m.ft, m.pens ?? null) : { win: null, pens: false, scoreText: '' };
}

/**
 * One team's score cell for the per-row layouts (calendar chips, bracket
 * slots): the full-time goals with the shootout tally in parentheses
 * when there is one — "1 (4)" — else just the goals — "1".
 */
export function penCell(goals: number, pen: number | null | undefined): string {
  return pen != null ? `${goals} (${pen})` : `${goals}`;
}
