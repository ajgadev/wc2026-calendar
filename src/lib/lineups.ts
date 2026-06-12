import { teamCodeFor } from '../data/teamNames';
import type { EspnEvent } from './cards';

/**
 * Starting lineups & formations from ESPN's match summary endpoint
 * (free, keyless, CORS open — same source as cards). Published ~1h
 * before kickoff and immutable after full time, so finished matches
 * are archived once by the daily Action and fresher states come from
 * a browser fallback.
 */

export interface LineupPlayer {
  name: string;
  jersey: string;
  /** ESPN position abbreviation: G, RB, CD-L, DM, CM-R, CF-L, ... */
  pos: string;
  place: number;
}

export interface TeamLineup {
  formation: string | null;
  starters: LineupPlayer[];
  subbedIn: string[];
}

export interface MatchLineups {
  a: TeamLineup;
  b: TeamLineup;
}

export const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';

interface EspnRosterEntry {
  starter?: boolean;
  subbedIn?: boolean | { didSub?: boolean };
  jersey?: string | number | null;
  formationPlace?: string | number | null;
  position?: { abbreviation?: string | null };
  athlete?: { displayName?: string | null };
}

interface EspnSummary {
  rosters?: {
    homeAway?: string;
    formation?: string | null;
    team?: { displayName?: string | null };
    roster?: EspnRosterEntry[];
  }[];
}

function parseSide(side: NonNullable<EspnSummary['rosters']>[number]): TeamLineup {
  const starters: LineupPlayer[] = [];
  const subbedIn: string[] = [];
  for (const p of side.roster ?? []) {
    const name = p.athlete?.displayName ?? '';
    if (!name) continue;
    if (p.starter) {
      starters.push({
        name,
        jersey: String(p.jersey ?? ''),
        pos: p.position?.abbreviation ?? '',
        place: Number(p.formationPlace ?? 99),
      });
    } else if (p.subbedIn === true || (typeof p.subbedIn === 'object' && p.subbedIn?.didSub)) {
      subbedIn.push(name);
    }
  }
  return { formation: side.formation ?? null, starters, subbedIn };
}

/** Extracts both lineups from a summary payload, oriented to our match (a/b). */
export function parseEspnLineups(summary: unknown, codeA: string): MatchLineups | null {
  const rosters = (summary as EspnSummary).rosters ?? [];
  if (rosters.length < 2) return null;
  let a: TeamLineup | null = null;
  let b: TeamLineup | null = null;
  for (const side of rosters) {
    const code = teamCodeFor(side.team?.displayName ?? '');
    if (code === codeA) a = parseSide(side);
    else b = parseSide(side);
  }
  if (!a || !b || a.starters.length === 0 || b.starters.length === 0) return null;
  return { a, b };
}

/* ---- pitch layout ----
   Players are banded by position (GK → DEF → DM → MID → AM → FWD) and
   spread left-to-right inside each band; bands are distributed from the
   goal line (y=0) to the halfway line (y=100). The formation string is
   shown as a label, not trusted for geometry — position abbreviations
   are what ESPN keeps consistent. */

export interface PlacedPlayer extends LineupPlayer {
  /** 0–100 across the pitch width */
  x: number;
  /** 0–100 from own goal line to the halfway line */
  y: number;
}

function bandOf(pos: string): number {
  if (pos === 'G') return 0;
  if (/^(RB|LB|WB|CD|SW)/.test(pos) || /B$/.test(pos)) return 1;
  if (/^DM/.test(pos)) return 2;
  if (/^(CM|RM|LM|M)/.test(pos)) return 3;
  if (/^AM/.test(pos)) return 4;
  return 5; // F, CF, ST, RW, LW
}

function xOrder(pos: string): number {
  if (/-L\b/.test(pos)) return 1;
  if (/-R\b/.test(pos)) return 3;
  if (/^L/.test(pos)) return 0;
  if (/^R/.test(pos)) return 4;
  return 2;
}

export function layoutLineup(lineup: TeamLineup): PlacedPlayer[] {
  const bands = new Map<number, LineupPlayer[]>();
  for (const p of lineup.starters) {
    const b = bandOf(p.pos);
    if (!bands.has(b)) bands.set(b, []);
    bands.get(b)!.push(p);
  }
  const ordered = [...bands.entries()].sort(([a], [b]) => a - b);
  const out: PlacedPlayer[] = [];
  ordered.forEach(([, players], rowIdx) => {
    players.sort((p1, p2) => xOrder(p1.pos) - xOrder(p2.pos) || p1.place - p2.place);
    const rows = ordered.length;
    const y = rows === 1 ? 50 : 8 + (rowIdx / (rows - 1)) * 84;
    players.forEach((p, i) => {
      out.push({ ...p, x: ((i + 1) / (players.length + 1)) * 100, y });
    });
  });
  return out;
}
