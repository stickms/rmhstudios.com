import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { requireMod } from '@/lib/communities/guard.server';
import { exportModLogApi } from '@/lib/communities/modlog.contract';
import { exportModLog } from '@/lib/communities/modlog.server';

/**
 * GET /api/communities/$slug/modlog/export — the last 365 days of the moderation log as a CSV
 * download (moderators only). Cells a spreadsheet would read as formulas are quoted as text.
 */
export const route =
  apiRoute(
    '/api/communities/$slug/modlog/export',
    {
      GET: implement(
        exportModLogApi,
        {
          rateLimit:
            {
              limit: 10,
              windowMs: 60_000,
              prefix:
                'community-modlog-export',
            },
        },
        async ({
          params,
          userId,
        }) => {
          const guard =
            await requireMod(
              params.slug,
              userId,
            );
          if (
            !guard.ok
          )
            return guard.response;
          return new Response(
            await exportModLog(
              guard
                .value
                .id,
            ),
            {
              headers:
                {
                  'Content-Type':
                    'text/csv; charset=utf-8',
                  'Content-Disposition': `attachment; filename="${guard.value.slug}-moderation-log.csv"`,
                  'Cache-Control':
                    'private, no-store',
                },
            },
          );
        },
      ),
    },
  );
