/**
 * Tiny response cache for the API routes. On Cloudflare it uses the
 * Cache API (shared per-PoP); everywhere it also keeps an in-memory
 * module cache as belt-and-braces. Combined with `Cache-Control:
 * public, max-age=N` on responses, upstream sees ≤1 request per TTL
 * regardless of visitor count.
 */

interface Entry {
  body: string;
  contentType: string;
  expires: number;
}

const memory = new Map<string, Entry>();

declare const caches: { default?: { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> } } | undefined;

function cacheRequest(key: string): Request {
  return new Request(`https://cache.wc26.internal/${encodeURIComponent(key)}`);
}

export async function cacheGet(key: string): Promise<{ body: string; contentType: string } | null> {
  const mem = memory.get(key);
  if (mem && mem.expires > Date.now()) return mem;
  try {
    if (typeof caches !== 'undefined' && caches?.default) {
      const hit = await caches.default.match(cacheRequest(key));
      if (hit) {
        return { body: await hit.text(), contentType: hit.headers.get('Content-Type') ?? 'application/json' };
      }
    }
  } catch { /* not on Cloudflare */ }
  return null;
}

export async function cachePut(key: string, body: string, contentType: string, ttlSeconds: number): Promise<void> {
  memory.set(key, { body, contentType, expires: Date.now() + ttlSeconds * 1000 });
  try {
    if (typeof caches !== 'undefined' && caches?.default) {
      await caches.default.put(
        cacheRequest(key),
        new Response(body, {
          headers: { 'Content-Type': contentType, 'Cache-Control': `public, max-age=${ttlSeconds}` },
        }),
      );
    }
  } catch { /* not on Cloudflare */ }
}

/** Reads a secret from the Cloudflare runtime env, falling back to Vite env in dev. */
export function getSecret(locals: unknown, name: string): string | undefined {
  const runtime = (locals as { runtime?: { env?: Record<string, string> } })?.runtime;
  return runtime?.env?.[name] ?? (import.meta.env[name] as string | undefined);
}
