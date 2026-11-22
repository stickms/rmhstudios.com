import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listBlogRevisionsApi } from '@/lib/admin/blog-revisions.contract';
import { listRevisions } from '@/lib/blog/publication.server';

/** GET /api/admin/blog/$slug/revisions — the saved versions of a Log, newest first (s03-05). */
export const route = apiRoute('/api/admin/blog/$slug/revisions', {
  GET: implement(
    listBlogRevisionsApi,
    {
      auth: 'admin',
      rateLimit: 'read',
    },
    async ({ params }) => {
      const revisions = await listRevisions(params.slug);
      if (!revisions)
        return Response.json(
          {
            error: 'Post not found',
          },
          {
            status: 404,
          },
        );
      return Response.json(
        {
          revisions,
        },
        {
          headers: {
            'Cache-Control': 'private, no-store',
          },
        },
      );
    },
  ),
});
