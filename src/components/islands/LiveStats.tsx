import { useEffect } from 'react';
import { appData, flagUrl } from '../../lib/client';
import { startLivePoll, mergeFinals } from '../../lib/livePoll';
import { joinLive } from '../../lib/merge';
import { computeStats, type TournamentStats } from '../../lib/stats';
import { shortDate } from '../../lib/time';
import type { LiveMatch, Match } from '../../lib/types';

/**
 * Invisible coordinator island for /stats. The aggregate cards (matches
 * played, goals, biggest win), the goals-by-group bars and the clean-sheet
 * list are server-rendered from the build-time schedule; this folds freshly
 * finished /api/live results into the static scores, recomputes them with
 * the exact build-time `computeStats`, and patches the DOM in place.
 *
 * Scope is score-only aggregates — top scorers (which need per-match goal
 * events) stay with ScorersTable's own /api/scorers feed. Degrades silently
 * when /api/live is unconfigured (503).
 */

/** Map of match-number → final score for live FINISHED/AWARDED results. */
function liveFinals(matches: Match[], live: LiveMatch[]): Map<number, [number, number]> {
  const finals = new Map<number, [number, number]>();
  for (const s of joinLive(matches, live)) {
    const done = s.status === 'FINISHED' || s.status === 'AWARDED';
    if (done && s.home !== null && s.away !== null) finals.set(s.n, [s.home, s.away]);
  }
  return finals;
}

function setText(el: Element | null, text: string) {
  if (el && el.textContent !== text) el.textContent = text;
}

function patchCards(stats: TournamentStats) {
  const card = (key: string) => document.querySelector<HTMLElement>(`[data-stat-card="${key}"]`);
  const set = (key: string, value: string, sub: string) => {
    const c = card(key);
    if (!c) return;
    setText(c.querySelector('[data-stat-value]'), value);
    setText(c.querySelector('[data-stat-sub]'), sub);
  };
  set('matches', String(stats.playedMatches), 'of 104 total');
  set(
    'goals',
    String(stats.totalGoals),
    stats.playedMatches ? `${stats.goalsPerMatch.toFixed(1)} per finished match` : 'tournament total',
  );
  set(
    'biggestwin',
    stats.biggestWin?.label ?? '—',
    stats.biggestWin ? shortDate(stats.biggestWin.date) : 'no results yet',
  );
}

function patchGoalsByGroup(stats: TournamentStats) {
  const container = document.querySelector<HTMLElement>('[data-goals-by-group]');
  if (!container) return;
  const max = Math.max(1, ...stats.goalsByGroup.map((g) => g.goals));
  for (const g of stats.goalsByGroup) {
    const row = container.querySelector<HTMLElement>(`[data-gbg="${g.group}"]`);
    if (!row) continue;
    const bar = row.querySelector<HTMLElement>('[data-gbg-bar]');
    if (bar) {
      const w = `${Math.round((g.goals / max) * 100)}%`;
      if (bar.style.width !== w) bar.style.width = w;
    }
    setText(row.querySelector('[data-gbg-count]'), String(g.goals));
  }
}

function cleanSheetRow(team: string, count: number, name: string, flag: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.openTeam = team;
  btn.className =
    'focus-ring-surface grid min-h-[44px] grid-cols-[minmax(0,1fr)_32px] items-center gap-2 border-t border-border px-1 py-1 hover:bg-surface-2';

  const left = document.createElement('span');
  left.className = 'flex min-w-0 items-center gap-[7px]';
  const img = document.createElement('img');
  img.src = flagUrl(flag, 40);
  img.alt = '';
  img.width = 19;
  img.height = 14;
  img.loading = 'lazy';
  img.className = 'h-3.5 w-[19px] shrink-0 rounded-[2px] object-cover';
  const nm = document.createElement('span');
  nm.className = 'disp t-meta truncate font-bold text-text-2';
  nm.textContent = name;
  left.append(img, nm);

  const cnt = document.createElement('span');
  cnt.className = 'disp t-time tnum text-center font-black text-text';
  cnt.textContent = String(count);

  btn.append(left, cnt);
  return btn;
}

function patchCleanSheets(stats: TournamentStats, teams: ReturnType<typeof appData>['teams']) {
  const card = document.querySelector<HTMLElement>('[data-clean-sheets-card]');
  const list = document.querySelector<HTMLElement>('[data-clean-sheets]');
  if (!card || !list) return;
  card.hidden = stats.cleanSheets.length === 0;
  list.replaceChildren(
    ...stats.cleanSheets.map((c) =>
      cleanSheetRow(c.team, c.count, teams[c.team]?.name ?? c.team, teams[c.team]?.flag ?? ''),
    ),
  );
}

export default function LiveStats() {
  useEffect(() => {
    const { matches, teams } = appData();
    if (!document.querySelector('[data-goals-by-group]')) return;
    const groups = [...new Set(Object.values(teams).map((t) => t.group))].sort();
    let lastSig = '';

    const render = (merged: Match[]) => {
      const stats = computeStats(merged, groups);
      // signature over the score-only aggregates we patch (ignores scorers)
      const sig = JSON.stringify([
        stats.playedMatches,
        stats.totalGoals,
        stats.biggestWin?.label ?? '',
        stats.goalsByGroup.map((g) => g.goals),
        stats.cleanSheets.map((c) => `${c.team}:${c.count}`),
      ]);
      if (sig === lastSig) return;
      lastSig = sig;
      patchCards(stats);
      patchGoalsByGroup(stats);
      patchCleanSheets(stats, teams);
    };

    return startLivePoll(matches, (live) => render(mergeFinals(matches, liveFinals(matches, live))));
  }, []);

  return null;
}
