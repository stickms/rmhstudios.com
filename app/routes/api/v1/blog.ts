import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { parsePage } from '@/lib/api/serializers.server';

/** GET /api/v1/blog — RMH Studios devlog posts, newest first. */
export const Route = createFileRoute('/api/v1/blog')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ json }) => {
            const { limit, cursor } = parsePage(new URL(request.url));
            const rows = await prisma.blogPost.findMany({
              where: cursor ? { createdAt: { lt: new Date(cursor) } } : {},
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: { slug: true, title: true, description: true, date: true, tags: true, image: true, createdAt: true },
            });
            const data = rows.map((p) => ({ slug: p.slug, title: p.title, description: p.description, date: p.date, tags: p.tags, image: p.image }));
            const nextCursor = rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null;
            return json({ data, nextCursor });
          },
          { scope: 'read:content' }
        ),
    },
  },
});
