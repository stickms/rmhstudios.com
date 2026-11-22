import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { RELEASES_PAGE } from '@/lib/builds/releases';
import { apiAuthorSelect, serializeAuthor } from '@/lib/api/serializers.server';

/** GET /api/v1/builds/{slug} — a single public build, including its readme and its latest releases (newest first). */
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
                slug: true, title: true, description: true, readme: true, repoUrl: true, demoUrl: true, thumbnailUrl: true, thumbnailAlt: true,
                technologies: true, price: true, visibility: true, likeCount: true, commentCount: true, viewCount: true,
                createdAt: true, publishedAt: true,
                category: { select: { slug: true, name: true } },
                user: { select: apiAuthorSelect },
                tags: { select: { name: true } },
                screenshots: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { url: true, width: true, height: true, description: true } },
                versions: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: RELEASES_PAGE, select: { version: true, changelog: true, commitHash: true, createdAt: true } },
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
              thumbnailAlt: build.thumbnailAlt,
              screenshots: build.screenshots,
              author: serializeAuthor(build.user),
              technologies: build.technologies,
              tags: build.tags.map((t) => t.name),
              category: build.category,
              price: build.price,
              metrics: { likes: build.likeCount, comments: build.commentCount, views: build.viewCount },
              // Deprecated: the old shape, kept so existing clients keep working. Use `releases`.
              versions: build.versions.map(({ version, changelog, createdAt }) => ({ version, changelog, createdAt })),
              releases: build.versions,
              createdAt: build.createdAt,
              publishedAt: build.publishedAt,
            });
          },
          { scope: 'read:builds' }
        ),
    },
  },
});
