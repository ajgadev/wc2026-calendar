import raw from './vendor/worldcup-2026.json';
import { GROUND_TO_STADIUM, STADIUMS } from './stadiums';
import { teamCodeFor } from './teamNames';
import { parseKickoff } from '../lib/time';
import type { Goal, Match, Stage } from '../lib/types';

/**
 * Normalizes the openfootball worldcup.json file into the internal
 * Match shape. The vendored copy is refreshed by scripts/refresh-schedule.ts
 * during `npm run build` (daily rebuild picks up scores and resolved
 * knockout teams); if that fetch fails the committed copy is used as-is.
 */

interface OfGoal {
  name: string;
  /** upstream sends this as a string ("67", sometimes "90+3") or a number */
  minute: number | string;
  offset?: number | string;
  penalty?: boolean;
  owngoal?: boolean;
}

/** "67" → 67, "90+3" → 93, 45 → 45 — never string-concatenates. */
function toMinute(minute: number | string | undefined, offset: number | string | undefined): number {
  const parse = (v: number | string | undefined): number => {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    const m = /^(\d+)(?:\+(\d+))?$/.exec(String(v).trim());
    return m ? Number(m[1]) + Number(m[2] ?? 0) : 0;
  };
  return parse(minute) + parse(offset);
}
interface OfMatch {
  num?: number;
  round: string;
  date: string;
  time: string;
  team1: string;
  team2: string;
  group?: string;
  ground: string;
  score?: { ht?: [number, number]; ft?: [number, number]; et?: [number, number]; p?: [number, number] };
  goals1?: OfGoal[];
  goals2?: OfGoal[];
}

const STAGE_BY_ROUND: Record<string, Stage> = {
  'Round of 32': 'R32',
  'Round of 16': 'R16',
  'Quarter-final': 'QF',
  'Quarterfinals': 'QF',
  'Semi-final': 'SF',
  'Semifinals': 'SF',
  'Match for third place': '3RD',
  'Third place': '3RD',
  'Final': 'F',
};

export const STAGE_LABELS: Record<Stage, string> = {
  GR: 'Group stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinal',
  SF: 'Semifinal',
  '3RD': 'Third place',
  F: 'Final',
};

/** "1C" → "Group C winner" etc. — human-readable placeholder labels. */
export function placeholderLabel(s: string): string {
  let m = /^1([A-L])$/.exec(s);
  if (m) return `Group ${m[1]} winner`;
  m = /^2([A-L])$/.exec(s);
  if (m) return `Group ${m[1]} runner-up`;
  m = /^3([A-L](?:\/[A-L])+)$/.exec(s);
  if (m) return `3rd place — ${m[1]}`;
  m = /^W(\d+)$/.exec(s);
  if (m) return `Winner of Match ${m[1]}`;
  m = /^L(\d+)$/.exec(s);
  if (m) return `Loser of Match ${m[1]}`;
  if (import.meta.env?.DEV) console.warn(`[schedule] unparsed placeholder: "${s}"`);
  return s; // render the raw string, never crash
}

function stadiumIdFor(ground: string): string {
  const id = GROUND_TO_STADIUM[ground];
  if (id) return id;
  console.error(`[schedule] BUILD ERROR: unmapped ground string "${ground}"`);
  // Defensive fallback: synthesize an id so rendering never crashes.
  const synth = ground.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (!STADIUMS[synth]) {
    STADIUMS[synth] = {
      id: synth, name: ground, fifaName: ground, city: ground, cityShort: ground.slice(0, 4).toUpperCase(),
      country: 'US', capacity: 0, timezone: 'UTC', lat: 0, lng: 0,
    };
  }
  return synth;
}

function parseGoals(of: OfMatch): Goal[] | undefined {
  const out: Goal[] = [];
  for (const [side, list] of [[0, of.goals1], [1, of.goals2]] as const) {
    for (const g of list ?? []) {
      if (!g || typeof g.name !== 'string') continue;
      out.push({
        side,
        name: g.name,
        minute: toMinute(g.minute, g.offset),
        ...(g.penalty ? { penalty: true } : {}),
        ...(g.owngoal ? { owngoal: true } : {}),
      });
    }
  }
  return out.length ? out.sort((a, b) => a.minute - b.minute) : undefined;
}

function normalize(): Match[] {
  const source = (raw as { matches: OfMatch[] }).matches;

  const partial = source.map((of, idx) => {
    const isGroup = /^Matchday \d+$/.test(of.round);
    const stage: Stage = isGroup ? 'GR' : (STAGE_BY_ROUND[of.round] ?? 'GR');
    if (!isGroup && !STAGE_BY_ROUND[of.round]) {
      console.error(`[schedule] BUILD ERROR: unknown round "${of.round}"`);
    }
    const codeA = teamCodeFor(of.team1);
    const codeB = teamCodeFor(of.team2);
    const m: Match = {
      n: of.num ?? 0, // group matches get a stable number below
      stage,
      ...(of.group ? { group: of.group.replace(/^Group /, '') } : {}),
      ...(codeA ? { a: codeA } : { pa: placeholderLabel(of.team1) }),
      ...(codeB ? { b: codeB } : { pb: placeholderLabel(of.team2) }),
      rawA: of.team1,
      rawB: of.team2,
      utc: parseKickoff(of.date, of.time),
      stadium: stadiumIdFor(of.ground),
      ...(of.score?.ft ? { ft: of.score.ft } : {}),
    };
    const goals = parseGoals(of);
    if (goals) m.goals = goals;
    return { m, idx };
  });

  // Stable numbers for group matches: chronological, tiebroken by source order.
  const groupMs = partial
    .filter((x) => x.m.stage === 'GR')
    .sort((x, y) => Date.parse(x.m.utc) - Date.parse(y.m.utc) || x.idx - y.idx);
  groupMs.forEach((x, i) => { x.m.n = i + 1; });

  // Matchday 1–3 within each group (chronological pairs).
  for (const g of new Set(groupMs.map((x) => x.m.group))) {
    groupMs
      .filter((x) => x.m.group === g)
      .forEach((x, i) => { x.m.md = Math.floor(i / 2) + 1; });
  }

  return partial.map((x) => x.m).sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc) || a.n - b.n);
}

/** All 104 matches, chronological. */
export const MATCHES: Match[] = normalize();

export const MATCH_BY_N: Record<number, Match> = Object.fromEntries(
  MATCHES.map((m) => [m.n, m]),
);

export const TOURNAMENT_START = '2026-06-11';
export const TOURNAMENT_END = '2026-07-19';
