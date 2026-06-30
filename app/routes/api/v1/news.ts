import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { parsePage } from '@/lib/api/serializers.server';

/** GET /api/v1/news — published news articles, newest first. */
export const Route = createFileRoute('/api/v1/news')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ json }) => {
            const url = new URL(request.url);
            const { limit, cursor } = parsePage(new URL(request.url));
            const category = url.searchParams.get('category');
            const rows = await prisma.newsArticle.findMany({
              where: { status: 'PUBLISHED', ...(category ? { category } : {}), ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: { slug: true, title: true, description: true, date: true, category: true, tags: true, featured: true, image: true, createdAt: true },
            });
            const data = rows.map((a) => ({ slug: a.slug, title: a.title, description: a.description, date: a.date, category: a.category, tags: a.tags, featured: a.featured, image: a.image }));
            const nextCursor = rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null;
            return json({ data, nextCursor });
          },
          { scope: 'read:content' }
        ),
    },
  },
});
