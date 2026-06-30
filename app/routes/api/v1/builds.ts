import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, serializeAuthor, parsePage } from '@/lib/api/serializers.server';

/** GET /api/v1/builds — the public builds marketplace, newest first. */
export const Route = createFileRoute('/api/v1/builds')({
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

            const builds = await prisma.userBuild.findMany({
              where: {
                visibility: 'PUBLIC',
                publishedAt: { not: null, ...(cursor ? { lt: new Date(cursor) } : {}) },
                ...(category ? { category: { slug: category } } : {}),
              },
              orderBy: { publishedAt: 'desc' },
              take: limit,
              select: {
                slug: true, title: true, description: true, thumbnailUrl: true, technologies: true, price: true,
                likeCount: true, commentCount: true, viewCount: true, publishedAt: true,
                category: { select: { slug: true, name: true } },
                user: { select: apiAuthorSelect },
                tags: { select: { name: true } },
              },
            });

            const data = builds.map((b) => ({
              slug: b.slug,
              title: b.title,
              description: b.description,
              thumbnailUrl: b.thumbnailUrl,
              author: serializeAuthor(b.user),
              technologies: b.technologies,
              tags: b.tags.map((t) => t.name),
              category: b.category,
              price: b.price,
              metrics: { likes: b.likeCount, comments: b.commentCount, views: b.viewCount },
              publishedAt: b.publishedAt,
            }));
            const nextCursor = builds.length === limit && builds[builds.length - 1].publishedAt ? builds[builds.length - 1].publishedAt!.toISOString() : null;
            return json({ data, nextCursor });
          },
          { scope: 'read:builds' }
        ),
    },
  },
});
