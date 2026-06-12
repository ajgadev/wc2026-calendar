/**
 * Build-time MagentaSport highlight archive (YouTube Data API v3).
 * The runtime RSS endpoint only sees the latest ~15 uploads; this script
 * pages the channel's uploads playlist back to tournament start and
 * persists every video that matches a finished match, keyed by match
 * number. Without YOUTUBE_API_KEY it skips with a warning — RSS-only
 * mode still covers recent matches.
 *
 * Output: public/data/highlights.json — { [matchN]: { videoId, title, published } }
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/data/highlights.json');
const UPLOADS_PLAYLIST = 'UUhr7ZXDFiPOEl543HM4Aj8g'; // channel UC… with UC→UU
const TOURNAMENT_START = Date.parse('2026-06-11T00:00:00Z');

const key = process.env.YOUTUBE_API_KEY;

function ensureDefault() {
  if (!existsSync(OUT)) {
    mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
    writeFileSync(OUT, '{}');
  }
}

if (!key) {
  console.warn('[highlights] WARNING: YOUTUBE_API_KEY not set — archive skipped (RSS-only mode still works)');
  ensureDefault();
} else {
  const { MATCHES } = await import('../src/data/schedule');
  const { TEAMS } = await import('../src/data/teams');
  const { matchVideoToMatch } = await import('../src/lib/highlights');

  interface Item {
    snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } };
  }

  let archive: Record<string, { videoId: string; title: string; published: string }> = {};
  try {
    archive = JSON.parse(readFileSync(OUT, 'utf8'));
  } catch { /* first run */ }

  let pageToken = '';
  let pages = 0;
  let reachedStart = false;
  while (!reachedStart && pages < 40) {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${UPLOADS_PLAYLIST}&key=${key}` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[highlights] WARNING: YouTube API ${res.status} — keeping existing archive`);
      break;
    }
    const data = (await res.json()) as { items?: Item[]; nextPageToken?: string };
    pages++;
    for (const item of data.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title;
      const published = item.snippet?.publishedAt;
      if (!videoId || !title || !published) continue;
      if (Date.parse(published) < TOURNAMENT_START) {
        reachedStart = true;
        continue;
      }
      const match = matchVideoToMatch({ videoId, title, published }, MATCHES, (c) => TEAMS[c]?.name ?? c);
      if (match) archive[String(match.n)] = { videoId, title, published };
    }
    pageToken = data.nextPageToken ?? '';
    if (!pageToken) break;
  }

  mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(archive, null, 1));
  console.log(`[highlights] archive has ${Object.keys(archive).length} matched videos (${pages} pages scanned)`);
}
