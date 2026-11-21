import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminLookupApi } from '@/lib/admin/lookup.contract';
import { lookupQuerySchema } from '@/lib/admin/lookup-schema';
import { runAdminLookup } from '@/lib/admin/lookup.server';

/**
 * GET /api/admin/lookup?q= — what a pasted id, handle, e-mail address or site link is, with its
 * state and the admin tools that act on it. Read-only, never resolves private messages, and
 * writes one audit row per lookup (never the e-mail address). Admin only.
 */
export const route =
  apiRoute(
    '/api/admin/lookup',
    {
      GET: implement(
        adminLookupApi,
        {
          auth: 'admin',
          rateLimit:
            {
              limit: 60,
              windowMs: 60_000,
              prefix:
                'admin-lookup',
            },
          query:
            lookupQuerySchema,
        },
        async ({
          userId,
          query,
        }) =>
          runAdminLookup(
            userId,
            query.q,
          ),
      ),
    },
  );
