import { useEffect, useState } from 'react';
import { DEFAULT_PREFS, getPrefs, setPrefs, type Prefs } from '../../lib/client';

/**
 * Tweaks bar — floating control for theme, text size and host-tint
 * loudness (the design's optional spec). Persisted to localStorage and
 * applied as data attributes on <html>; pure token swap.
 */

const ROWS: { key: keyof Prefs; label: string; options: { v: string; label: string }[] }[] = [
  { key: 'theme', label: 'THEME', options: [{ v: 'dark', label: 'Dark' }, { v: 'light', label: 'Light' }] },
  { key: 'textsize', label: 'TEXT', options: [{ v: 'compact', label: 'A−' }, { v: 'standard', label: 'A' }, { v: 'large', label: 'A+' }] },
  { key: 'tint', label: 'HOST TINT', options: [{ v: 'subtle', label: 'Subtle' }, { v: 'standard', label: 'Std' }, { v: 'loud', label: 'Loud' }] },
];

export default function Tweaks() {
  const [open, setOpen] = useState(false);
  const [prefs, setLocal] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    setLocal(getPrefs());
  }, []);

  const update = (key: keyof Prefs, v: string) => {
    const next = { ...prefs, [key]: v } as Prefs;
    setLocal(next);
    setPrefs(next);
  };

  return (
    <div className="fixed right-4 bottom-4 z-30 flex flex-col items-end gap-2">
      {open && (
        <div className="flex w-[230px] flex-col gap-3 rounded-(--radius-card) border border-border-strong bg-surface p-3.5" style={{ boxShadow: '0 12px 40px rgb(0 0 0 / 0.45)' }}>
          {ROWS.map((row) => (
            <div key={row.key} className="flex flex-col gap-1.5">
              <span className="t-micro font-bold tracking-[0.12em] text-text-dim">{row.label}</span>
              <div className="flex gap-1">
                {row.options.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    aria-pressed={prefs[row.key] === o.v}
                    onClick={() => update(row.key, o.v)}
                    className={`focus-ring-surface min-h-[34px] flex-1 rounded-md border px-2 py-1 t-meta font-semibold ${
                      prefs[row.key] === o.v ? 'border-border-strong bg-raised text-text' : 'border-border bg-transparent text-text-3'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Display settings"
        className="focus-ring flex size-11 items-center justify-center rounded-full border border-border-strong bg-surface text-[16px] text-text-2 hover:text-text"
        style={{ boxShadow: '0 6px 24px rgb(0 0 0 / 0.4)' }}
      >
        {open ? '✕' : 'Aa'}
      </button>
    </div>
  );
}
