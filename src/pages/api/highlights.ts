import type { APIRoute } from 'astro';
import { cacheGet, cachePut } from '../../lib/serverCache';
import type { Highlight } from '../../lib/types';

export const prerender = false;

const TTL = 1800; // 30 minutes
const CHANNEL_ID = 'UChr7ZXDFiPOEl543HM4Aj8g'; // MAGENTA SPORT
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

/**
 * MagentaSport channel RSS → latest ~15 uploads, no API key needed.
 * The client matches titles to matches via lib/highlights.ts, so a
 * highlight appears ≤30 min after upload without any rebuild.
 */
export const GET: APIRoute = async () => {
  const hit = await cacheGet('highlights-rss');
  if (hit) return ok(hit.body);

  try {
    const upstream = await fetch(FEED, {
      headers: { 'User-Agent': 'wc2026-calendar/1.0 (highlights RSS reader)' },
    });
    if (!upstream.ok) return err(`upstream ${upstream.status}`);
    const xml = await upstream.text();
    const body = JSON.stringify(parseFeed(xml));
    await cachePut('highlights-rss', body, 'application/json', TTL);
    return ok(body);
  } catch {
    return err('upstream unreachable');
  }
};

/** Minimal Atom parser — the YT feed is machine-generated and regular. */
function parseFeed(xml: string): Highlight[] {
  const out: Highlight[] = [];
  const entries = xml.split('<entry>').slice(1);
  for (const entry of entries) {
    const videoId = pick(entry, 'yt:videoId');
    const title = pick(entry, 'title');
    const published = pick(entry, 'published');
    if (videoId && title && published) {
      out.push({ videoId, title: decodeEntities(title), published });
    }
  }
  return out;
}

function pick(chunk: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(chunk);
  return m ? m[1].trim() : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const ok = (body: string) =>
  new Response(body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${TTL}` },
  });

const err = (error: string) =>
  new Response(JSON.stringify({ error }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
