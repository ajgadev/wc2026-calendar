import { TEAM_NAMES_DE } from '../data/teamNamesDe';

/**
 * MagentaSport video title → match matching, shared by the runtime RSS
 * path (/api/highlights consumer) and the build-time YouTube archive
 * script. Precision over recall: BOTH team names must appear in the
 * title (German or English, order-insensitive), the word "Highlights"
 * must be present, and the publish time must fall in
 * [kickoff, kickoff + 48h]. A wrongly attached video is a worse bug
 * than a missing one — never fuzzy-match below both-teams confidence.
 */

export interface MatchLike {
  n: number;
  a?: string;
  b?: string;
  utc: string;
}

export interface VideoLike {
  videoId: string;
  title: string;
  published: string;
}

const PUBLISH_WINDOW_MS = 48 * 3600_000;

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // German umlauts survive as base letters after NFD strip; also map ß
    .replace(/ß/g, 'ss');

/** All recognizable name variants (German + English) per team code. */
function variantsFor(code: string, englishName: string): string[] {
  return [...(TEAM_NAMES_DE[code] ?? []), englishName, code].map(fold);
}

function titleMentions(titleFolded: string, variants: string[]): boolean {
  return variants.some((v) => v.length >= 3 && titleFolded.includes(v));
}

export function matchVideoToMatch(
  video: VideoLike,
  matches: MatchLike[],
  englishNameOf: (code: string) => string,
): MatchLike | null {
  const t = fold(video.title);
  if (!t.includes('highlights')) return null; // skip interviews/pressers
  const published = Date.parse(video.published);
  if (Number.isNaN(published)) return null;

  const candidates = matches.filter((m) => {
    if (!m.a || !m.b) return false;
    const kick = Date.parse(m.utc);
    if (published < kick || published > kick + PUBLISH_WINDOW_MS) return false;
    return (
      titleMentions(t, variantsFor(m.a, englishNameOf(m.a))) &&
      titleMentions(t, variantsFor(m.b, englishNameOf(m.b)))
    );
  });

  // Ambiguity (two candidate matches in the window) → no match.
  return candidates.length === 1 ? candidates[0] : null;
}
