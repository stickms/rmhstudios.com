import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/rum — sink for Core Web Vitals reports from `lib/rum.ts`.
 *
 * Accepts and validates every metric (ready to forward to a hosted RUM backend
 * later) but only logs the `poor`-rated ones, so the server logs surface
 * actionable real-user regressions without per-pageload noise. `console.warn`
 * is preserved in production bundles (see `vite.config.ts` esbuild.pure).
 */

const MetricSchema = z.object({
  name: z.string().max(20),
  value: z.number(),
  rating: z.string().max(20).optional(),
  id: z.string().max(64).optional(),
  navigationType: z.string().max(32).optional(),
  path: z.string().max(200).optional(),
  ts: z.string().max(40).optional(),
});

export const Route = createFileRoute('/api/rum')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'rum' });
        if (!allowed) return new Response(null, { status: 429 });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(null, { status: 400 });
        }

        const parsed = MetricSchema.safeParse(body);
        if (!parsed.success) return new Response(null, { status: 400 });

        const m = parsed.data;
        if (m.rating === 'poor') {
          console.warn(
            '[rum:poor]',
            JSON.stringify({
              name: m.name,
              value: m.value,
              path: m.path,
              navigationType: m.navigationType,
            }),
          );
        }

        return new Response(null, { status: 204 });
      },
    },
  },
});
