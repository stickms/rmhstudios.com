import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listReportGroupsApi } from '@/lib/moderation/triage.contract';
import { triageQuery } from '@/lib/moderation/triage-schema';
import { parseTriageFilters } from '@/lib/moderation/triage';
import { listReportGroups } from '@/lib/moderation/triage.server';

/**
 * GET /api/admin/reports/groups — the moderation queue grouped by reported target. Admin only.
 * Query: status, reasons (comma list), entityType, min, sort (most | oldest | newest), cursor.
 */
export const route =
  apiRoute(
    '/api/admin/reports/groups',
    {
      GET: implement(
        listReportGroupsApi,
        {
          auth: 'admin',
          rateLimit:
            'read',
          query:
            triageQuery,
        },
        async ({
          query,
        }) =>
          Response.json(
            await listReportGroups(
              parseTriageFilters(
                query,
              ),
            ),
          ),
      ),
    },
  );
