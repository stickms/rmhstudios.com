import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { todaysFortune } from '@/lib/delight/fortune.server';

/** GET /api/fortune/today — today's fortune cookie, or { fortune: null }. Public. */
export const route = apiRoute('/api/fortune/today', {
  GET: defineHandler(
    {
      auth: 'none',
      rateLimit: 'read',
      cache: { visibility: 'public', maxAge: 60, sMaxAge: 60 },
    },
    async () => Response.json({ fortune: await todaysFortune() }),
  ),
});
