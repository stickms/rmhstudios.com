import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listMissingAltTextApi } from '@/lib/feed/alt-text-edit.contract';
import { missingAltQuerySchema } from '@/lib/feed/alt-text-edit-schema';
import { listPostsMissingAlts } from '@/lib/feed/alt-text-edit.server';

/**
 * `GET /api/settings/missing-alt-text?after=` — the caller's own posts that still have an image without a description,
 * newest first, 20 a page (sprint 05 #16). Only ever the caller's own rows, never cached.
 */
export const route =
  apiRoute(
    '/api/settings/missing-alt-text',
    {
      GET: implement(
        listMissingAltTextApi,
        {
          rateLimit:
            'read',
          query:
            missingAltQuerySchema,
        },
        async ({
          userId,
          query,
        }) =>
          Response.json(
            await listPostsMissingAlts(
              userId,
              query.after,
            ),
            {
              headers:
                {
                  'Cache-Control':
                    'private, no-store',
                },
            },
          ),
      ),
    },
  );
