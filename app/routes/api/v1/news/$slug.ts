import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';

/** GET /api/v1/news/{slug} — a single published news article. */
export const Route = createFileRoute('/api/v1/news/$slug')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const a = await prisma.newsArticle.findUnique({
              where: { slug: params.slug },
              select: {
                slug: true, title: true, description: true, date: true, category: true, tags: true, featured: true,
                content: true, image: true, status: true, sourceTitle: true, sourceUrl: true, sourcePublisher: true, sourceDate: true,
              },
            });
            if (!a || a.status !== 'PUBLISHED') return error('not_found', 'News article not found.', 404);
            return json({
              slug: a.slug, title: a.title, description: a.description, date: a.date, category: a.category,
              tags: a.tags, featured: a.featured, content: a.content, image: a.image,
              source: { title: a.sourceTitle, url: a.sourceUrl, publisher: a.sourcePublisher, date: a.sourceDate },
            });
          },
          { scope: 'read:content' }
        ),
    },
  },
});
