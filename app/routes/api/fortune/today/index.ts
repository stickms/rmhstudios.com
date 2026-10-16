import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { todaysFortune } from '@/lib/delight/fortune.server';

/** GET /api/fortune/today — today's fortune cookie, or { fortune: null }. Public. */
export const Route = createFileRoute('/api/fortune/today/')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          cache: { visibility: 'public', maxAge: 60, sMaxAge: 60 },
        },
        async () => Response.json({ fortune: await todaysFortune() }),
      ),
    },
  },
});
