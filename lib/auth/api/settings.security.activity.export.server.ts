import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { exportSecurityActivityApi } from '@/lib/auth/security-log.contract';
import { exportSecurityEvents } from '@/lib/auth/security-log.server';
import { toCsv } from '@/lib/auth/security-log';

/**
 * GET /api/settings/security/activity/export — the signed-in member's whole security log as a CSV
 * download. Cells a spreadsheet would read as formulas are quoted as text (`csvCell`).
 */
export const route = apiRoute('/api/settings/security/activity/export', {
  GET: implement(
    exportSecurityActivityApi,
    { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'security-activity-export' } },
    async ({ userId }) =>
      new Response(toCsv(await exportSecurityEvents(userId)), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="security-activity.csv"',
          'Cache-Control': 'private, no-store',
        },
      }),
  ),
});
