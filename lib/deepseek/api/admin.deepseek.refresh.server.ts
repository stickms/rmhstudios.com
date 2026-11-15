import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { deepseekErrorResponse, recordDeepseekBalance } from '@/lib/deepseek/balance.server';

/**
 * POST /api/admin/deepseek/refresh — fetch the balance now and persist it as a
 * 'manual' snapshot (one per currency per hour; a later refresh in the same
 * hour replaces it). Bypasses the 30 s read cache by design.
 */
export const route = apiRoute('/api/admin/deepseek/refresh', {
  POST: defineHandler(
    {
      auth: 'admin',
      rateLimit: 'write',
      allowEmptyBody: true,
      label: 'admin-deepseek-refresh',
    },
    async () => {
      try {
        const { balance, rows } = await recordDeepseekBalance('manual');
        return Response.json(
          { live: balance, snapshots: rows },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      } catch (err) {
        return deepseekErrorResponse(err);
      }
    },
  ),
});
