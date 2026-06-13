/**
 * Client-side shared state: the embedded data blob, the follows store,
 * and the Tweaks preferences. Plain module — usable from every island
 * without prop-drilling page data through Astro.
 */
import type { Match, Stadium, Team } from './types';

export interface AppData {
  matches: Match[];
  teams: Record<string, Team>;
  stadiums: Record<string, Stadium>;
  stageLabels: Record<string, string>;
}

let cached: AppData | null = null;

/** Reads the JSON blob embedded by Layout.astro (id="wc-data"). */
export function appData(): AppData {
  if (!cached) {
    const el = document.getElementById('wc-data');
    cached = el ? (JSON.parse(el.textContent || '{}') as AppData) : { matches: [], teams: {}, stadiums: {}, stageLabels: {} };
  }
  return cached;
}

/* ---- follows (My Teams) ---- */
const FOLLOWS_KEY = 'wc26-follows';
type Listener = (follows: string[]) => void;
const listeners = new Set<Listener>();

export function getFollows(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FOLLOWS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function toggleFollow(code: string): string[] {
  const cur = getFollows();
  const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
  try {
    localStorage.setItem(FOLLOWS_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
  listeners.forEach((fn) => fn(next));
  return next;
}

export function onFollowsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Highlights matches involving a followed team across every view —
 * toggles `.followed-match` on each `[data-match]` element (CSS draws a
 * gold corner star + ring), and keeps the inline name star in agenda
 * rows so you can see which side is yours.
 */
export function applyFollowStars(follows: string[]): void {
  const set = new Set(follows);
  document.querySelectorAll<HTMLElement>('[data-match][data-teams]').forEach((el) => {
    const teams = (el.dataset.teams ?? '').split(' ').filter(Boolean);
    el.classList.toggle('followed-match', teams.some((t) => set.has(t)));
  });
  document.querySelectorAll<HTMLElement>('[data-star-team]').forEach((el) => {
    el.textContent = set.has(el.dataset.starTeam!) ? '★ ' : '';
  });
}

/* ---- Tweaks preferences ---- */
export interface Prefs {
  theme: 'dark' | 'light';
  textsize: 'compact' | 'standard' | 'large';
  tint: 'subtle' | 'standard' | 'loud';
}

const PREFS_KEY = 'wc26-prefs';
export const DEFAULT_PREFS: Prefs = { theme: 'dark', textsize: 'standard', tint: 'loud' };

export function getPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setPrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch { /* private mode */ }
  const root = document.documentElement;
  root.dataset.theme = p.theme;
  root.dataset.textsize = p.textsize;
  root.dataset.tint = p.tint;
}

/* ---- shared formatting ---- */
export function localTime(utcIso: string): string {
  return new Date(utcIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function flagUrl(iso: string, size: 40 | 80 | 160 = 40): string {
  return `https://flagcdn.com/w${size}/${iso}.png`;
}

/** Open-drawer event bus (rows are static HTML; islands listen). */
export function openTeamDrawer(code: string): void {
  window.dispatchEvent(new CustomEvent('wc26:open-team', { detail: { code } }));
}
export function openMatchDrawer(n: number): void {
  window.dispatchEvent(new CustomEvent('wc26:open-match', { detail: { n } }));
}
