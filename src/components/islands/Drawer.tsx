import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  appData,
  flagUrl,
  getFollows,
  localTime,
  onFollowsChange,
  toggleFollow,
} from '../../lib/client';
import { matchVideoToMatch } from '../../lib/highlights';
import { sportsDbNameFor } from '../../data/teamNames';
import {
  ESPN_SCOREBOARD,
  matchEspnEventToMatch,
  parseEspnBroadcasts,
  parseEspnCards,
  parseEspnGoals,
  type CardEvent,
  type EspnEvent,
  type GoalEvent,
  type MatchDetailsArchive,
} from '../../lib/cards';
import { BROADCAST_RIGHTS, DE_MATCH_FTA, SDB_COUNTRY_NAMES, detectMarket } from '../../data/broadcasters';
import { teamCodeFor } from '../../data/teamNames';
import {
  ESPN_SUMMARY,
  layoutLineup,
  parseEspnLineups,
  type MatchLineups,
  type PlacedPlayer,
} from '../../lib/lineups';
import type { Goal, Highlight, Match, Stadium } from '../../lib/types';

/**
 * Slide-over drawer for teams and matches. Statically rendered rows
 * carry data-open-team / data-open-match; this island listens via
 * event delegation so the page itself stays static HTML.
 */

type DrawerState = { type: 'team'; code: string } | { type: 'match'; n: number } | null;

/* ---------- lazy data caches (one fetch per session) ---------- */

let playersPromise: Promise<Record<string, PlayerOut[]>> | null = null;
interface PlayerOut { name: string; position: string; shirtNumber: number | null; dob: string | null; photoUrl: string | null }
function fetchPlayers() {
  playersPromise ??= fetch('/data/players.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return playersPromise;
}

let archivePromise: Promise<Record<string, Highlight>> | null = null;
function fetchHighlightArchive() {
  archivePromise ??= fetch('/data/highlights.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return archivePromise;
}

let detailsPromise: Promise<MatchDetailsArchive> | null = null;
function fetchMatchDetails() {
  detailsPromise ??= fetch('/data/matchDetails.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return detailsPromise;
}

/**
 * Cards for one match: the committed archive first; for matches the
 * daily Action hasn't covered yet (just finished / in play), fall back
 * to ESPN's scoreboard directly from the browser (CORS open), cached
 * in sessionStorage so each day is fetched at most once per session.
 * Live matches skip the session cache so cards keep arriving.
 */
async function espnDayEvents(day: string, fresh: boolean): Promise<EspnEvent[]> {
  const cacheKey = `wc26-espn-${day}`;
  if (!fresh) {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
  }
  const res = await fetch(`${ESPN_SCOREBOARD}?dates=${day.replace(/-/g, '')}`);
  if (!res.ok) return [];
  const events = ((await res.json()) as { events?: EspnEvent[] | null }).events ?? [];
  if (!fresh) {
    try { sessionStorage.setItem(cacheKey, JSON.stringify(events)); } catch { /* ignore */ }
  }
  return events;
}

/** ESPN buckets by US-Eastern-ish dates — try venue date, then UTC date. */
async function findEspnEvent(m: Match, venueDay: string, fresh: boolean) {
  const days = [...new Set([venueDay, m.utc.slice(0, 10)])];
  for (const day of days) {
    for (const event of await espnDayEvents(day, fresh)) {
      const hit = matchEspnEventToMatch(event, [m]);
      if (hit) return { event, ...hit };
    }
  }
  return null;
}

async function fetchEventDetailsFor(
  m: Match,
  venueDay: string,
  live: boolean,
): Promise<{ cards: CardEvent[]; goals: GoalEvent[] }> {
  const archive = await fetchMatchDetails();
  const archived = archive[String(m.n)];
  if (archived) return { cards: archived.cards, goals: archived.goals ?? [] };
  try {
    const hit = await findEspnEvent(m, venueDay, live);
    if (hit) {
      return {
        cards: parseEspnCards(hit.event, hit.homeIsA, hit.homeTeamId),
        goals: parseEspnGoals(hit.event, hit.homeIsA, hit.homeTeamId),
      };
    }
  } catch { /* silently absent — never an error state */ }
  return { cards: [], goals: [] };
}

/**
 * Lineups: archive first; otherwise the ESPN summary endpoint —
 * lineups publish ~1h before kickoff, so the drawer also asks for
 * upcoming matches inside that window.
 */
async function fetchLineupsFor(m: Match, venueDay: string, fresh: boolean): Promise<MatchLineups | null> {
  const archive = await fetchMatchDetails();
  const archived = archive[String(m.n)];
  if (archived?.lineups) return archived.lineups;
  try {
    const hit = await findEspnEvent(m, venueDay, fresh);
    if (!hit?.event.id || !m.a) return null;
    const cacheKey = `wc26-espn-sum-${hit.event.id}`;
    if (!fresh) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) return parseEspnLineups(JSON.parse(cached), m.a);
    }
    const res = await fetch(`${ESPN_SUMMARY}?event=${hit.event.id}`);
    if (!res.ok) return null;
    const summary = await res.json();
    if (!fresh) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ rosters: summary.rosters })); } catch { /* ignore */ }
    }
    return parseEspnLineups(summary, m.a);
  } catch {
    return null; // lineups silently absent — never an error state
  }
}

const normName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').trim();

/** Inline kit-number chip — visually distinct from minutes ("67'"). */
function NumChip({ n }: { n: number | null | undefined }) {
  if (n == null) return null;
  return (
    <span className="tnum mr-1 inline-flex min-w-[18px] items-center justify-center rounded-[3px] border border-border-strong px-[3px] font-mono text-[10px] leading-[15px] text-text-3">
      {n}
    </span>
  );
}

/** Card icon — CSS rect, not emoji; YR = second yellow (red with yellow notch). */
function CardIcon({ type }: { type: CardEvent['type'] }) {
  const base: import('react').CSSProperties = {
    display: 'inline-block', width: 9, height: 12, borderRadius: 2, verticalAlign: '-1px',
  };
  if (type === 'Y') return <span style={{ ...base, background: '#FFD60A' }} title="Yellow card" />;
  if (type === 'R') return <span style={{ ...base, background: '#E5484D' }} title="Red card" />;
  return (
    <span style={{ ...base, background: 'linear-gradient(135deg, #FFD60A 45%, #E5484D 55%)' }} title="Second yellow → red" />
  );
}

let rssPromise: Promise<Highlight[]> | null = null;
function fetchHighlightRss() {
  rssPromise ??= fetch('/api/highlights')
    .then((r) => (r.ok ? r.json() : []))
    .then((v) => (Array.isArray(v) ? v : []))
    .catch(() => []);
  return rssPromise;
}

interface SportsDbInfo {
  badge: string | null;
  founded: string | null;
  stadium: string | null;
  description: string | null;
}

async function fetchSportsDb(code: string): Promise<SportsDbInfo | null> {
  const key = `wc26-sdb-${code}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }
  try {
    const name = sportsDbNameFor(code);
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=${encodeURIComponent(name)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { teams?: Record<string, string | null>[] | null };
    const soccer = (data.teams ?? []).filter((t) => t?.strSport === 'Soccer');
    const team =
      soccer.find((t) => (t.strTeam ?? '').toLowerCase() === name.toLowerCase()) ?? soccer[0];
    if (!team) return null;
    const info: SportsDbInfo = {
      badge: team.strBadge ?? null,
      founded: team.intFormedYear ?? null,
      stadium: team.strStadium ?? null,
      description: team.strDescriptionEN ?? null,
    };
    try { sessionStorage.setItem(key, JSON.stringify(info)); } catch { /* ignore */ }
    return info;
  } catch {
    return null;
  }
}

/* ---------- shared bits ---------- */

const POS_LABELS: Record<string, string> = { GK: 'GOALKEEPERS', DEF: 'DEFENDERS', MID: 'MIDFIELD', FWD: 'FORWARDS' };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

function age(dob: string | null): string {
  if (!dob) return '';
  const years = Math.floor((Date.now() - Date.parse(dob)) / (365.25 * 86_400_000));
  return Number.isFinite(years) && years > 10 ? `${years} y` : '';
}

function venueLocalTime(utc: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(utc));
  } catch {
    return '';
  }
}

function domMatchState(n: number) {
  // The LiveOverlay patches the static rows; the drawer reads from them
  // so both always agree on live state.
  const row = document.querySelector<HTMLElement>(`[data-match][data-n="${n}"]`);
  const state = (row?.dataset.state ?? 'up') as 'up' | 'live' | 'ft';
  const score = row?.querySelector('[data-score]')?.textContent || null;
  const minute = row?.querySelector('[data-minute]')?.textContent || null;
  return { state, score, minute };
}

const cardCls = 'flex flex-col gap-1 rounded-(--radius-row) border border-border px-3.5 py-3';
const microHead = 't-micro font-bold tracking-[0.12em] text-text-dim';
const btnCls = 'focus-ring inline-flex min-h-[44px] items-center gap-2 rounded-[9px] border border-border-strong px-3.5 py-2 t-meta font-semibold text-text hover:bg-surface-2';

/* ---------- team drawer ---------- */

function TeamDrawer({ code, openMatch }: { code: string; openMatch: (n: number) => void }) {
  const { matches, teams, stadiums, stageLabels } = appData();
  const team = teams[code];
  const [follows, setFollows] = useState<string[]>(() => getFollows());
  const [info, setInfo] = useState<SportsDbInfo | null | 'loading'>('loading');
  const [squad, setSquad] = useState<PlayerOut[] | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cardTotals, setCardTotals] = useState<Record<string, { y: number; r: number }>>({});

  useEffect(() => {
    let alive = true;
    setInfo('loading');
    setSquad(null);
    setDescOpen(false);
    setCardTotals({});
    fetchSportsDb(code).then((v) => alive && setInfo(v));
    fetchPlayers().then((all) => alive && setSquad(all[code] ?? null));
    // tournament card totals per player (from the archived timelines)
    fetchMatchDetails().then((archive) => {
      if (!alive) return;
      const totals: Record<string, { y: number; r: number }> = {};
      for (const m of matches) {
        if (m.a !== code && m.b !== code) continue;
        const det = archive[String(m.n)];
        if (!det) continue;
        const side = m.a === code ? 0 : 1;
        for (const c of det.cards) {
          if (c.side !== side) continue;
          const k = normName(c.player);
          totals[k] ??= { y: 0, r: 0 };
          if (c.type === 'Y') totals[k].y++;
          else totals[k].r++;
        }
      }
      setCardTotals(totals);
    });
    return () => { alive = false; };
  }, [code]);

  useEffect(() => onFollowsChange(setFollows), []);

  if (!team) return null;
  const following = follows.includes(code);
  const fixtures = matches
    .filter((m) => m.a === code || m.b === code)
    .sort((x, y) => Date.parse(x.utc) - Date.parse(y.utc));
  const hostVar = code === 'MEX' ? 'var(--color-host-mx)' : code === 'USA' ? 'var(--color-host-us)' : 'var(--color-host-ca)';

  const icsPath = `/api/calendar.ics?team=${code}`;
  const copyIcs = async () => {
    const url = `webcal://${location.host}${icsPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt('Subscribe to this URL in your calendar app:', url);
    }
  };

  const byPos: Record<string, PlayerOut[]> = {};
  for (const p of squad ?? []) (byPos[p.position] ??= []).push(p);

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-10">
      <div className="flex items-center gap-3.5">
        <img src={flagUrl(team.flag, 160)} alt="" className="h-[46px] w-16 rounded-md border border-border-strong object-cover" />
        <div className="flex min-w-0 flex-col gap-[5px]">
          <span className="disp t-h1 leading-[1.05] font-black text-text">{team.name}</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-micro rounded-(--radius-chip) border border-border-strong px-[7px] py-[2px] font-bold tracking-[0.08em] whitespace-nowrap text-text-3">GROUP {team.group}</span>
            {team.host && (
              <span className="t-micro rounded-(--radius-chip) px-[7px] py-[2px] font-bold tracking-[0.08em]" style={{ color: hostVar, border: `1px solid color-mix(in srgb, ${hostVar} 45%, transparent)` }}>HOST</span>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-pressed={following}
          onClick={() => toggleFollow(code)}
          className="focus-ring ml-auto min-h-[44px] rounded-[9px] border px-4 py-2 t-meta font-bold whitespace-nowrap text-text"
          style={{
            borderColor: following ? 'var(--color-text-2)' : 'var(--color-border-strong)',
            background: following ? 'var(--color-surface-2)' : 'transparent',
          }}
        >
          {following ? '★ Following' : '☆ Follow'}
        </button>
      </div>

      {/* TheSportsDB info */}
      {info === 'loading' && <div className="t-meta text-text-dim">Loading team info…</div>}
      {info && info !== 'loading' && (info.description || info.founded || info.stadium) && (
        <div className={cardCls}>
          <span className={microHead}>TEAM</span>
          {info.description && (
            <p className="t-meta m-0 leading-relaxed text-text-2">
              {descOpen || info.description.length <= 280 ? info.description : `${info.description.slice(0, 280).trimEnd()}… `}
              {info.description.length > 280 && (
                <button type="button" onClick={() => setDescOpen((v) => !v)} className="t-meta font-semibold text-text-3 underline underline-offset-2">
                  {descOpen ? 'less' : 'more'}
                </button>
              )}
            </p>
          )}
          <span className="t-micro text-text-3">
            {[info.founded ? `Founded ${info.founded}` : null, info.stadium ? `Home — ${info.stadium}` : null].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}
      {info === null && (
        <div className="t-micro rounded-(--radius-row) border border-dashed border-border-strong px-3.5 py-3 text-text-3">
          Team profile unavailable right now — fixtures below are always local.
        </div>
      )}

      {/* squad grid */}
      {squad && squad.length > 0 ? (
        <div className="flex flex-col gap-4">
          <span className="disp t-team font-extrabold tracking-[0.04em] text-text">SQUAD · {squad.length}</span>
          {(['GK', 'DEF', 'MID', 'FWD'] as const).filter((p) => byPos[p]?.length).map((p) => (
            <div key={p} className="flex flex-col gap-2">
              <span className="t-micro font-bold tracking-[0.14em] text-text-dim">{POS_LABELS[p]}</span>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-2">
                {byPos[p].map((pl) => (
                  <div key={pl.name} className="flex flex-col gap-1.5">
                    <div className="relative flex items-center justify-center overflow-hidden rounded-[9px] border border-border bg-surface-2" style={{ aspectRatio: '1 / 1.08' }}>
                      {pl.photoUrl ? (
                        <img src={pl.photoUrl} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).remove(); }} />
                      ) : (
                        <span className="disp text-[20px] font-black text-text-3">{initials(pl.name)}</span>
                      )}
                      {pl.shirtNumber != null && (
                        <span className="disp tnum absolute right-1.5 bottom-[5px] rounded-(--radius-chip) px-1.5 py-px text-[13px] font-black text-text" style={{ background: 'color-mix(in srgb, var(--color-bg) 72%, transparent)' }}>
                          {pl.shirtNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-px px-0.5">
                      <span className="t-micro truncate font-semibold whitespace-nowrap text-text-2">{pl.name}</span>
                      <span className="flex items-center gap-1 truncate text-[10px] whitespace-nowrap text-text-dim">
                        {age(pl.dob)}
                        {(() => {
                          const t = cardTotals[normName(pl.name)];
                          if (!t) return null;
                          return (
                            <>
                              {t.y > 0 && <span className="inline-flex items-center gap-px"><CardIcon type="Y" />{t.y > 1 ? t.y : ''}</span>}
                              {t.r > 0 && <span className="inline-flex items-center gap-px"><CardIcon type="R" />{t.r > 1 ? t.r : ''}</span>}
                            </>
                          );
                        })()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        squad !== null && (
          <div className="t-meta rounded-(--radius-row) border border-dashed border-border-strong px-4 py-4 leading-relaxed text-text-3">
            Squad list not available yet — it lands automatically once rosters are published.
          </div>
        )
      )}

      {/* fixtures */}
      <div className="flex flex-col gap-2">
        <span className="disp t-team font-extrabold tracking-[0.04em] text-text">FIXTURES</span>
        <div className="flex flex-col">
          {fixtures.map((m) => {
            const home = m.a === code;
            const opp = home ? m.b : m.a;
            const oppTeam = opp ? teams[opp] : null;
            const dom = domMatchState(m.n);
            const ft = m.ft;
            let mid: string;
            let midColor = 'var(--color-text-2)';
            let res = '';
            if (dom.state === 'live' && dom.score) {
              mid = `${dom.score} · ${dom.minute ?? 'live'}`;
              midColor = 'var(--color-live)';
            } else if (ft) {
              const [gf, ga] = home ? ft : [ft[1], ft[0]];
              mid = `${gf}–${ga}`;
              midColor = 'var(--color-text)';
              res = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
            } else {
              mid = localTime(m.utc);
            }
            return (
              <button
                key={m.n}
                type="button"
                onClick={() => openMatch(m.n)}
                className="focus-ring tnum grid min-h-12 grid-cols-[72px_minmax(0,1fr)_auto_30px] items-center gap-2.5 border-t border-border px-1 py-1.5 hover:bg-surface"
              >
                <span className="flex flex-col gap-px">
                  <span className="t-micro font-semibold text-text-3">{m.utc.slice(5, 10).replace('-', '/')}</span>
                  <span className="text-[10px] tracking-[0.06em] text-text-dim">{m.stage === 'GR' ? `MD${m.md}` : stageLabels[m.stage]}</span>
                </span>
                <span className="flex min-w-0 items-center gap-[7px]">
                  <span className="t-micro text-text-dim">v</span>
                  {oppTeam
                    ? <img src={flagUrl(oppTeam.flag)} alt="" className="h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover" />
                    : <span className="box-border h-[13px] w-[18px] shrink-0 rounded-[2px] border border-dashed border-border-strong" />}
                  <span className="t-meta truncate font-semibold whitespace-nowrap text-text-2">
                    {oppTeam ? oppTeam.name : (home ? m.pb : m.pa)}
                  </span>
                </span>
                <span className="disp t-meta font-extrabold whitespace-nowrap" style={{ color: midColor }}>{mid}</span>
                <span className="disp t-micro text-center font-extrabold" style={{ color: res === 'W' ? 'var(--color-text)' : 'var(--color-text-3)' }}>{res}</span>
              </button>
            );
          })}
          <span className="t-micro mt-1 text-text-dim">{fixturesNote(fixtures)}</span>
        </div>
      </div>

      {/* calendar + reminders */}
      <div className="flex flex-col gap-2">
        <span className="disp t-team font-extrabold tracking-[0.04em] text-text">YOUR CALENDAR</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyIcs} className={btnCls}>
            {copied ? '✓ Link copied' : '📅 Copy calendar link'}
          </button>
          <a href={icsPath} className={btnCls} style={{ textDecoration: 'none' }}>Download .ics</a>
          <RemindButton />
        </div>
        <span className="t-micro leading-relaxed text-text-dim">
          Google Calendar: Settings → Add calendar → From URL, paste the link. Apple Calendar: File → New Calendar Subscription.
          Scores are added to event titles as results land.
        </span>
      </div>
    </div>
  );
}

function fixturesNote(fixtures: Match[]): string {
  const left = fixtures.filter((m) => !m.ft).length;
  return left > 0 ? `${left} ${left === 1 ? 'fixture' : 'fixtures'} remaining` : 'Tournament complete';
}

function RemindButton() {
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  if (perm === 'unsupported') return null;
  if (perm === 'granted') {
    return <span className="t-micro inline-flex items-center px-1 text-text-3">🔔 Kickoff reminders on (while a tab is open)</span>;
  }
  return (
    <button
      type="button"
      className={btnCls}
      onClick={async () => setPerm(await Notification.requestPermission())}
    >
      🔔 Remind me 30 min before kickoff
    </button>
  );
}

/* ---------- where to watch ---------- */

interface SdbTvRow { country: string; channel: string }

/** Per-match channels by country from TheSportsDB (spotty but free). */
async function fetchSdbTv(m: Match, venueDay: string): Promise<SdbTvRow[]> {
  try {
    const cacheKey = `wc26-sdbtv-${m.n}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
    // find TheSportsDB's event id for this match
    let eventId: string | null = null;
    for (const day of [...new Set([venueDay, m.utc.slice(0, 10)])]) {
      const res = await fetch(`https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${day}&s=Soccer`);
      if (!res.ok) continue;
      const data = (await res.json()) as { events?: { idEvent?: string; strLeague?: string; strHomeTeam?: string; strAwayTeam?: string }[] | null };
      for (const e of data.events ?? []) {
        if (!/world cup/i.test(e.strLeague ?? '')) continue;
        const home = teamCodeFor(e.strHomeTeam ?? '');
        const away = teamCodeFor(e.strAwayTeam ?? '');
        if ((home === m.a && away === m.b) || (home === m.b && away === m.a)) {
          eventId = e.idEvent ?? null;
          break;
        }
      }
      if (eventId) break;
    }
    if (!eventId) return [];
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/123/lookuptv.php?id=${eventId}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { tvevent?: { strCountry?: string; strChannel?: string }[] | null };
    const rows = (data.tvevent ?? [])
      .filter((t) => t.strCountry && t.strChannel)
      .map((t) => ({ country: t.strCountry!, channel: t.strChannel! }));
    try { sessionStorage.setItem(cacheKey, JSON.stringify(rows)); } catch { /* ignore */ }
    return rows;
  } catch {
    return [];
  }
}

function WatchSection({ m, venueDay }: { m: Match; venueDay: string }) {
  const [market, setMarket] = useState<string>('');
  const [usChannels, setUsChannels] = useState<{ name: string; stream: boolean }[]>([]);
  const [sdbTv, setSdbTv] = useState<SdbTvRow[]>([]);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('wc26-market'); } catch { /* ignore */ }
    setMarket(saved && BROADCAST_RIGHTS[saved] ? saved : detectMarket(navigator.language || '') ?? 'US');
  }, []);

  const pickMarket = (v: string) => {
    setMarket(v);
    try { localStorage.setItem('wc26-market', v); } catch { /* ignore */ }
  };

  useEffect(() => {
    let alive = true;
    findEspnEvent(m, venueDay, false)
      .then((hit) => alive && hit && setUsChannels(parseEspnBroadcasts(hit.event)))
      .catch(() => { /* silent */ });
    fetchSdbTv(m, venueDay).then((rows) => alive && setSdbTv(rows));
    return () => { alive = false; };
  }, [m.n]);

  const rights = BROADCAST_RIGHTS[market];
  const sdbForMarket = sdbTv.filter((r) => r.country === SDB_COUNTRY_NAMES[market]);
  const hasSelectedFree = !!rights?.broadcasters.some((b) => b.free && b.coverage === 'selected');
  // Germany: definitive per-match free/paid verdict where we've confirmed it
  const deVerdict = market === 'DE' ? DE_MATCH_FTA[m.n] ?? null : null;

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between gap-2">
        <span className={microHead}>WHERE TO WATCH</span>
        <select
          value={market}
          onChange={(e) => pickMarket(e.target.value)}
          aria-label="Country"
          className="focus-ring rounded-md border border-border bg-surface px-1.5 py-1 t-micro text-text-2 outline-none"
        >
          {Object.entries(BROADCAST_RIGHTS).map(([code, r]) => (
            <option key={code} value={code}>{r.country}</option>
          ))}
        </select>
      </div>

      {market === 'US' && usChannels.length > 0 && (
        <span className="t-meta text-text-2">
          This match: {usChannels.map((c) => c.name + (c.stream ? ' (stream)' : '')).join(' · ')}
        </span>
      )}
      {market !== 'US' && !deVerdict && sdbForMarket.length > 0 && (
        <span className="t-meta text-text-2">
          This match: {[...new Set(sdbForMarket.map((r) => r.channel))].join(' · ')}
        </span>
      )}

      {/* Germany — confirmed per-match verdict (overrides the generic chips) */}
      {deVerdict === 'magenta' && (
        <span className="t-meta text-text-2">
          This match: <strong className="text-text">MagentaTV only</strong> — paid; not on ARD/ZDF free TV.
        </span>
      )}
      {deVerdict && deVerdict !== 'magenta' && (
        <span className="t-meta inline-flex flex-wrap items-center gap-1.5 text-text-2">
          This match:
          <span className="rounded-[3px] px-1 font-bold tracking-[0.06em]" style={{ background: 'var(--color-host-mx)', color: '#08130D', fontSize: '9px' }}>FREE</span>
          {deVerdict === 'ARD' ? (
            <a href="https://www.sportschau.de/" target="_blank" rel="noopener noreferrer" className="focus-ring text-text hover:underline">on ARD ↗</a>
          ) : deVerdict === 'ZDF' ? (
            <a href="https://www.zdf.de/live-tv" target="_blank" rel="noopener noreferrer" className="focus-ring text-text hover:underline">on ZDF ↗</a>
          ) : (
            <span className="text-text">on ARD / ZDF</span>
          )}
          <span className="text-text-dim">· also MagentaTV</span>
        </span>
      )}

      {!deVerdict && rights && (
        <div className="flex flex-wrap gap-1.5">
          {rights.broadcasters.map((b) => {
            const inner = (
              <>
                {b.name}
                {b.free && (b.coverage === 'selected' ? (
                  // free, but only a subset of matches — don't imply THIS match is free
                  <span className="rounded-[3px] border px-1 font-bold tracking-[0.06em]" style={{ borderColor: 'var(--color-host-mx)', color: 'var(--color-host-mx)', fontSize: '9px' }}>FREE*</span>
                ) : (
                  // carries every match — this match is free here
                  <span className="rounded-[3px] px-1 font-bold tracking-[0.06em]" style={{ background: 'var(--color-host-mx)', color: '#08130D', fontSize: '9px' }}>FREE</span>
                ))}
                {b.note && <span className="text-text-dim">· {b.note}</span>}
                {b.url && <span className="text-text-2">↗</span>}
              </>
            );
            const cls = 't-micro inline-flex min-h-[30px] items-center gap-1.5 rounded-(--radius-chip) border px-2 py-1';
            return b.url ? (
              <a
                key={b.name}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`focus-ring ${cls} border-border-strong text-text-2 hover:border-text-3 hover:text-text`}
              >
                {inner}
              </a>
            ) : (
              <span key={b.name} className={`${cls} border-border text-text-3`}>{inner}</span>
            );
          })}
        </div>
      )}

      {!deVerdict && hasSelectedFree && (
        <span className="t-micro text-text-dim">
          <span style={{ color: 'var(--color-host-mx)' }}>FREE*</span> = only selected matches; which channel carries this one varies — check the per-match listing above, or a paid rights holder covers every match.
        </span>
      )}

      <span className="t-micro text-text-dim">
        Rights as announced — confirm with local listings.{' '}
        <a href="https://www.livesoccertv.com/competitions/international/world-cup/" target="_blank" rel="noopener noreferrer" className="text-text-3 underline underline-offset-2 hover:text-text">
          Global listings ↗
        </a>
      </span>
    </div>
  );
}

/* ---------- lineup pitch ---------- */

const pitchLine = 'rgb(255 255 255 / 0.16)';

function PlayerDot({ p, top, left, photo }: { p: PlacedPlayer; top: number; left: number; photo: string | null }) {
  return (
    <div
      className="absolute flex w-[64px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[2px] max-[480px]:w-[54px]"
      style={{ top: `${top}%`, left: `${left}%` }}
    >
      <div className="relative">
        <span className="flex size-[38px] items-center justify-center overflow-hidden rounded-full border" style={{ background: '#1E2530', borderColor: 'rgb(255 255 255 / 0.35)' }}>
          {photo ? (
            <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).remove(); }} />
          ) : (
            <span className="disp text-[13px] font-black" style={{ color: 'rgb(255 255 255 / 0.75)' }}>{initials(p.name)}</span>
          )}
        </span>
        <span className="disp tnum absolute -top-1 -right-2 rounded-[3px] px-[4px] text-[10px] font-black leading-[14px]" style={{ background: 'rgb(0 0 0 / 0.6)', color: '#fff' }}>
          {p.jersey}
        </span>
      </div>
      <span className="max-w-[64px] truncate text-center text-[9px] font-semibold leading-tight max-[480px]:max-w-[54px] max-[480px]:text-[8px]" style={{ color: 'rgb(255 255 255 / 0.92)', textShadow: '0 1px 2px rgb(0 0 0 / 0.7)' }}>
        {p.name}
      </span>
    </div>
  );
}

function Pitch({ lineups, nameA, nameB, photoOf }: { lineups: MatchLineups; nameA: string; nameB: string; photoOf: (name: string) => string | null }) {
  const top = layoutLineup(lineups.a);
  const bottom = layoutLineup(lineups.b);
  const box = 'absolute border';
  return (
    <div className="flex flex-col gap-2">
      <span className={microHead}>LINEUPS</span>
      <div
        className="relative w-full overflow-hidden rounded-(--radius-row) border border-border"
        style={{ aspectRatio: '0.62', background: 'linear-gradient(180deg, #1A3A24 0%, #142C1C 50%, #1A3A24 100%)' }}
      >
        {/* pitch markings */}
        <div className={box} style={{ inset: '1.5% 3%', borderColor: pitchLine, borderRadius: 4 }} />
        <div className="absolute" style={{ top: '50%', left: '3%', right: '3%', borderTop: `1px solid ${pitchLine}` }} />
        <div className="absolute rounded-full border" style={{ top: '50%', left: '50%', width: '24%', aspectRatio: '1', transform: 'translate(-50%,-50%)', borderColor: pitchLine }} />
        <div className={box} style={{ top: '1.5%', left: '24%', width: '52%', height: '11%', borderColor: pitchLine, borderTop: 'none' }} />
        <div className={box} style={{ top: '1.5%', left: '37%', width: '26%', height: '4.5%', borderColor: pitchLine, borderTop: 'none' }} />
        <div className={box} style={{ bottom: '1.5%', left: '24%', width: '52%', height: '11%', borderColor: pitchLine, borderBottom: 'none' }} />
        <div className={box} style={{ bottom: '1.5%', left: '37%', width: '26%', height: '4.5%', borderColor: pitchLine, borderBottom: 'none' }} />

        {/* formation labels */}
        <span className="disp absolute top-[2.5%] left-[5%] text-[10px] font-extrabold tracking-[0.06em]" style={{ color: 'rgb(255 255 255 / 0.85)' }}>
          {nameA.toUpperCase()}{lineups.a.formation ? ` · ${lineups.a.formation}` : ''}
        </span>
        <span className="disp absolute bottom-[2.5%] left-[5%] text-[10px] font-extrabold tracking-[0.06em]" style={{ color: 'rgb(255 255 255 / 0.85)' }}>
          {nameB.toUpperCase()}{lineups.b.formation ? ` · ${lineups.b.formation}` : ''}
        </span>

        {/* team A defends the top goal; team B mirrors from the bottom */}
        {top.map((p) => (
          <PlayerDot key={`a${p.place}${p.name}`} p={p} top={p.y * 0.42 + 5} left={p.x * 0.88 + 6} photo={photoOf(p.name)} />
        ))}
        {bottom.map((p) => (
          <PlayerDot key={`b${p.place}${p.name}`} p={p} top={95 - p.y * 0.42} left={94 - p.x * 0.88} photo={photoOf(p.name)} />
        ))}
      </div>
      {(lineups.a.subbedIn.length > 0 || lineups.b.subbedIn.length > 0) && (
        <span className="t-micro leading-relaxed text-text-dim">
          Subs used — {nameA}: {lineups.a.subbedIn.join(', ') || '—'} · {nameB}: {lineups.b.subbedIn.join(', ') || '—'}
        </span>
      )}
    </div>
  );
}

/* ---------- match drawer ---------- */

function MatchDrawer({ n, openTeam }: { n: number; openTeam: (code: string) => void }) {
  const { matches, teams, stadiums, stageLabels } = appData();
  const m = matches.find((x) => x.n === n);
  const dom = domMatchState(n);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [cards, setCards] = useState<CardEvent[]>([]);
  const [espnGoals, setEspnGoals] = useState<Goal[]>([]);
  const [lineups, setLineups] = useState<MatchLineups | null>(null);
  const [playerMeta, setPlayerMeta] = useState<Record<string, { num: number | null; photo: string | null }>>({});
  const [liveTick, setLiveTick] = useState(0);

  // while the drawer is open on a live match, refresh events every 60s
  useEffect(() => {
    if (dom.state !== 'live') return;
    const t = setInterval(() => setLiveTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, [n, dom.state]);

  useEffect(() => {
    let alive = true;
    if (liveTick === 0) {
      setCards([]);
      setEspnGoals([]);
      setLineups(null);
      setPlayerMeta({});
    }
    if (!m) return;
    const started = dom.state !== 'up' || !!m.ft;
    const nearKickoff = Date.parse(m.utc) - Date.now() < 75 * 60_000; // lineups publish ~1h before
    const v = stadiums[m.stadium];
    const venueDay = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: v.timezone,
    }).format(new Date(m.utc));
    if (started) {
      fetchEventDetailsFor(m, venueDay, dom.state === 'live').then((d) => {
        if (!alive) return;
        setCards(d.cards);
        // normalize ESPN's shape to the static layer's Goal shape
        setEspnGoals(d.goals.map((g) => ({
          side: g.side,
          name: g.player,
          minute: g.minute,
          ...(g.penalty ? { penalty: true } : {}),
          ...(g.owngoal ? { owngoal: true } : {}),
        })));
      });
    }
    if (started || nearKickoff) {
      fetchLineupsFor(m, venueDay, dom.state === 'live' || (!started && nearKickoff)).then(
        (l) => alive && setLineups(l),
      );
    }
    // kit numbers + photos for scorer/card lines and the lineup pitch
    fetchPlayers().then((all) => {
      if (!alive) return;
      const map: Record<string, { num: number | null; photo: string | null }> = {};
      for (const code of [m.a, m.b]) {
        for (const p of (code && all[code]) || []) {
          map[normName(p.name)] = { num: p.shirtNumber, photo: p.photoUrl };
        }
      }
      setPlayerMeta(map);
    });
    return () => { alive = false; };
  }, [n, dom.state, liveTick]);

  const numFor = (player: string): number | null => playerMeta[normName(player)]?.num ?? null;
  const photoOf = (player: string): string | null => playerMeta[normName(player)]?.photo ?? null;

  useEffect(() => {
    let alive = true;
    setHighlight(null);
    setPlayerOpen(false);
    if (!m || (!m.ft && dom.state !== 'ft')) return;
    (async () => {
      const archive = await fetchHighlightArchive();
      if (!alive) return;
      if (archive[String(n)]) {
        setHighlight(archive[String(n)]);
        return;
      }
      // fresh uploads via the RSS endpoint (≤30 min behind YouTube)
      const rss = await fetchHighlightRss();
      if (!alive) return;
      for (const video of rss) {
        const hit = matchVideoToMatch(video, [m], (c) => teams[c]?.name ?? c);
        if (hit) {
          setHighlight(video);
          return;
        }
      }
    })();
    return () => { alive = false; };
  }, [n]);

  if (!m) return null;
  const v = stadiums[m.stadium];
  const host = v.country.toLowerCase() as 'mx' | 'us' | 'ca';
  const A = m.a ? teams[m.a] : null;
  const B = m.b ? teams[m.b] : null;
  const state = m.ft ? 'ft' : dom.state;
  const score = m.ft ? `${m.ft[0]}–${m.ft[1]}` : dom.score;
  // static layer first (openfootball, lands on the nightly rebuild);
  // ESPN bridges the gap for live and just-finished matches
  const goalEvents = m.goals?.length ? m.goals : espnGoals;
  const scorersA = goalEvents.filter((g) => g.side === 0);
  const scorersB = goalEvents.filter((g) => g.side === 1);
  const roundBit = m.stage === 'GR' ? `Group ${m.group} · Matchday ${m.md}` : stageLabels[m.stage];
  const countryName = { mx: 'Mexico', us: 'USA', ca: 'Canada' }[host];

  return (
    <div className="flex flex-col gap-[18px] px-4 pt-5 pb-10">
      {/* hero */}
      <div
        className={`host-${host} tinted live-border flex flex-col items-center gap-3 rounded-[14px] border px-4 py-5`}
        data-state={state}
        style={{ borderColor: 'var(--color-border)' }}
      >
        {state === 'live' && (
          <span className="inline-flex items-center gap-[5px] rounded-(--radius-chip) px-2 py-[3px] text-[10px] font-extrabold tracking-[0.12em]" style={{ background: 'var(--color-live-badge)', color: 'var(--color-live-ink)' }}>
            <span className="live-dot size-[5px] rounded-full" style={{ background: 'var(--color-live-ink)' }} />
            LIVE{dom.minute ? ` · ${dom.minute}` : ''}
          </span>
        )}
        {state === 'ft' && <span className="t-micro font-bold tracking-[0.16em] text-text-3">FULL TIME</span>}
        {state === 'up' && <span className="t-micro font-bold tracking-[0.16em] text-text-3">UPCOMING</span>}

        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span className="flex min-w-0 flex-col items-center gap-1.5">
            {A ? (
              <img src={flagUrl(A.flag, 160)} alt="" className="h-8 w-11 rounded-(--radius-chip) object-cover" />
            ) : (
              <span className="box-border h-8 w-11 rounded-(--radius-chip) border border-dashed border-border-strong" />
            )}
            <span className="disp t-meta text-center font-bold text-text-2">{A ? A.name : m.pa}</span>
          </span>
          <span className="disp t-score-lg tnum leading-none font-black text-text">
            {state === 'up' ? localTime(m.utc) : (score ?? '–')}
          </span>
          <span className="flex min-w-0 flex-col items-center gap-1.5">
            {B ? (
              <img src={flagUrl(B.flag, 160)} alt="" className="h-8 w-11 rounded-(--radius-chip) object-cover" />
            ) : (
              <span className="box-border h-8 w-11 rounded-(--radius-chip) border border-dashed border-border-strong" />
            )}
            <span className="disp t-meta text-center font-bold text-text-2">{B ? B.name : m.pb}</span>
          </span>
        </div>
        <span className="t-micro text-center font-mono tracking-[0.06em] text-text-dim">
          {(state === 'ft' ? 'Full time' : state === 'live' ? `Live${dom.minute ? ` · ${dom.minute}` : ''}` : 'Upcoming')} · {roundBit} · Match {m.n}
        </span>
      </div>

      {/* scorers — kit number chip up front, minute always with the ' mark */}
      {(scorersA.length > 0 || scorersB.length > 0) && (
        <div className="grid grid-cols-[1fr_14px_1fr] items-start gap-x-2.5 gap-y-1">
          <div className="flex flex-col items-end gap-1">
            {scorersA.map((g, i) => (
              <div key={i} className="t-meta text-right text-text-2">
                <NumChip n={numFor(g.name)} />
                {g.name} <span className="tnum">{g.minute}'</span>{g.penalty ? ' (P)' : ''}{g.owngoal ? ' (OG)' : ''}
              </div>
            ))}
          </div>
          <div className="h-full justify-self-center border-l border-border" />
          <div className="flex flex-col gap-1">
            {scorersB.map((g, i) => (
              <div key={i} className="t-meta text-text-2">
                <NumChip n={numFor(g.name)} />
                {g.name} <span className="tnum">{g.minute}'</span>{g.penalty ? ' (P)' : ''}{g.owngoal ? ' (OG)' : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* discipline — same two-column layout as scorers */}
      {cards.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className={microHead}>DISCIPLINE</span>
          <div className="grid grid-cols-[1fr_14px_1fr] items-start gap-x-2.5 gap-y-1">
            <div className="flex flex-col items-end gap-1">
              {cards.filter((c) => c.side === 0).map((c, i) => (
                <div key={i} className="t-meta text-right text-text-2">
                  <NumChip n={numFor(c.player)} />
                  {c.player} <span className="tnum">{c.minute}'</span> <CardIcon type={c.type} />
                </div>
              ))}
            </div>
            <div className="h-full justify-self-center border-l border-border" />
            <div className="flex flex-col gap-1">
              {cards.filter((c) => c.side === 1).map((c, i) => (
                <div key={i} className="t-meta text-text-2">
                  <CardIcon type={c.type} /> <NumChip n={numFor(c.player)} />
                  {c.player} <span className="tnum">{c.minute}'</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* highlights — click-to-load facade; no YouTube script before click */}
      {highlight && (
        <div className="flex flex-col gap-2">
          <span className={microHead}>HIGHLIGHTS · MAGENTASPORT</span>
          {playerOpen ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${highlight.videoId}?autoplay=1`}
              title={highlight.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full rounded-(--radius-row) border border-border"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlayerOpen(true)}
              aria-label={`Play highlights: ${highlight.title}`}
              className="focus-ring group relative block aspect-video w-full overflow-hidden rounded-(--radius-row) border border-border"
            >
              <img src={`https://i.ytimg.com/vi/${highlight.videoId}/hqdefault.jpg`} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgb(0 0 0 / 0.35)' }}>
                <span className="flex h-14 w-20 items-center justify-center rounded-xl text-[22px]" style={{ background: 'var(--color-live-badge)', color: 'var(--color-live-ink)' }}>▶</span>
              </span>
            </button>
          )}
          <a
            href={`https://www.youtube.com/watch?v=${highlight.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="t-meta font-semibold text-text-3 underline underline-offset-2 hover:text-text"
          >
            Watch on YouTube ↗
          </a>
          <span className="t-micro text-text-dim">May be geo-restricted outside DACH — the YouTube link always works as fallback.</span>
        </div>
      )}

      {/* starting lineups on a pitch */}
      {lineups && A && B && <Pitch lineups={lineups} nameA={A.name} nameB={B.name} photoOf={photoOf} />}

      {/* venue + kickoff */}
      <div className="flex flex-col gap-2.5">
        <div className={cardCls}>
          <span className={microHead}>VENUE</span>
          <span className="disp t-team font-extrabold text-text">{v.name}</span>
          <span className="t-meta text-text-3">{v.city} · {countryName}{v.capacity ? ` · capacity ${v.capacity.toLocaleString('en-US')}` : ''}</span>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="t-micro font-semibold text-text-3 underline underline-offset-2 hover:text-text"
          >
            Map ↗
          </a>
        </div>
        <div className={cardCls}>
          <span className={microHead}>KICKOFF</span>
          <span className="disp t-team tnum font-extrabold text-text">{localTime(m.utc)} your time</span>
          <span className="t-meta tnum text-text-3">{venueLocalTime(m.utc, v.timezone)} in {v.city}</span>
        </div>
        <WatchSection
          m={m}
          venueDay={new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: v.timezone }).format(new Date(m.utc))}
        />
      </div>

      {/* team links */}
      {A && B && (
        <div className="flex flex-wrap gap-2">
          {[A, B].map((t) => (
            <button key={t.code} type="button" onClick={() => openTeam(t.code)} className={btnCls}>
              <img src={flagUrl(t.flag)} alt="" className="h-[13px] w-[18px] rounded-[2px] object-cover" />
              {t.name} →
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- shell ---------- */

export default function Drawer() {
  const [state, setState] = useState<DrawerState>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const openTeam = useCallback((code: string) => setState({ type: 'team', code }), []);
  const openMatch = useCallback((n: number) => setState({ type: 'match', n }), []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-open-team], [data-open-match]');
      if (!t) return;
      if (t.dataset.openTeam) openTeam(t.dataset.openTeam);
      else if (t.dataset.openMatch) openMatch(Number(t.dataset.openMatch));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(null);
    };
    const onOpenTeam = (e: Event) => openTeam((e as CustomEvent).detail.code);
    const onOpenMatch = (e: Event) => openMatch((e as CustomEvent).detail.n);
    document.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wc26:open-team', onOpenTeam);
    window.addEventListener('wc26:open-match', onOpenMatch);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wc26:open-team', onOpenTeam);
      window.removeEventListener('wc26:open-match', onOpenMatch);
    };
  }, [openTeam, openMatch]);

  useEffect(() => {
    if (state) closeRef.current?.focus();
  }, [state]);

  if (!state) return null;
  const { teams, stageLabels, matches } = appData();
  const title =
    state.type === 'team'
      ? 'TEAM'
      : (() => {
          const m = matches.find((x) => x.n === state.n);
          if (!m) return 'MATCH';
          return m.stage === 'GR' ? `GROUP ${m.group} · MATCH ${m.n}` : `${(stageLabels[m.stage] ?? '').toUpperCase()} · MATCH ${m.n}`;
        })();

  return (
    <>
      <div onClick={() => setState(null)} className="fixed inset-0 z-40" style={{ background: 'rgb(5 7 10 / 0.62)' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={state.type === 'team' ? `${teams[state.code]?.name ?? 'Team'} details` : 'Match details'}
        className="fixed top-0 right-0 bottom-0 z-41 box-border w-[460px] max-w-[100vw] overflow-y-auto border-l border-border-strong bg-bg"
        style={{ boxShadow: 'var(--shadow-drawer)' }}
      >
        <div
          className="sticky top-0 z-2 flex items-center justify-between gap-2.5 border-b border-border px-4 py-3 backdrop-blur-lg"
          style={{ background: 'color-mix(in srgb, var(--color-bg) 90%, transparent)' }}
        >
          <span className="t-micro font-mono tracking-[0.1em] text-text-dim">{title}</span>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setState(null)}
            aria-label="Close"
            className="focus-ring inline-flex size-[44px] items-center justify-center rounded-[9px] border border-border text-[16px] text-text-2 hover:bg-surface"
          >
            ✕
          </button>
        </div>
        {state.type === 'team' ? (
          <TeamDrawer code={state.code} openMatch={openMatch} />
        ) : (
          <MatchDrawer n={state.n} openTeam={openTeam} />
        )}
      </div>
    </>
  );
}
