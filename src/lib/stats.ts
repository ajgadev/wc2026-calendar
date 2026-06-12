import type { Match } from './types';

/**
 * Locally computed tournament stats (from the static layer).
 * Top scorers from football-data.org arrive through /api/scorers at
 * runtime; the local computation below is the no-token fallback.
 *
 * Provider interface: anything that can supply `ScorerRow[]` plugs in
 * here — a paid stats provider can be added later behind the same shape.
 * No possession/shots/xG anywhere: no free source covers WC 2026.
 */

export interface ScorerRow {
  name: string;
  team: string; // FIFA code
  goals: number;
  assists: number;
  penalties?: number;
}

export interface TournamentStats {
  playedMatches: number;
  totalGoals: number;
  goalsPerMatch: number;
  biggestWin: { label: string; date: string } | null;
  goalsByGroup: { group: string; goals: number }[];
  cleanSheets: { team: string; count: number }[];
  localScorers: ScorerRow[];
}

export function computeStats(matches: Match[], groups: string[]): TournamentStats {
  let playedMatches = 0;
  let totalGoals = 0;
  let biggest: { diff: number; tot: number; label: string; date: string } | null = null;
  const scorers: Record<string, ScorerRow> = {};
  const cleanSheets: Record<string, number> = {};

  for (const m of matches) {
    if (!m.ft || !m.a || !m.b) continue;
    const [ga, gb] = m.ft;
    playedMatches++;
    totalGoals += ga + gb;
    const diff = Math.abs(ga - gb);
    if (diff > 0 && (!biggest || diff > biggest.diff || (diff === biggest.diff && ga + gb > biggest.tot))) {
      biggest = { diff, tot: ga + gb, label: `${m.a} ${ga}–${gb} ${m.b}`, date: m.utc.slice(0, 10) };
    }
    if (gb === 0) cleanSheets[m.a] = (cleanSheets[m.a] ?? 0) + 1;
    if (ga === 0) cleanSheets[m.b] = (cleanSheets[m.b] ?? 0) + 1;
    for (const g of m.goals ?? []) {
      const team = g.owngoal ? (g.side === 0 ? m.b : m.a) : (g.side === 0 ? m.a : m.b);
      if (g.owngoal) continue; // own goals don't count for the scorer
      const e = (scorers[g.name] ??= { name: g.name, team, goals: 0, assists: 0, penalties: 0 });
      e.goals++;
      if (g.penalty) e.penalties = (e.penalties ?? 0) + 1;
    }
  }

  return {
    playedMatches,
    totalGoals,
    goalsPerMatch: playedMatches ? totalGoals / playedMatches : 0,
    biggestWin: biggest ? { label: biggest.label, date: biggest.date } : null,
    goalsByGroup: groups.map((group) => ({
      group,
      goals: matches
        .filter((m) => m.group === group && m.ft)
        .reduce((acc, m) => acc + m.ft![0] + m.ft![1], 0),
    })),
    cleanSheets: Object.entries(cleanSheets)
      .map(([team, count]) => ({ team, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 8),
    localScorers: Object.values(scorers)
      .sort((x, y) => y.goals - x.goals || y.assists - x.assists || x.name.localeCompare(y.name))
      .slice(0, 10),
  };
}
