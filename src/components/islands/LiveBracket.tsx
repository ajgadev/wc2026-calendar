import { useEffect } from 'react';
import { appData, flagUrl } from '../../lib/client';
import { startLivePoll } from '../../lib/livePoll';
import { joinLive } from '../../lib/merge';
import { computeGroupTable } from '../../lib/standings';
import type { LiveMatch, Match } from '../../lib/types';

/**
 * Invisible coordinator island for /bracket. The wallchart is server-
 * rendered from the build-time schedule; between a knockout match ending
 * and the nightly rebuild the next round would otherwise stay on its
 * "Winner of Match N" placeholder. This folds live results in and resolves
 * advancement client-side, then patches both bracket layouts (tree +
 * columns) in place: flags, team names, scores, and won/lost emphasis.
 *
 * Resolution is bounded to what's deterministic without FIFA's tiebreak
 * tables: W{n}/L{n} knockout chains (winner sourced from the feed's own
 * `winner` field, so penalty shootouts advance correctly) and R32 group
 * winners/runners-up (1X/2X) once a group's six matches are complete. The
 * best-third-placed slots (3X) are left to the authoritative nightly
 * rebuild. Degrades silently when /api/live is unconfigured (503).
 */

type Side = 'a' | 'b';
type Resolved = {
  a?: string;
  b?: string;
  state: 'up' | 'live' | 'ft';
  score: [number, number] | null;
  /** winning side once finished, for emphasis */
  won: Side | null;
};

const W_RE = /^([WL])(\d+)$/;
const GROUP_RE = /^([12])([A-L])$/;

interface Resolver {
  codeA: Map<number, string>;
  codeB: Map<number, string>;
  finalScore: Map<number, [number, number]>;
  liveScore: Map<number, [number, number]>;
  state: Map<number, 'up' | 'live' | 'ft'>;
  winnerSide: Map<number, Side>;
}

function decide(r: Resolver, n: number, want: 'W' | 'L'): string | undefined {
  const a = r.codeA.get(n);
  const b = r.codeB.get(n);
  if (!a || !b) return undefined;
  const w = r.winnerSide.get(n);
  if (w) return want === 'W' ? (w === 'a' ? a : b) : w === 'a' ? b : a;
  const f = r.finalScore.get(n);
  if (!f || f[0] === f[1]) return undefined; // level + no decider yet → unknown
  const winA = f[0] > f[1];
  return want === 'W' ? (winA ? a : b) : winA ? b : a;
}

function resolveBracket(
  matches: Match[],
  live: LiveMatch[],
  codesByGroup: Map<string, string[]>,
  nameOf: (c: string) => string,
): Map<number, Resolved> {
  const r: Resolver = {
    codeA: new Map(),
    codeB: new Map(),
    finalScore: new Map(),
    liveScore: new Map(),
    state: new Map(),
    winnerSide: new Map(),
  };
  // seed from the static layer (don't overwrite codes the rebuild already resolved)
  for (const m of matches) {
    if (m.a) r.codeA.set(m.n, m.a);
    if (m.b) r.codeB.set(m.n, m.b);
    if (m.ft) {
      r.finalScore.set(m.n, m.ft);
      r.state.set(m.n, 'ft');
    } else {
      r.state.set(m.n, 'up');
    }
  }

  const applyLive = () => {
    const aug = matches.map((m) => ({ ...m, a: r.codeA.get(m.n), b: r.codeB.get(m.n) }));
    for (const s of joinLive(aug, live)) {
      const isFt = s.status === 'FINISHED' || s.status === 'AWARDED';
      const isLive = s.status === 'IN_PLAY' || s.status === 'PAUSED';
      r.state.set(s.n, isFt ? 'ft' : isLive ? 'live' : 'up');
      if (s.winner) r.winnerSide.set(s.n, s.winner);
      if (s.home !== null && s.away !== null) {
        if (isFt) r.finalScore.set(s.n, [s.home, s.away]);
        else if (isLive) r.liveScore.set(s.n, [s.home, s.away]);
      }
    }
  };

  const resolveGroupSlots = () => {
    const merged = matches.map((m) => (r.finalScore.has(m.n) ? { ...m, ft: r.finalScore.get(m.n) } : m));
    for (const [g, codes] of codesByGroup) {
      const { rows, played } = computeGroupTable(g, merged, codes, nameOf);
      if (played < 6) continue; // group winner/runner-up only certain once complete
      const winner = rows[0]?.code;
      const runner = rows[1]?.code;
      for (const m of matches) {
        if (m.stage !== 'R32') continue;
        const setSide = (side: Side, raw: string) => {
          const gm = GROUP_RE.exec(raw);
          if (!gm || gm[2] !== g) return;
          const code = gm[1] === '1' ? winner : runner;
          const map = side === 'a' ? r.codeA : r.codeB;
          if (code && !map.has(m.n)) map.set(m.n, code);
        };
        setSide('a', m.rawA);
        setSide('b', m.rawB);
      }
    }
  };

  const resolveKnockoutSlots = (): boolean => {
    let changed = false;
    for (const m of matches) {
      if (m.stage === 'GR' || m.stage === 'R32') continue;
      const setSide = (side: Side, raw: string) => {
        const wm = W_RE.exec(raw);
        if (!wm) return;
        const map = side === 'a' ? r.codeA : r.codeB;
        if (map.has(m.n)) return;
        const code = decide(r, Number(wm[2]), wm[1] as 'W' | 'L');
        if (code) {
          map.set(m.n, code);
          changed = true;
        }
      };
      setSide('a', m.rawA);
      setSide('b', m.rawB);
    }
    return changed;
  };

  // fixpoint: live ⇄ resolution, bracket depth is 5 so a handful of passes suffice
  for (let pass = 0; pass < 8; pass++) {
    applyLive();
    resolveGroupSlots();
    const changed = resolveKnockoutSlots();
    if (!changed && pass > 0) break;
  }

  const out = new Map<number, Resolved>();
  for (const m of matches) {
    if (m.stage === 'GR') continue;
    const state = r.state.get(m.n) ?? 'up';
    const score = r.finalScore.get(m.n) ?? r.liveScore.get(m.n) ?? null;
    let won: Side | null = null;
    if (state === 'ft') {
      won = r.winnerSide.get(m.n) ?? (score && score[0] !== score[1] ? (score[0] > score[1] ? 'a' : 'b') : null);
    }
    out.set(m.n, { a: r.codeA.get(m.n), b: r.codeB.get(m.n), state, score, won });
  }
  return out;
}

/* ---- DOM patching ---- */

const FLAG_CLS: Record<string, string> = {
  sm: 'h-3 w-4 shrink-0 rounded-[2px] object-cover',
  md: 'h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover',
};

function ensureFlag(row: HTMLElement, flagIso: string, size: string) {
  const el = row.querySelector<HTMLElement>('[data-flag]');
  if (!el) return;
  const src = flagUrl(flagIso, 40);
  if (el instanceof HTMLImageElement) {
    if (el.src !== src) el.src = src;
    return;
  }
  // swap the dashed placeholder box for a real flag
  const img = document.createElement('img');
  img.dataset.flag = '';
  img.alt = '';
  img.loading = 'lazy';
  img.className = FLAG_CLS[size] ?? FLAG_CLS.md;
  img.src = src;
  el.replaceWith(img);
}

function patchSlot(btn: HTMLElement, side: Side, code: string | undefined, score: number | null, result: '' | 'won' | 'lost', teams: ReturnType<typeof appData>['teams']) {
  const row = btn.querySelector<HTMLElement>(`[data-slot="${side}"]`);
  if (!row) return;
  if (row.dataset.result !== result) row.dataset.result = result;
  if (code) {
    const team = teams[code];
    const label = row.querySelector<HTMLElement>('[data-slot-label]');
    if (team && label && label.textContent !== team.name) label.textContent = team.name;
    if (team) ensureFlag(row, team.flag, btn.dataset.flagsize ?? 'md');
  }
  const scoreEl = row.querySelector<HTMLElement>('[data-slot-score]');
  const text = score !== null ? String(score) : '';
  if (scoreEl && scoreEl.textContent !== text) scoreEl.textContent = text;
}

export default function LiveBracket() {
  useEffect(() => {
    const { matches, teams } = appData();
    if (!document.querySelector('[data-bracket-root]')) return;
    const codesByGroup = new Map<string, string[]>();
    for (const [code, t] of Object.entries(teams)) {
      const list = codesByGroup.get(t.group) ?? [];
      list.push(code);
      codesByGroup.set(t.group, list);
    }
    const nameOf = (code: string) => teams[code]?.name ?? code;
    let lastSig = '';

    const render = (live: LiveMatch[]) => {
      const resolved = resolveBracket(matches, live, codesByGroup, nameOf);
      const sig = JSON.stringify(
        [...resolved.entries()].map(([n, v]) => [n, v.a ?? '', v.b ?? '', v.state, v.score?.join('-') ?? '', v.won ?? '']),
      );
      if (sig === lastSig) return;
      lastSig = sig;

      for (const [n, v] of resolved) {
        const btns = document.querySelectorAll<HTMLElement>(`[data-match][data-n="${n}"]`);
        for (const btn of btns) {
          if (btn.dataset.state !== v.state) btn.dataset.state = v.state;
          patchSlot(btn, 'a', v.a, v.score ? v.score[0] : null, v.won === 'a' ? 'won' : v.won === 'b' ? 'lost' : '', teams);
          patchSlot(btn, 'b', v.b, v.score ? v.score[1] : null, v.won === 'b' ? 'won' : v.won === 'a' ? 'lost' : '', teams);
        }
      }
    };

    return startLivePoll(matches, render);
  }, []);

  return null;
}
