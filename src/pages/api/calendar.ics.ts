import type { APIRoute } from 'astro';
import { MATCHES } from '../../data/schedule';
import { TEAMS, GROUPS } from '../../data/teams';
import { STADIUMS } from '../../data/stadiums';
import { buildIcs } from '../../lib/ics';
import { cacheGet, cachePut } from '../../lib/serverCache';

export const prerender = false;

const TTL = 3600; // 1 hour

/**
 * iCalendar feed. ?team=GER → one team's matches, ?group=A → one
 * group, no param → all 104. Subscribe via webcal:// (Google Calendar
 * "From URL", Apple Calendar). Stable UIDs mean a result re-fetch
 * updates the event title with the score instead of duplicating.
 */
export const GET: APIRoute = async ({ url }) => {
  const team = (url.searchParams.get('team') ?? '').toUpperCase();
  const group = (url.searchParams.get('group') ?? '').toUpperCase();

  let matches = MATCHES;
  let name = 'all';
  if (team && TEAMS[team]) {
    matches = MATCHES.filter((m) => m.a === team || m.b === team);
    name = `team-${team}`;
  } else if (group && GROUPS.includes(group)) {
    matches = MATCHES.filter((m) => m.group === group);
    name = `group-${group}`;
  }

  const cacheKey = `ics-${name}`;
  const hit = await cacheGet(cacheKey);
  const domain = url.hostname || 'wc2026.pages.dev';
  const body =
    hit?.body ??
    buildIcs(matches, TEAMS, STADIUMS, {
      domain,
      appUrl: `https://${domain}/`,
    });
  if (!hit) await cachePut(cacheKey, body, 'text/calendar', TTL);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="wc2026-${name}.ics"`,
      'Cache-Control': `public, max-age=${TTL}`,
    },
  });
};
