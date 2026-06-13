import type { Match, Stage } from './types';

/**
 * Knockout tree derived from the schedule, not hardcoded.
 * `W{n}` / `L{n}` references in the source team strings define the edges:
 * we walk back from the final to order each round's column "by who feeds
 * whom", so connector geometry stays consistent as placeholders resolve
 * into real teams (zero code changes needed on rebuild).
 */

export interface BracketColumn {
  stage: Stage;
  label: string;
  matches: Match[];
}

const FEED_RE = /(?:Match |^[WL])(\d+)/;

function feedOf(s: string | undefined): number | null {
  if (!s) return null;
  const m = FEED_RE.exec(s);
  return m ? Number(m[1]) : null;
}

export function buildBracket(matches: Match[]): { columns: BracketColumn[]; thirdPlace?: Match } {
  const ko: Record<number, Match> = {};
  let finalN: number | null = null;
  let thirdPlace: Match | undefined;
  for (const m of matches) {
    if (m.stage === 'GR') continue;
    ko[m.n] = m;
    if (m.stage === 'F') finalN = m.n;
    if (m.stage === '3RD') thirdPlace = m;
  }

  const cols: Record<string, Match[]> = { R32: [], R16: [], QF: [], SF: [], F: [] };
  const seen = new Set<number>();
  const walk = (n: number | null) => {
    if (n == null) return;
    const m = ko[n];
    if (!m || seen.has(n)) return;
    seen.add(n);
    if (cols[m.stage]) cols[m.stage].push(m);
    if (m.stage !== 'R32') {
      // walk the raw source strings — placeholders carry the references
      walk(feedOf(m.rawA));
      walk(feedOf(m.rawB));
    }
  };
  walk(finalN);

  // Defensive: any knockout match the walk missed (unparseable refs)
  // is appended to its round so it still renders.
  for (const m of Object.values(ko)) {
    if (m.stage !== '3RD' && !seen.has(m.n)) {
      console.warn(`[bracket] match ${m.n} not reachable from the final — appending`);
      cols[m.stage]?.push(m);
    }
  }

  return {
    columns: [
      { stage: 'R32', label: 'ROUND OF 32', matches: cols.R32 },
      { stage: 'R16', label: 'ROUND OF 16', matches: cols.R16 },
      { stage: 'QF', label: 'QUARTERFINALS', matches: cols.QF },
      { stage: 'SF', label: 'SEMIFINALS', matches: cols.SF },
      { stage: 'F', label: 'FINAL', matches: cols.F },
    ],
    thirdPlace,
  };
}

export interface BracketHalf {
  R32: Match[];
  R16: Match[];
  QF: Match[];
  SF: Match[];
}

export interface BracketTree {
  left: BracketHalf;
  right: BracketHalf;
  final?: Match;
  thirdPlace?: Match;
}

/**
 * Symmetric wallchart model: each semifinal subtree forms one half,
 * converging on the final. Derived from the same W{n} references — the
 * final's two feeders define the left and right SF roots, and each side
 * is collected R32→SF in feed order so connector geometry stays aligned
 * as placeholders resolve.
 */
export function buildBracketTree(matches: Match[]): BracketTree {
  const ko: Record<number, Match> = {};
  let final: Match | undefined;
  let thirdPlace: Match | undefined;
  for (const m of matches) {
    if (m.stage === 'GR') continue;
    ko[m.n] = m;
    if (m.stage === 'F') final = m;
    if (m.stage === '3RD') thirdPlace = m;
  }

  const collectSide = (rootN: number | null): BracketHalf => {
    const half: BracketHalf = { R32: [], R16: [], QF: [], SF: [] };
    const rec = (n: number | null) => {
      if (n == null) return;
      const m = ko[n];
      if (!m) return;
      const bucket = half[m.stage as keyof BracketHalf];
      if (bucket) bucket.push(m);
      if (m.stage !== 'R32') {
        rec(feedOf(m.rawA));
        rec(feedOf(m.rawB));
      }
    };
    rec(rootN);
    return half;
  };

  const left = collectSide(final ? feedOf(final.rawA) : null);
  const right = collectSide(final ? feedOf(final.rawB) : null);
  return { left, right, final, thirdPlace };
}

/** Short placeholder for compact bracket cards: "1st Group A", "Winner M73". */
export function shortPlaceholder(label: string): string {
  return label
    .replace(/^Group ([A-L]) winner$/, '1st Group $1')
    .replace(/^Group ([A-L]) runner-up$/, '2nd Group $1')
    .replace(/^Winner of Match (\d+)$/, 'Winner M$1')
    .replace(/^Loser of Match (\d+)$/, 'Loser M$1');
}
