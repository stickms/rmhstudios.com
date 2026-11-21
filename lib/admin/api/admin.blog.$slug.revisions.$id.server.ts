import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getBlogRevisionApi } from '@/lib/admin/blog-revisions.contract';
import { getRevision } from '@/lib/blog/publication.server';

/** GET /api/admin/blog/$slug/revisions/$id — one saved version in full (s03-05). */
export const route =
  apiRoute(
    '/api/admin/blog/$slug/revisions/$id',
    {
      GET: implement(
        getBlogRevisionApi,
        {
          auth: 'admin',
          rateLimit:
            'read',
        },
        async ({
          params,
        }) => {
          if (
            !/^\d{1,18}$/.test(
              params.id,
            )
          )
            return Response.json(
              {
                error:
                  'Not found',
              },
              {
                status: 404,
              },
            );
          const revision =
            await getRevision(
              params.slug,
              BigInt(
                params.id,
              ),
            );
          if (
            !revision
          )
            return Response.json(
              {
                error:
                  'Not found',
              },
              {
                status: 404,
              },
            );
          return Response.json(
            {
              revision,
            },
            {
              headers:
                {
                  'Cache-Control':
                    'private, no-store',
                },
            },
          );
        },
      ),
    },
  );
