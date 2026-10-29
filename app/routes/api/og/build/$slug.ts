import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getPublicBuildDetail } from '@/lib/user-builds-detail.server';
import { renderPageCard } from '@/lib/og/page-card.server';
import { truncate } from '@/lib/og/shared.server';

/**
 * GET /api/og/build/$slug — the Open Graph card for a User Build.
 *
 * A build used to unfurl as its raw thumbnail, or — with none, which is most of them — as the site's home card. The
 * card puts the thumbnail in the page's frame beside the title, the author and the figures, and exists for a build
 * that has no thumbnail at all.
 *
 * Reads the same anonymous projection the page's own loader does (`getPublicBuildDetail`): a private build is a 404
 * here exactly as it is on the page, and a paid build shows only what its page shows a signed-out visitor — title,
 * description, thumbnail — never its readme, repository or demo.
 */
export const Route = createFileRoute('/api/og/build/$slug')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const build = await getPublicBuildDetail(params.slug);
        if (!build) return new Response('Not found', { status: 404 });

        const png = await renderPageCard({
          // Likes move; bucketing keeps a busy build from re-rendering on every one.
          cacheKey: `build:${build.id}:${build.updatedAt}:${Math.floor(build.likeCount / 5)}:${build.price}`,
          eyebrow: 'User build',
          lead: build.category?.name ?? null,
          title: build.title,
          // Short enough that the author line keeps its room beneath the thumbnail's column.
          subtitle: truncate(build.description, 96),
          art: build.thumbnailUrl,
          byline: build.user?.name
            ? { name: build.user.name, handle: build.user.handle ?? null, image: build.user.image ?? null }
            : null,
          path: `/user-builds/${build.slug}`,
          stats: [
            build.price > 0
              ? { value: String(build.price), label: 'coins', lead: true }
              : { value: 'Free', label: 'to try', lead: true },
            ...(build.likeCount > 0
              ? [{ value: String(build.likeCount), label: build.likeCount === 1 ? 'like' : 'likes' }]
              : []),
            ...(build.viewCount > 0
              ? [{ value: String(build.viewCount), label: build.viewCount === 1 ? 'view' : 'views' }]
              : []),
          ],
        });

        return new Response(new Uint8Array(png), {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          },
        });
      }),
    },
  },
});
