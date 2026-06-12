import { useEffect, useState } from 'react';
import { appData, flagUrl } from '../../lib/client';
import type { ScorerRow } from '../../lib/stats';

/**
 * Top scorers — server-renders the locally computed fallback (works
 * with no token and no JS), then upgrades to football-data.org data
 * through the cached /api/scorers endpoint when available.
 */

interface Props {
  local: ScorerRow[];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export default function ScorersTable({ local }: Props) {
  const [rows, setRows] = useState<ScorerRow[]>(local);
  const [source, setSource] = useState<'local' | 'api'>('local');
  const [players, setPlayers] = useState<Record<string, { photo: string | null; num: number | null }>>({});

  useEffect(() => {
    let alive = true;
    fetch('/api/scorers')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: ScorerRow[]) => {
        if (alive && Array.isArray(data) && data.length) {
          setRows(data.slice(0, 10));
          setSource('api');
        }
      })
      .catch(() => { /* keep the local fallback */ });
    fetch('/data/players.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((all: Record<string, { name: string; photoUrl: string | null; shirtNumber: number | null }[]>) => {
        if (!alive) return;
        const map: Record<string, { photo: string | null; num: number | null }> = {};
        for (const list of Object.values(all)) {
          for (const p of list) map[p.name] = { photo: p.photoUrl, num: p.shirtNumber };
        }
        setPlayers(map);
      })
      .catch(() => { /* initials only */ });
    return () => { alive = false; };
  }, []);

  const teams = typeof document !== 'undefined' ? appData().teams : null;

  return (
    <div>
      <div className="t-micro grid grid-cols-[24px_36px_minmax(0,1fr)_36px_36px] gap-1.5 px-1 pb-1.5 font-bold tracking-[0.06em] text-text-dim">
        <span /><span /><span />
        <span className="text-center">G</span>
        <span className="text-center">A</span>
      </div>
      <div className="flex flex-col">
        {rows.map((s, idx) => (
          <div key={`${s.name}-${idx}`} className="tnum grid min-h-12 grid-cols-[24px_36px_minmax(0,1fr)_36px_36px] items-center gap-1.5 border-t border-border p-1">
            <span className="t-micro font-mono text-text-dim">{String(idx + 1).padStart(2, '0')}</span>
            <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2">
              {players[s.name]?.photo ? (
                <img src={players[s.name].photo!} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="disp text-[11px] font-extrabold text-text-3">{initials(s.name)}</span>
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-px">
              <span className="t-meta truncate font-semibold whitespace-nowrap text-text">{s.name}</span>
              <span className="t-micro inline-flex items-center gap-[5px] text-text-3">
                {teams?.[s.team] && (
                  <img src={flagUrl(teams[s.team].flag)} alt="" className="h-[10px] w-[14px] rounded-[1px] object-cover" />
                )}
                {s.team}
                {players[s.name]?.num != null && <span className="font-mono text-text-dim">#{players[s.name].num}</span>}
              </span>
            </span>
            <span className="disp t-time text-center font-black text-text">{s.goals}</span>
            <span className="t-meta text-center text-text-3">{s.assists}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="t-meta border-t border-border px-1 py-4 text-text-3">No goals yet — check back after kickoff.</div>
        )}
      </div>
      <div className="t-micro pt-2 text-text-dim">
        {source === 'api'
          ? 'Source: football-data.org · refreshes every 10 minutes'
          : 'Computed locally from match results · live scorer feed unavailable'}
      </div>
    </div>
  );
}
