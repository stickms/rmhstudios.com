import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { classifyRumRoute, getRumRouteLabel, getRumThreshold } from '@/lib/rum-slo';

/**
 * POST /api/rum — sink for Core Web Vitals reports from `lib/rum.ts`.
 *
 * Accepts and validates every metric, emits a structured sample for aggregate
 * p75/p95 reporting, logs Web Vitals' own `poor` ratings, and emits a guardrail
 * warning when a route-class-specific SLO threshold is exceeded.
 */

const MetricSchema = z.object({
  name: z.enum(['LCP', 'INP', 'CLS', 'TTFB', 'FCP']),
  value: z.number().nonnegative().max(300_000),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  id: z.string().max(64).optional(),
  navigationType: z.string().max(32).optional(),
  path: z.string().max(200).regex(/^\//).optional(),
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
        const routeClass = classifyRumRoute(m.path);
        const threshold = getRumThreshold(routeClass, m.name);
        const sloBreach = threshold != null && m.value > threshold;
        const metric = {
          name: m.name,
          value: m.value,
          rating: m.rating,
          threshold,
          sloBreach,
          route: getRumRouteLabel(m.path),
          routeClass,
          navigationType: m.navigationType,
          clientTs: m.ts,
          receivedAt: new Date().toISOString(),
        };

        // Every valid sample is emitted so the log pipeline can calculate p75
        // and p95 by route class. Warning events remain easy to alert on without
        // treating a single slow navigation as an aggregate percentile.
        // eslint-disable-next-line no-console -- normal metrics are informational, not warnings
        console.info('[rum:metric]', JSON.stringify(metric));
        if (m.rating === 'poor') {
          console.warn('[rum:poor]', JSON.stringify(metric));
        }
        if (sloBreach) {
          console.warn('[rum:slo-breach]', JSON.stringify(metric));
        }

        return new Response(null, { status: 204 });
      },
    },
  },
});
