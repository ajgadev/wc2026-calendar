export type Stage = 'GR' | 'R32' | 'R16' | 'QF' | 'SF' | '3RD' | 'F';

export interface Goal {
  side: 0 | 1;
  name: string;
  minute: number;
  penalty?: boolean;
  owngoal?: boolean;
}

/** One match, normalized from the openfootball feed. */
export interface Match {
  /** Stable match number (1–104). Knockouts use the official `num`. */
  n: number;
  stage: Stage;
  /** 'A'..'L' for group-stage matches */
  group?: string;
  /** Matchday 1–3 within the group */
  md?: number;
  /** FIFA codes when both teams are resolved */
  a?: string;
  b?: string;
  /** Human-readable placeholder labels for unresolved knockout slots */
  pa?: string;
  pb?: string;
  /** Original team strings from the source (for diagnostics) */
  rawA: string;
  rawB: string;
  /** Kickoff as a true UTC instant (ISO 8601) */
  utc: string;
  /** Stadium id into STADIUMS */
  stadium: string;
  /** Final score when the static layer has one */
  ft?: [number, number];
  /** Penalty-shootout tally [a, b] when a level full time was decided on pens */
  pens?: [number, number];
  goals?: Goal[];
}

export interface Stadium {
  id: string;
  name: string;
  fifaName: string;
  city: string;
  cityShort: string;
  country: 'US' | 'MX' | 'CA';
  capacity: number;
  timezone: string;
  lat: number;
  lng: number;
}

export interface Team {
  /** FIFA three-letter code */
  code: string;
  name: string;
  group: string;
  /** flagcdn ISO code */
  flag: string;
  host?: boolean;
}

/** Slimmed live payload returned by /api/live */
export interface LiveMatch {
  utcDate: string;
  status:
    | 'SCHEDULED'
    | 'TIMED'
    | 'IN_PLAY'
    | 'PAUSED'
    | 'FINISHED'
    | 'POSTPONED'
    | 'SUSPENDED'
    | 'CANCELLED'
    | 'AWARDED';
  minute: number | null;
  homeTeam: string;
  awayTeam: string;
  /** Knockout decider — set even when fullTime is level (extra time / penalties) */
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
  score: {
    // football-data's `fullTime` folds the shootout goals in (a 1–1 decided
    // 4–2 on penalties arrives as fullTime 5–3), so a shootout needs the
    // separate `penalties` tally subtracted back out to show the real "1–1".
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null };
  };
}

export interface Highlight {
  videoId: string;
  title: string;
  published: string;
}
