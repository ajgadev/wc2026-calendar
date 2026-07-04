import { useEffect } from 'react';
import { ESPN_SCOREBOARD, matchEspnEventToMatch } from '../../lib/cards';
import { appData, flagUrl, getFollows } from '../../lib/client';
import { joinLive, type LiveStatus } from '../../lib/merge';
import { decide, penCell } from '../../lib/result';
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

/**
 * Live match minute, sourced from ESPN — football-data's WC feed sends
 * `minute: null` for every match, so the score updates but the clock
 * never does. ESPN's scoreboard carries an authoritative displayClock
 * ("67'", "90'+3'") and state ('pre' | 'in' | 'post'). Keyless, CORS-open.
 * Returns match-number → clock text for matches currently in play.
 */
async function fetchEspnMinutes(
  matches: { n: number; a?: string; b?: string }[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  try {
    const res = await fetch(ESPN_SCOREBOARD);
    if (!res.ok) return out;
    const data = (await res.json()) as { events?: Record<string, unknown>[] };
    for (const ev of data.events ?? []) {
      const st = (ev as { competitions?: { status?: { type?: { state?: string; name?: string }; displayClock?: string } }[] })
        .competitions?.[0]?.status;
      const state = st?.type?.state;
      if (state === 'pre' || state === 'post') continue; // only in-progress / halftime
      // matchEspnEventToMatch reads competitors/team codes off the raw event
      const hit = matchEspnEventToMatch(ev as Parameters<typeof matchEspnEventToMatch>[0], matches);
      if (!hit) continue;
      out.set(hit.match.n, /half/i.test(st?.type?.name ?? '') ? 'HT' : st?.displayClock ?? '');
    }
  } catch { /* ESPN optional — football-data still drives score + state */ }
  return out;
}

/** Match-number → team codes + display names, built once from the data blob. */
let lookup: {
  teams: Map<number, { a?: string; b?: string }>;
  pens: Map<number, [number, number]>;
  names: Record<string, { name: string; flag: string }>;
} | null = null;
function lookups() {
  if (!lookup) {
    const { matches, teams } = appData();
    lookup = {
      teams: new Map(matches.map((m) => [m.n, { a: m.a, b: m.b }])),
      pens: new Map(matches.filter((m) => m.pens).map((m) => [m.n, m.pens!])),
      names: Object.fromEntries(Object.entries(teams).map(([c, t]) => [c, { name: t.name, flag: t.flag }])),
    };
  }
  return lookup;
}

function toastHost(): HTMLElement {
  let host = document.getElementById('wc-toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'wc-toasts';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

/** In-page toast when a side's tally goes up. Tap to dismiss; auto-clears. */
function goalToast(code: string, score: string, minute: string) {
  const team = lookups().names[code];
  const host = toastHost();
  const el = document.createElement('div');
  el.className = 'goal-toast';
  el.setAttribute('role', 'status');

  if (team?.flag) {
    const img = document.createElement('img');
    img.className = 'goal-toast__flag';
    img.src = flagUrl(team.flag, 40);
    img.alt = '';
    el.appendChild(img);
  }
  const text = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'goal-toast__title';
  title.textContent = minute ? `GOAL · ${minute}` : 'GOAL';
  const body = document.createElement('div');
  body.className = 'goal-toast__body';
  body.textContent = `${team?.name ?? code} · ${score}`;
  text.append(title, body);
  el.appendChild(text);

  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));

  const dismiss = () => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 300);
  };
  el.addEventListener('click', dismiss);
  setTimeout(dismiss, 6000);
}

function patch(statuses: LiveStatus[], minutes?: Map<number, string>) {
  for (const s of statuses) {
    const els = document.querySelectorAll<HTMLElement>(`[data-match][data-n="${s.n}"]`);
    if (!els.length) continue;
    const isLive = s.status === 'IN_PLAY' || s.status === 'PAUSED';
    const isFt = s.status === 'FINISHED' || s.status === 'AWARDED';
    if (!isLive && !isFt) continue; // SCHEDULED/TIMED/POSTPONED/SUSPENDED → keep "upcoming"
    const score = s.home !== null && s.away !== null ? `${s.home}–${s.away}` : '';
    // Knockout decider: the feed names a winner even when full time is
    // level (a penalty shootout). At full time fold it into the scoreline —
    // the static pen tally gives "1–1 (4–3p)", else the live winner gives
    // "1–1 pens" — and mark the winning side so the bold/dim/arrow CSS
    // fires. The tally itself lands with the nightly rebuild.
    // Prefer the shootout tally from the live feed; fall back to the nightly-baked one.
    const pens = s.pens ?? lookups().pens.get(s.n) ?? null;
    const decided = isFt && s.home !== null && s.away !== null ? decide([s.home, s.away], pens, s.winner) : null;
    const win = decided?.win ?? null;
    const scoreText = decided ? decided.scoreText : score;
    // ESPN clock first (football-data has none); HT for paused; else blank
    const minute = isFt ? '' : minutes?.get(s.n) ?? (s.status === 'PAUSED' ? 'HT' : s.minute != null ? `${s.minute}'` : '');
    for (const el of els) {
      el.dataset.state = isLive ? 'live' : 'ft';
      if (win) el.dataset.win = win;
      else delete el.dataset.win;
      el.querySelectorAll<HTMLElement>('[data-minute]').forEach((n) => { n.textContent = minute; });
      // combined score (agenda rows) + split per-team scores (calendar chips)
      el.querySelectorAll<HTMLElement>('[data-score]').forEach((n) => {
        if (scoreText && n.textContent !== scoreText) n.textContent = scoreText;
      });
      if (s.home !== null) el.querySelectorAll<HTMLElement>('[data-score-home]').forEach((n) => { n.textContent = penCell(s.home!, pens?.[0]); });
      if (s.away !== null) el.querySelectorAll<HTMLElement>('[data-score-away]').forEach((n) => { n.textContent = penCell(s.away!, pens?.[1]); });
      if (score && prevScores.get(s.n) !== undefined && prevScores.get(s.n) !== score) {
        // the one allowed effect besides the LIVE pulse: a brief flash
        el.querySelectorAll<HTMLElement>('.score-slot').forEach((slot) => {
          slot.classList.remove('score-flash');
          void slot.offsetWidth; // restart the animation
          slot.classList.add('score-flash');
        });
      }
    }
    // goal toast — fire once per scoreline change, after a known prior score
    // (skips the first sighting of a match, so a page load mid-match is quiet)
    const prev = prevScores.get(s.n);
    if (score && prev !== undefined && prev !== score) {
      const [ph, pa] = prev.split('–').map(Number);
      const scoredSide = s.home !== null && s.home > ph ? 0 : s.away !== null && s.away > pa ? 1 : -1;
      if (scoredSide >= 0) {
        const m = lookups().teams.get(s.n);
        const code = scoredSide === 0 ? m?.a : m?.b;
        if (code) goalToast(code, score, minute);
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
        const statuses = joinLive(matches, live);
        // pull the live clock from ESPN only when something is actually in play
        const anyLive = statuses.some((s) => s.status === 'IN_PLAY' || s.status === 'PAUSED');
        const minutes = anyLive ? await fetchEspnMinutes(matches) : undefined;
        patch(statuses, minutes);
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
