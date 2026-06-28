import type { APIRoute } from 'astro';
import { cacheGet, cachePut, getSecret } from '../../lib/serverCache';
import type { LiveMatch } from '../../lib/types';

export const prerender = false;

const TTL = 60; // seconds — upstream sees ≤1 req/min regardless of visitors

/**
 * football-data.org proxy. The upstream sends no CORS headers and the
 * token must never reach the client, so the browser only ever talks to
 * this endpoint. Accepts ?dateFrom=&dateTo= passthrough (the poller
 * sends today ± 1 day to keep payloads small).
 */
export const GET: APIRoute = async ({ url, locals }) => {
  const token = getSecret(locals, 'FOOTBALL_DATA_TOKEN');
  if (!token) {
    return json({ error: 'live updates not configured' }, 503, 30);
  }

  const dateFrom = sanitizeDate(url.searchParams.get('dateFrom'));
  const dateTo = sanitizeDate(url.searchParams.get('dateTo'));
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('dateFrom', dateFrom);
  if (dateTo) qs.set('dateTo', dateTo);
  const cacheKey = `live?${qs.toString()}`;

  const hit = await cacheGet(cacheKey);
  if (hit) return new Response(hit.body, { headers: headers(TTL) });

  try {
    const upstream = await fetch(
      `https://api.football-data.org/v4/competitions/WC/matches${qs.size ? `?${qs}` : ''}`,
      { headers: { 'X-Auth-Token': token } },
    );
    if (!upstream.ok) {
      return json({ error: `upstream ${upstream.status}` }, 503, 30);
    }
    const data = (await upstream.json()) as {
      matches?: {
        utcDate: string;
        status: LiveMatch['status'];
        minute?: number | null;
        homeTeam: { name: string };
        awayTeam: { name: string };
        score: LiveMatch['score'] & { winner?: LiveMatch['winner'] };
      }[];
    };
    const slim: LiveMatch[] = (data.matches ?? []).map((m) => ({
      utcDate: m.utcDate,
      status: m.status,
      minute: m.minute ?? null,
      homeTeam: m.homeTeam?.name ?? '',
      awayTeam: m.awayTeam?.name ?? '',
      winner: m.score?.winner ?? null,
      score: {
        fullTime: m.score?.fullTime ?? { home: null, away: null },
        halfTime: m.score?.halfTime ?? { home: null, away: null },
      },
    }));
    const body = JSON.stringify(slim);
    await cachePut(cacheKey, body, 'application/json', TTL);
    return new Response(body, { headers: headers(TTL) });
  } catch {
    return json({ error: 'upstream unreachable' }, 503, 30);
  }
};

function sanitizeDate(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function headers(ttl: number): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${ttl}`,
  };
}

function json(payload: unknown, status: number, ttl: number): Response {
  return new Response(JSON.stringify(payload), { status, headers: headers(ttl) });
}
