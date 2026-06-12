import type { APIRoute } from 'astro';
import { cacheGet, cachePut, getSecret } from '../../lib/serverCache';
import { teamCodeFor } from '../../data/teamNames';
import type { ScorerRow } from '../../lib/stats';

export const prerender = false;

const TTL = 600; // 10 minutes — top scorers change slowly

/** football-data.org top scorers proxy → ScorerRow[] keyed to FIFA codes. */
export const GET: APIRoute = async ({ locals }) => {
  const token = getSecret(locals, 'FOOTBALL_DATA_TOKEN');
  if (!token) return err('scorers not configured');

  const hit = await cacheGet('scorers');
  if (hit) return ok(hit.body);

  try {
    const upstream = await fetch('https://api.football-data.org/v4/competitions/WC/scorers?limit=20', {
      headers: { 'X-Auth-Token': token },
    });
    if (!upstream.ok) return err(`upstream ${upstream.status}`);
    const data = (await upstream.json()) as {
      scorers?: {
        player: { name: string };
        team: { name: string };
        goals: number | null;
        assists: number | null;
        penalties: number | null;
      }[];
    };
    const rows: ScorerRow[] = (data.scorers ?? []).map((s) => ({
      name: s.player?.name ?? '',
      team: teamCodeFor(s.team?.name ?? '') ?? '',
      goals: s.goals ?? 0,
      assists: s.assists ?? 0,
      penalties: s.penalties ?? 0,
    }));
    const body = JSON.stringify(rows);
    await cachePut('scorers', body, 'application/json', TTL);
    return ok(body);
  } catch {
    return err('upstream unreachable');
  }
};

const ok = (body: string) =>
  new Response(body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${TTL}` },
  });

const err = (error: string) =>
  new Response(JSON.stringify({ error }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
  });
