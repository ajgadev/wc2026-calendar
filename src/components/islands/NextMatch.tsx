import { useEffect, useState } from 'react';
import { appData, flagUrl, localTime } from '../../lib/client';
import { LIVE_WINDOW_AFTER_MS } from '../../lib/time';
import type { Match } from '../../lib/types';

/**
 * Slim "next match" countdown shown under the nav. Ticks every second
 * toward the next kickoff. Hides itself while a match is actually on
 * (kickoff … kickoff + 150 min) — the live summary + LIVE badges cover
 * that case — and once the tournament is over. Tap to open the match.
 */

const pad = (n: number) => String(n).padStart(2, '0');
function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

interface Pick {
  match: Match;
  live: boolean;
  msToKick: number;
}

function pickNext(matches: Match[], now: number): Pick | null {
  // a match is "on" from kickoff until +150 min → suppress the countdown
  const onNow = matches.some((m) => {
    const k = Date.parse(m.utc);
    return now >= k && now <= k + LIVE_WINDOW_AFTER_MS;
  });
  if (onNow) return null;
  let next: Match | null = null;
  let bestK = Infinity;
  for (const m of matches) {
    const k = Date.parse(m.utc);
    if (k > now && k < bestK) { bestK = k; next = m; }
  }
  return next ? { match: next, live: false, msToKick: bestK - now } : null;
}

export default function NextMatch() {
  // appData() reads the DOM, so it must run on the client only (not during SSR)
  const [data, setData] = useState<ReturnType<typeof appData> | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { setData(appData()); }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;
  const pick = pickNext(data.matches, now);
  if (!pick) return null;
  const { match: m, msToKick } = pick;
  const { teams, stageLabels } = data;

  const round = m.stage === 'GR' ? `Group ${m.group}` : stageLabels[m.stage] ?? '';

  const side = (code: string | undefined, ph: string | undefined) => {
    const t = code ? teams[code] : undefined;
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {t ? (
          <img src={flagUrl(t.flag)} alt="" width="18" height="18" className="h-[18px] w-[18px] shrink-0 rounded-full object-cover" />
        ) : (
          <span className="box-border h-[18px] w-[18px] shrink-0 rounded-full border border-dashed border-border-strong" />
        )}
        <span className="truncate font-semibold text-text">{t ? t.name : ph ?? 'TBD'}</span>
      </span>
    );
  };

  return (
    <button
      type="button"
      data-open-match={m.n}
      aria-label={`Next match in ${fmtCountdown(msToKick)}`}
      className="focus-ring mt-3 flex w-full items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-3.5 py-2 text-left hover:border-border-strong"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--color-live)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5M9 2h6" />
        </svg>
        <span className="t-micro font-bold tracking-[0.1em] text-text-dim">NEXT</span>
      </span>
      <span className="disp tnum shrink-0 font-black tracking-[0.02em] text-text" style={{ fontSize: '15px', fontVariantNumeric: 'tabular-nums' }}>
        {fmtCountdown(msToKick)}
      </span>
      <span className="hidden min-w-0 flex-1 items-center gap-2 t-meta sm:flex">
        {side(m.a, m.pa)}
        <span className="shrink-0 text-text-dim">v</span>
        {side(m.b, m.pb)}
      </span>
      <span className="ml-auto shrink-0 t-micro whitespace-nowrap text-text-3">
        {round}{round ? ' · ' : ''}{localTime(m.utc)}
      </span>
    </button>
  );
}
