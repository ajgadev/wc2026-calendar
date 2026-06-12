import { useEffect, useRef, useState } from 'react';
import { getFollows, onFollowsChange } from '../../lib/client';

/**
 * Sticky filter bar + view controls. State lives in the URL query
 * string (?q=&group=&country=&stage=&mine=1) so filtered views are
 * shareable and survive reload. Filtering toggles `.filtered-out` on
 * the statically rendered [data-match] elements — no re-render of the
 * page content.
 */

interface Filters {
  q: string;
  group: string;
  country: string;
  stage: string;
  mine: boolean;
}

const GROUPS = 'ABCDEFGHIJKL'.split('');

const COUNTRY_CHIPS = [
  { k: 'mx', label: 'Mexico', dotVar: 'var(--color-host-mx)' },
  { k: 'us', label: 'USA', dotVar: 'var(--color-host-us)' },
  { k: 'ca', label: 'Canada', dotVar: 'var(--color-host-ca)' },
];

const STAGE_CHIPS = [
  { k: 'GR', label: 'Group stage' },
  { k: 'KO', label: 'Knockouts' },
];

function fromUrl(): Filters {
  const p = new URLSearchParams(location.search);
  return {
    q: p.get('q') ?? '',
    group: p.get('group') ?? '',
    country: p.get('country') ?? '',
    stage: p.get('stage') ?? '',
    mine: p.get('mine') === '1',
  };
}

function toUrl(f: Filters) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.group) p.set('group', f.group);
  if (f.country) p.set('country', f.country);
  if (f.stage) p.set('stage', f.stage);
  if (f.mine) p.set('mine', '1');
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function applyFilters(f: Filters, follows: string[]) {
  const passes = (el: HTMLElement): boolean => {
    if (f.group && el.dataset.group !== f.group) return false;
    if (f.country && el.dataset.country !== f.country) return false;
    if (f.stage === 'GR' && el.dataset.stage !== 'GR') return false;
    if (f.stage === 'KO' && el.dataset.stage === 'GR') return false;
    if (f.mine) {
      const teams = (el.dataset.teams ?? '').split(' ').filter(Boolean);
      if (!teams.some((t) => follows.includes(t))) return false;
    }
    if (f.q) {
      const q = f.q.trim().toLowerCase();
      if (q && !(el.dataset.search ?? '').includes(q)) return false;
    }
    return true;
  };

  document.querySelectorAll<HTMLElement>('[data-match]').forEach((el) => {
    el.classList.toggle('filtered-out', !passes(el));
  });
  // hide day sections that lost every match
  let anyVisible = false;
  document.querySelectorAll<HTMLElement>('[data-day-section]').forEach((sec) => {
    const has = !!sec.querySelector('[data-match]:not(.filtered-out)');
    sec.classList.toggle('filtered-out', !has);
    if (has) anyVisible = true;
  });
  const empty = document.querySelector<HTMLElement>('[data-agenda-empty]');
  if (empty) empty.hidden = anyVisible || document.querySelectorAll('[data-day-section]').length === 0;
}

const seg =
  'focus-ring-surface min-h-[38px] rounded-md px-3.5 py-1.5 t-meta font-semibold';
const pill =
  'focus-ring inline-flex min-h-10 shrink-0 items-center gap-[7px] rounded-(--radius-pill) border px-[13px] py-1.5 t-meta font-semibold whitespace-nowrap';

export default function FilterBar({ showViewControls = true }: { showViewControls?: boolean }) {
  const [f, setF] = useState<Filters>({ q: '', group: '', country: '', stage: '', mine: false });
  const [layout, setLayout] = useState<'agenda' | 'calendar'>('agenda');
  const [month, setMonth] = useState<6 | 7>(6);
  const follows = useRef<string[]>([]);
  const ready = useRef(false);

  useEffect(() => {
    follows.current = getFollows();
    const init = fromUrl();
    setF(init);
    const root = document.documentElement;
    setLayout(root.dataset.layout === 'calendar' || (root.dataset.layout === 'auto' && innerWidth >= 1000) ? 'calendar' : 'agenda');
    setMonth(root.dataset.month === '7' ? 7 : 6);
    applyFilters(init, follows.current);
    ready.current = true;
    return onFollowsChange((next) => {
      follows.current = next;
      setF((cur) => {
        if (cur.mine) applyFilters(cur, next);
        return cur;
      });
    });
  }, []);

  const update = (patch: Partial<Filters>) => {
    setF((cur) => {
      const next = { ...cur, ...patch };
      toUrl(next);
      applyFilters(next, follows.current);
      return next;
    });
  };

  const setView = (v: 'agenda' | 'calendar') => {
    setLayout(v);
    document.documentElement.dataset.layout = v;
  };
  const setMon = (m: 6 | 7) => {
    setMonth(m);
    document.documentElement.dataset.month = String(m);
    try { localStorage.setItem('wc26-month-touched', '1'); } catch { /* ignore */ }
  };
  const goToday = () => {
    const today = new Date();
    if (layout === 'calendar') {
      setMon(today.getMonth() === 6 ? 7 : 6);
      return;
    }
    const el = document.querySelector('[data-day-section][data-is-today]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const anyFilter = !!(f.q || f.group || f.country || f.stage || f.mine);

  return (
    <>
      {showViewControls && (
        <div className="flex flex-wrap items-center gap-2.5 pt-3.5 pb-1">
          <div role="group" aria-label="Layout" className="inline-flex gap-0.5 rounded-[9px] border border-border bg-surface p-[3px]">
            {(['agenda', 'calendar'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`${seg} ${layout === v ? 'bg-raised text-text' : 'bg-transparent text-text-3'}`}
              >
                {v === 'agenda' ? 'Agenda' : 'Calendar'}
              </button>
            ))}
          </div>
          {layout === 'calendar' && (
            <div role="group" aria-label="Month" className="inline-flex gap-0.5 rounded-[9px] border border-border bg-surface p-[3px]">
              {([6, 7] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMon(m)}
                  className={`${seg} ${month === m ? 'bg-raised text-text' : 'bg-transparent text-text-3'}`}
                >
                  {m === 6 ? 'June' : 'July'}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={goToday} className="focus-ring min-h-[44px] rounded-[9px] border border-border-strong px-4 py-2 t-meta font-bold text-text hover:bg-surface">
            Today
          </button>
          <span className="t-micro ml-auto text-text-dim">Kickoffs shown in <span data-tz-note>stadium-local time</span></span>
        </div>
      )}

      {/* single scrollable row on phones; wraps from sm up */}
      <div
        className="no-scrollbar sticky top-0 z-30 flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-border px-0.5 py-2.5 backdrop-blur-[10px] sm:flex-wrap sm:overflow-visible"
        style={{ background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)' }}
      >
        <input
          type="search"
          value={f.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="Search…"
          aria-label="Search matches"
          className="focus-ring min-h-10 w-[120px] shrink-0 rounded-[9px] border border-border bg-surface px-3 py-1.5 t-meta text-text outline-none sm:w-[190px]"
        />
        <select
          value={f.group}
          onChange={(e) => update({ group: e.target.value })}
          aria-label="Filter by group"
          className="focus-ring min-h-10 shrink-0 rounded-[9px] border border-border bg-surface px-2.5 py-1.5 t-meta text-text outline-none"
        >
          <option value="">All groups</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>Group {g}</option>
          ))}
        </select>
        {COUNTRY_CHIPS.map((c) => {
          const active = f.country === c.k;
          return (
            <button
              key={c.k}
              type="button"
              aria-pressed={active}
              onClick={() => update({ country: active ? '' : c.k })}
              className={pill}
              style={{
                borderColor: active ? c.dotVar : 'var(--color-border)',
                background: active ? `color-mix(in oklab, ${c.dotVar} 14%, var(--color-surface))` : 'var(--color-surface)',
                color: active ? 'var(--color-text)' : 'var(--color-text-3)',
              }}
            >
              <span className="size-2 rounded-[2px]" style={{ background: c.dotVar }} />
              {c.label}
            </button>
          );
        })}
        {STAGE_CHIPS.map((c) => {
          const active = f.stage === c.k;
          return (
            <button
              key={c.k}
              type="button"
              aria-pressed={active}
              onClick={() => update({ stage: active ? '' : c.k })}
              className={pill}
              style={{
                borderColor: active ? 'var(--color-text-2)' : 'var(--color-border)',
                background: active ? 'var(--color-surface-2)' : 'var(--color-surface)',
                color: active ? 'var(--color-text)' : 'var(--color-text-3)',
              }}
            >
              {c.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={f.mine}
          onClick={() => update({ mine: !f.mine })}
          className={pill}
          style={{
            borderColor: f.mine ? 'var(--color-text-2)' : 'var(--color-border)',
            background: f.mine ? 'var(--color-surface-2)' : 'var(--color-surface)',
            color: f.mine ? 'var(--color-text)' : 'var(--color-text-3)',
          }}
        >
          ★ My teams
        </button>
        {anyFilter && (
          <button
            type="button"
            onClick={() => update({ q: '', group: '', country: '', stage: '', mine: false })}
            className="focus-ring min-h-10 shrink-0 px-3 py-1.5 t-meta font-semibold whitespace-nowrap text-text-3 underline underline-offset-[3px] hover:text-text"
          >
            Clear
          </button>
        )}
      </div>
    </>
  );
}
