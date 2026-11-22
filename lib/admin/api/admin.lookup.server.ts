import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  adminLookupApi,
  adminLookupBatchApi,
} from '@/lib/admin/lookup.contract';
import {
  lookupBatchSchema,
  lookupQuerySchema,
} from '@/lib/admin/lookup-schema';
import { classifyLookup } from '@/lib/admin/lookup';
import {
  chargeLookupBudget,
  runAdminLookup,
  runAdminLookupBatch,
} from '@/lib/admin/lookup.server';

const NO_STORE =
  {
    'Cache-Control':
      'no-store',
  };

/**
 * GET /api/admin/lookup?q= — DEPRECATED: the page sends every lookup by POST. Kept for one release
 * for tabs that are still open. It refuses an e-mail address with 400 `USE_POST`, because a query
 * string lands in access logs and browser history. Admin only.
 *
 * POST /api/admin/lookup { items } — what 1 to 50 pasted ids, handles, e-mail addresses or site
 * links are, with their state and the admin tools that act on them: one group per item, in order,
 * one audit row per batch (never an e-mail address). Read-only, never resolves private messages.
 * Items resolve five at a time; the batch uses one unit of the 60-a-minute budget per item. Admin only.
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
        }) => {
          if (
            classifyLookup(
              query.q,
            )
              .type ===
            'email'
          )
            return Response.json(
              {
                error:
                  'USE_POST',
              },
              {
                status: 400,
                headers:
                  NO_STORE,
              },
            );
          return runAdminLookup(
            userId,
            query.q,
          );
        },
      ),
      POST: implement(
        adminLookupBatchApi,
        {
          auth: 'admin',
          rateLimit:
            {
              limit: 60,
              windowMs: 60_000,
              prefix:
                'admin-lookup-batch',
            },
          body: lookupBatchSchema,
        },
        async ({
          userId,
          body,
        }) => {
          const wait =
            await chargeLookupBudget(
              userId,
              body
                .items
                .length,
            );
          if (
            wait !==
            null
          )
            return Response.json(
              {
                error:
                  'Too many requests',
              },
              {
                status: 429,
                headers:
                  {
                    ...NO_STORE,
                    'Retry-After':
                      String(
                        wait,
                      ),
                  },
              },
            );
          return Response.json(
            await runAdminLookupBatch(
              userId,
              body.items,
            ),
            {
              headers:
                NO_STORE,
            },
          );
        },
      ),
    },
  );
