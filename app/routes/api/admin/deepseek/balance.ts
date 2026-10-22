import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { cached } from '@/lib/cached.server';
import {
  deepseekErrorResponse,
  fetchDeepseekBalance,
  getLatestDeepseekSnapshots,
} from '@/lib/deepseek/balance.server';

/**
 * GET /api/admin/deepseek/balance — the live DeepSeek account balance (cached
 * 30 s so an open page cannot hammer the upstream) plus the newest persisted
 * snapshot per currency. On an upstream failure the error code is returned with
 * the persisted snapshots still attached, so the page can show the last known
 * balance next to the problem. The API key never appears in a response.
 */
export const Route = createFileRoute('/api/admin/deepseek/balance')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'admin', rateLimit: 'read', label: 'admin-deepseek-balance' },
        async () => {
          const latest = await getLatestDeepseekSnapshots();
          try {
            const live = await cached('deepseek:balance', 30_000, fetchDeepseekBalance);
            return Response.json({ live, latest }, { headers: { 'Cache-Control': 'no-store' } });
          } catch (err) {
            return deepseekErrorResponse(err, { latest });
          }
        },
      ),
    },
  },
});
