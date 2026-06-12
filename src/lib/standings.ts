import type { Match } from './types';

export interface TableRow {
  code: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  /** W/D/L string, oldest first */
  form: string;
}

/**
 * Group tables computed locally from finished results.
 * Sort: points → goal difference → goals for → name (head-to-head
 * tiebreakers are out of scope for v1, as agreed in the brief).
 */
export function computeGroupTable(
  group: string,
  matches: Match[],
  teamCodes: string[],
  nameOf: (code: string) => string,
): { rows: TableRow[]; played: number } {
  const rows: Record<string, TableRow> = {};
  for (const c of teamCodes) {
    rows[c] = { code: c, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: '' };
  }
  let played = 0;
  const groupMatches = matches
    .filter((m) => m.group === group && m.a && m.b && m.ft)
    .sort((x, y) => Date.parse(x.utc) - Date.parse(y.utc));
  for (const m of groupMatches) {
    const [ga, gb] = m.ft!;
    const A = rows[m.a!];
    const B = rows[m.b!];
    if (!A || !B) continue;
    played++;
    A.p++; B.p++;
    A.gf += ga; A.ga += gb;
    B.gf += gb; B.ga += ga;
    if (ga > gb) { A.w++; B.l++; A.pts += 3; A.form += 'W'; B.form += 'L'; }
    else if (ga < gb) { B.w++; A.l++; B.pts += 3; B.form += 'W'; A.form += 'L'; }
    else { A.d++; B.d++; A.pts++; B.pts++; A.form += 'D'; B.form += 'D'; }
  }
  const sorted = Object.values(rows)
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort(
      (x, y) =>
        y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || nameOf(x.code).localeCompare(nameOf(y.code)),
    );
  return { rows: sorted, played };
}
