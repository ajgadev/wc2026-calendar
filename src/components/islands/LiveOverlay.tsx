import { useEffect } from 'react';
import { appData, getFollows } from '../../lib/client';
import { joinLive, type LiveStatus } from '../../lib/merge';
import { inLiveWindow } from '../../lib/time';
import type { LiveMatch } from '../../lib/types';

/**
 * Invisible coordinator island. Polls /api/live every 60s, but ONLY
 * while at least one match is inside its live window (kickoff − 20 min
 * … kickoff + 150 min, computed from the static schedule); pauses when
 * the tab is hidden. Live data is overlaid on the statically rendered
 * rows/chips by patching data-state / [data-minute] / [data-score] in
 * place. On failure it shows the quiet outage note and the static
 * layer keeps rendering — never blocks anything.
 */

const POLL_MS = 60_000;
const prevScores = new Map<number, string>();

function patch(statuses: LiveStatus[]) {
  for (const s of statuses) {
    const els = document.querySelectorAll<HTMLElement>(`[data-match][data-n="${s.n}"]`);
    if (!els.length) continue;
    const isLive = s.status === 'IN_PLAY' || s.status === 'PAUSED';
    const isFt = s.status === 'FINISHED' || s.status === 'AWARDED';
    if (!isLive && !isFt) continue; // SCHEDULED/TIMED/POSTPONED/SUSPENDED → keep "upcoming"
    const score = s.home !== null && s.away !== null ? `${s.home}–${s.away}` : '';
    const minute = s.status === 'PAUSED' ? 'HT' : s.minute != null ? `${s.minute}'` : '';
    for (const el of els) {
      el.dataset.state = isLive ? 'live' : 'ft';
      el.querySelectorAll<HTMLElement>('[data-minute]').forEach((n) => { n.textContent = minute; });
      el.querySelectorAll<HTMLElement>('[data-score]').forEach((n) => {
        if (score && n.textContent !== score) n.textContent = score;
      });
      if (score && prevScores.get(s.n) !== undefined && prevScores.get(s.n) !== score) {
        // the one allowed effect besides the LIVE pulse: a brief flash
        el.querySelectorAll<HTMLElement>('.score-slot').forEach((slot) => {
          slot.classList.remove('score-flash');
          void slot.offsetWidth; // restart the animation
          slot.classList.add('score-flash');
        });
      }
    }
    if (score) prevScores.set(s.n, score);
  }

  const liveCount = statuses.filter((s) => s.status === 'IN_PLAY' || s.status === 'PAUSED').length;
  const summary = document.querySelector<HTMLElement>('[data-live-summary]');
  if (summary) summary.textContent = liveCount ? `● ${liveCount} LIVE` : '';
  if (summary) summary.style.color = liveCount ? 'var(--color-live)' : '';
}

function setOutage(on: boolean) {
  const banner = document.querySelector<HTMLElement>('[data-outage-banner]');
  if (banner) banner.hidden = !on;
}

export default function LiveOverlay() {
  useEffect(() => {
    const { matches } = appData();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const anyWindowOpen = (now: number) => matches.some((m) => inLiveWindow(m.utc, now));

    // Results gap: between a match ending and the nightly rebuild, the
    // static layer has no score and no live window is open. One
    // catch-up fetch per page load patches recently finished matches.
    let didCatchup = false;
    let catchupTries = 0;
    const needsCatchup = (now: number) =>
      !didCatchup &&
      catchupTries < 3 &&
      matches.some(
        (m) =>
          m.a &&
          !m.ft &&
          Date.parse(m.utc) < now - 150 * 60_000 &&
          now - Date.parse(m.utc) < 48 * 3600_000,
      );

    const nextWindowStart = (now: number): number | null => {
      let best: number | null = null;
      for (const m of matches) {
        const start = Date.parse(m.utc) - 20 * 60_000;
        if (start > now && (best === null || start < best)) best = start;
      }
      return best;
    };

    const isoDay = (offsetDays: number) =>
      new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

    const poll = async () => {
      if (stopped) return;
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        schedule(POLL_MS);
        return;
      }
      const windowOpen = anyWindowOpen(now);
      if (!windowOpen && !needsCatchup(now)) {
        setOutage(false);
        const next = nextWindowStart(now);
        schedule(next ? Math.min(next - now, 30 * 60_000) : null);
        return;
      }
      try {
        const res = await fetch(`/api/live?dateFrom=${isoDay(-2)}&dateTo=${isoDay(1)}`);
        if (!res.ok) throw new Error(String(res.status));
        const live = (await res.json()) as LiveMatch[];
        patch(joinLive(matches, live));
        setOutage(false);
        didCatchup = true;
        notifyFollowedKickoffs(now);
      } catch {
        if (windowOpen) setOutage(true); // quiet note; static layer stays up
        catchupTries++;
      }
      if (windowOpen) {
        schedule(POLL_MS);
      } else {
        const next = nextWindowStart(now);
        schedule(needsCatchup(now) ? POLL_MS : next ? Math.min(next - now, 30 * 60_000) : null);
      }
    };

    const schedule = (ms: number | null) => {
      if (timer) clearTimeout(timer);
      if (ms !== null && !stopped) timer = setTimeout(poll, ms);
    };

    const notifyFollowedKickoffs = (now: number) => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const follows = getFollows();
      if (!follows.length) return;
      for (const m of matches) {
        if (!m.a || !m.b) continue;
        if (!follows.includes(m.a) && !follows.includes(m.b)) continue;
        const lead = Date.parse(m.utc) - now;
        if (lead > 28 * 60_000 && lead <= 31 * 60_000) {
          const key = `wc26-notified-${m.n}`;
          try {
            if (sessionStorage.getItem(key)) continue;
            sessionStorage.setItem(key, '1');
          } catch { /* ignore */ }
          new Notification('Kickoff in 30 minutes', { body: `${m.a} vs ${m.b} — World Cup 2026` });
        }
      }
    };

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
  }, []);

  return null;
}
