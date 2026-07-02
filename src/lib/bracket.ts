import type { Match, Stage } from './types';
import { decideMatch } from './result';

/**
 * Knockout tree derived from the schedule, not hardcoded.
 * `W{n}` / `L{n}` references in the source team strings define the edges:
 * we walk back from the final to order each round's column "by who feeds
 * whom", so connector geometry stays consistent as placeholders resolve
 * into real teams.
 *
 * Once a match finishes, the rebuild rewrites the downstream `W{n}` ref
 * into the actual team name — the edge would otherwise vanish. So when a
 * feeder ref is already resolved we recover it by winner: the feeder is
 * the match in the feeding round that this team won. Keeps the full
 * bracket intact all the way to the final.
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

/** Round that feeds each knockout stage (winners advance one round). */
const FEEDER_STAGE: Partial<Record<Stage, Stage>> = { R16: 'R32', QF: 'R16', SF: 'QF', F: 'SF', '3RD': 'SF' };

/** Winning team's code for a finished match (penalty shootouts included). */
function winnerCodeOf(m: Match): string | undefined {
  if (!m.ft || !m.a || !m.b) return undefined;
  const d = decideMatch(m);
  return d.win === 'a' ? m.a : d.win === 'b' ? m.b : undefined;
}

/** `${stage}|${winnerCode}` → match number, for recovering resolved edges. */
function winnerIndex(ko: Record<number, Match>): Map<string, number> {
  const idx = new Map<string, number>();
  for (const m of Object.values(ko)) {
    const code = winnerCodeOf(m);
    if (code) idx.set(`${m.stage}|${code}`, m.n);
  }
  return idx;
}

/**
 * The match number feeding `side` of `m` — the `W{n}` ref when present,
 * else (ref already resolved to a team) the feeding-round match that team
 * won.
 */
function feederN(m: Match, side: 'a' | 'b', winIndex: Map<string, number>): number | null {
  const direct = feedOf(side === 'a' ? m.rawA : m.rawB);
  if (direct != null) return direct;
  const code = side === 'a' ? m.a : m.b;
  const feedStage = FEEDER_STAGE[m.stage];
  if (code && feedStage) return winIndex.get(`${feedStage}|${code}`) ?? null;
  return null;
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

  const winIndex = winnerIndex(ko);
  const cols: Record<string, Match[]> = { R32: [], R16: [], QF: [], SF: [], F: [] };
  const seen = new Set<number>();
  const walk = (n: number | null) => {
    if (n == null) return;
    const m = ko[n];
    if (!m || seen.has(n)) return;
    seen.add(n);
    if (cols[m.stage]) cols[m.stage].push(m);
    if (m.stage !== 'R32') {
      walk(feederN(m, 'a', winIndex));
      walk(feederN(m, 'b', winIndex));
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

  const winIndex = winnerIndex(ko);
  const collectSide = (rootN: number | null): BracketHalf => {
    const half: BracketHalf = { R32: [], R16: [], QF: [], SF: [] };
    const rec = (n: number | null) => {
      if (n == null) return;
      const m = ko[n];
      if (!m) return;
      const bucket = half[m.stage as keyof BracketHalf];
      if (bucket) bucket.push(m);
      if (m.stage !== 'R32') {
        rec(feederN(m, 'a', winIndex));
        rec(feederN(m, 'b', winIndex));
      }
    };
    rec(rootN);
    return half;
  };

  const left = collectSide(final ? feederN(final, 'a', winIndex) : null);
  const right = collectSide(final ? feederN(final, 'b', winIndex) : null);
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
