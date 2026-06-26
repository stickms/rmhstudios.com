import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { buildTenorRequestUrl, normalizeTenorResponse } from '@/lib/tenor.server';

/**
 * Server-side Tenor proxy for the in-app GIF picker. Keeps TENOR_API_KEY off the
 * client. Empty `q` returns trending (Tenor /v2/featured); `pos` paginates.
 */
export const Route = createFileRoute('/api/gif/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = process.env.TENOR_API_KEY;
        if (!key) {
          return new Response(JSON.stringify({ error: 'GIF search unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'gif-search' });
        if (!allowed) {
          return new Response(JSON.stringify({ error: 'Rate limited' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
          });
        }

        const params = new URL(request.url).searchParams;
        const q = params.get('q') ?? '';
        const pos = params.get('pos');

        const tenorUrl = buildTenorRequestUrl({
          q,
          pos,
          key,
          clientKey: process.env.TENOR_CLIENT_KEY,
        });

        try {
          const res = await fetch(tenorUrl, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) {
            return new Response(JSON.stringify({ error: 'GIF provider error', results: [], next: null }), {
              status: 502,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          const json = await res.json();
          return Response.json(normalizeTenorResponse(json));
        } catch {
          return new Response(JSON.stringify({ error: 'GIF provider error', results: [], next: null }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
