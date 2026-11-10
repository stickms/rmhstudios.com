import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { geocodeQuery } from '@/lib/rideshare/rideshare-schema';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { geocode } from '@/lib/rideshare/osm.server';

export const Route = createFileRoute('/api/rideshare/geocode')({
  server: {
    handlers: {
      GET: implement(C.geocodeApi, { query: geocodeQuery }, async ({ request }) => {
        try {
          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 30,
            windowMs: 60_000,
            prefix: 'rideshare-geocode',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many searches. Please slow down.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
          if (q.length < 3) {
            return Response.json({ results: [] });
          }

          const results = await geocode(q, 5);
          return Response.json({ results });
        } catch (error) {
          console.error('Rideshare geocode error:', error);
          return Response.json(
            { error: 'Location search is unavailable right now.' },
            { status: 502 },
          );
        }
      }),
    },
  },
});
