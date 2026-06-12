/**
 * Refreshes the vendored openfootball schedule before each build, so the
 * daily rebuild picks up finished scores and resolved knockout teams.
 * On any failure the committed copy stays in place (build warning only).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const OUT = resolve(import.meta.dirname, '../src/data/vendor/worldcup-2026.json');

try {
  const res = await fetch(URL, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { matches?: unknown[] };
  if (!Array.isArray(data.matches) || data.matches.length < 100) {
    throw new Error(`suspicious payload (${data.matches?.length ?? 0} matches) — keeping vendored copy`);
  }
  writeFileSync(OUT, JSON.stringify(data, null, 1));
  console.log(`[refresh-schedule] vendored copy updated (${data.matches.length} matches)`);
} catch (e) {
  console.warn(`[refresh-schedule] WARNING: fetch failed (${(e as Error).message}); using vendored copy`);
}
