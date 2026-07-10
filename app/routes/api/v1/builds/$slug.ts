import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, serializeAuthor } from '@/lib/api/serializers.server';

/** GET /api/v1/builds/{slug} — a single public build, including its readme. */
export const Route = createFileRoute('/api/v1/builds/$slug')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const build = await prisma.userBuild.findUnique({
              where: { slug: params.slug },
              select: {
                slug: true, title: true, description: true, readme: true, repoUrl: true, demoUrl: true, thumbnailUrl: true,
                technologies: true, price: true, visibility: true, likeCount: true, commentCount: true, viewCount: true,
                createdAt: true, publishedAt: true,
                category: { select: { slug: true, name: true } },
                user: { select: apiAuthorSelect },
                tags: { select: { name: true } },
                versions: { orderBy: { createdAt: 'desc' }, take: 20, select: { version: true, changelog: true, createdAt: true } },
              },
            });
            if (!build || build.visibility !== 'PUBLIC') return error('not_found', 'Build not found.', 404);

            return json({
              slug: build.slug,
              title: build.title,
              description: build.description,
              readme: build.readme,
              repoUrl: build.repoUrl,
              demoUrl: build.demoUrl,
              thumbnailUrl: build.thumbnailUrl,
              author: serializeAuthor(build.user),
              technologies: build.technologies,
              tags: build.tags.map((t) => t.name),
              category: build.category,
              price: build.price,
              metrics: { likes: build.likeCount, comments: build.commentCount, views: build.viewCount },
              versions: build.versions,
              createdAt: build.createdAt,
              publishedAt: build.publishedAt,
            });
          },
          { scope: 'read:builds' }
        ),
    },
  },
});
