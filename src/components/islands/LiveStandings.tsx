import { useEffect } from 'react';
import { appData } from '../../lib/client';
import { startLivePoll, mergeFinals } from '../../lib/livePoll';
import { joinLive } from '../../lib/merge';
import { computeGroupTable, type TableRow } from '../../lib/standings';
import type { LiveMatch, Match } from '../../lib/types';

/**
 * Invisible coordinator island for /standings. The 12 group tables are
 * server-rendered from the build-time schedule; between a match ending
 * and the nightly rebuild they'd otherwise lag. This polls /api/live
 * (same proxy LiveOverlay uses), folds freshly finished results into the
 * static matches, recomputes each group table locally with the exact
 * build-time function, and patches the rows in place — re-sorting nodes,
 * updating P/W/D/L/GD/PTS and the qualification-zone borders. Reuses the
 * existing static buttons so the team-drawer delegation keeps working.
 * Degrades silently when /api/live is unconfigured (503) — the static
 * tables stay rendered.
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

/** Stable signature of a group's table, to skip DOM writes when nothing moved. */
function signature(rows: TableRow[], played: number): string {
  return played + '|' + rows.map((r) => `${r.code}:${r.p}:${r.w}:${r.d}:${r.l}:${r.gd}:${r.pts}`).join(',');
}

const ZONE_BASE = ['border-l-[3px]'];
function zoneClasses(idx: number): string[] {
  if (idx < 2) return [...ZONE_BASE, 'border-solid', 'border-text-2'];
  if (idx === 2) return [...ZONE_BASE, 'border-dashed', 'border-text-dim'];
  return [...ZONE_BASE, 'border-solid', 'border-transparent'];
}
const ALL_ZONE = ['border-solid', 'border-dashed', 'border-text-2', 'border-text-dim', 'border-transparent'];

function fmtGd(gd: number): string {
  return gd > 0 ? `+${gd}` : String(gd);
}

function patchGroup(card: HTMLElement, rows: TableRow[], played: number) {
  const playedEl = card.querySelector<HTMLElement>('[data-played]');
  if (playedEl) playedEl.textContent = `${played} of 6 played`;

  const byCode = new Map<string, HTMLElement>();
  card.querySelectorAll<HTMLElement>('[data-row]').forEach((el) => {
    if (el.dataset.openTeam) byCode.set(el.dataset.openTeam, el);
  });

  rows.forEach((r, idx) => {
    const el = byCode.get(r.code);
    if (!el) return;
    const set = (sel: string, text: string) => {
      const n = el.querySelector<HTMLElement>(sel);
      if (n && n.textContent !== text) n.textContent = text;
    };
    set('[data-rank]', String(idx + 1));
    set('[data-cell="p"]', String(r.p));
    set('[data-cell="w"]', String(r.w));
    set('[data-cell="d"]', String(r.d));
    set('[data-cell="l"]', String(r.l));
    set('[data-cell="gd"]', fmtGd(r.gd));
    set('[data-cell="pts"]', String(r.pts));
    el.classList.remove(...ALL_ZONE);
    el.classList.add(...zoneClasses(idx));
    // re-sort: append in finishing order (rows are the card's last children)
    card.appendChild(el);
  });
}

export default function LiveStandings() {
  useEffect(() => {
    const { matches, teams } = appData();
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-standings-group]'));
    if (!cards.length) return;

    const codesByGroup = new Map<string, string[]>();
    for (const [code, t] of Object.entries(teams)) {
      const list = codesByGroup.get(t.group) ?? [];
      list.push(code);
      codesByGroup.set(t.group, list);
    }
    const nameOf = (code: string) => teams[code]?.name ?? code;
    const sigs = new Map<string, string>();

    const render = (merged: Match[]) => {
      for (const card of cards) {
        const g = card.dataset.standingsGroup!;
        const codes = codesByGroup.get(g) ?? [];
        const { rows, played } = computeGroupTable(g, merged, codes, nameOf);
        const sig = signature(rows, played);
        if (sigs.get(g) === sig) continue;
        sigs.set(g, sig);
        patchGroup(card, rows, played);
      }
    };

    return startLivePoll(matches, (live) => render(mergeFinals(matches, liveFinals(matches, live))));
  }, []);

  return null;
}
