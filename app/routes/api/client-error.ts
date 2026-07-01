import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/client-error — sink for client-side error reports.
 *
 * Receives compact payloads from `lib/client-errors.ts` (uncaught errors,
 * unhandled rejections, and React error-boundary reports), rate-limits per IP,
 * and logs them server-side. `console.error` is preserved in production bundles
 * (see `vite.config.ts` esbuild.pure), so these surface in the server logs and
 * are ready to forward to a hosted error tracker later.
 */

const ErrorSchema = z.object({
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  componentStack: z.string().max(4000).optional(),
  source: z.string().max(64).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(300).optional(),
  ts: z.string().max(40).optional(),
});

export const Route = createFileRoute('/api/client-error')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, {
          limit: 30,
          windowMs: 60_000,
          prefix: 'client-error',
        });
        if (!allowed) return new Response(null, { status: 429 });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(null, { status: 400 });
        }

        const parsed = ErrorSchema.safeParse(body);
        if (!parsed.success) return new Response(null, { status: 400 });

        const e = parsed.data;
        console.error(
          '[client-error]',
          JSON.stringify({
            message: e.message,
            source: e.source,
            url: e.url,
            userAgent: e.userAgent,
            ts: e.ts,
            stack: e.stack,
            componentStack: e.componentStack,
            ip,
          }),
        );

        return new Response(null, { status: 204 });
      },
    },
  },
});
