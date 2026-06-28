import { inLiveWindow } from './time';
import type { LiveMatch } from './types';

/**
 * Shared live-poll loop for the recompute islands (LiveStandings,
 * LiveStats). Mirrors LiveOverlay's cadence: fetch /api/live only while a
 * match is inside its live window — kickoff − 20 min … +150 min — or a
 * recently finished match still needs a catch-up (the gap between
 * full-time and the nightly rebuild). Pauses on hidden tabs; backs off to
 * the next window when nothing is in play; degrades silently on 503
 * (no FOOTBALL_DATA_TOKEN) or fetch error. Calls `onLive` with each
 * successful payload; the caller does the merge + DOM patch.
 */

const POLL_MS = 60_000;

interface PollMatch {
  n: number;
  a?: string;
  utc: string;
  ft?: [number, number];
}

export function startLivePoll(
  matches: PollMatch[],
  onLive: (live: LiveMatch[]) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let didCatchup = false;
  let catchupTries = 0;

  const anyWindowOpen = (now: number) => matches.some((m) => inLiveWindow(m.utc, now));
  const needsCatchup = (now: number) =>
    !didCatchup &&
    catchupTries < 3 &&
    matches.some(
      (m) => m.a && !m.ft && Date.parse(m.utc) < now - 150 * 60_000 && now - Date.parse(m.utc) < 48 * 3600_000,
    );
  const nextWindowStart = (now: number): number | null => {
    let best: number | null = null;
    for (const m of matches) {
      const start = Date.parse(m.utc) - 20 * 60_000;
      if (start > now && (best === null || start < best)) best = start;
    }
    return best;
  };
  const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const schedule = (ms: number | null) => {
    if (timer) clearTimeout(timer);
    if (ms !== null && !stopped) timer = setTimeout(poll, ms);
  };

  async function poll() {
    if (stopped) return;
    const now = Date.now();
    if (document.visibilityState === 'hidden') {
      schedule(POLL_MS);
      return;
    }
    const windowOpen = anyWindowOpen(now);
    if (!windowOpen && !needsCatchup(now)) {
      const next = nextWindowStart(now);
      schedule(next ? Math.min(next - now, 30 * 60_000) : null);
      return;
    }
    try {
      const res = await fetch(`/api/live?dateFrom=${isoDay(-2)}&dateTo=${isoDay(1)}`);
      if (!res.ok) throw new Error(String(res.status));
      onLive((await res.json()) as LiveMatch[]);
      didCatchup = true;
    } catch {
      catchupTries++;
    }
    if (windowOpen) schedule(POLL_MS);
    else {
      const next = nextWindowStart(now);
      schedule(needsCatchup(now) ? POLL_MS : next ? Math.min(next - now, 30 * 60_000) : null);
    }
  }

  const onVis = () => {
    if (document.visibilityState === 'visible') poll();
  };
  document.addEventListener('visibilitychange', onVis);
  poll();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVis);
  };
}

/** Clone matches, overwriting `ft` for any live FINISHED/AWARDED result. */
export function mergeFinals<T extends { n: number; ft?: [number, number] }>(
  matches: T[],
  finals: Map<number, [number, number]>,
): T[] {
  if (!finals.size) return matches;
  return matches.map((m) => (finals.has(m.n) ? { ...m, ft: finals.get(m.n) } : m));
}
