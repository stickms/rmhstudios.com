import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { renderPostStoryImage } from '@/lib/og/post-story.server';
import { postCardShowsContent } from '@/lib/og/post-visibility';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';

/**
 * GET /api/og/post/$id/story — vertical 1080×1920 "share to Stories" image (PNG)
 * for a post. Only free, public, live posts render their content; anything else
 * gets a generic branded card so private/paid content never leaks.
 */
export const Route = createFileRoute('/api/og/post/$id/story')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const post = await prisma.rMHark.findUnique({
          where: { id: params.id },
          select: {
            content: true,
            deletedAt: true,
            audience: true,
            unlockPrice: true,
            isSensitive: true,
            // The display shape, so the story card names the author the same
            // way every other surface does (see @/lib/user-display).
            user: { select: userDisplaySelect },
          },
        });

        const showContent = postCardShowsContent(post);
        const author = post?.user ? resolveUser(post.user) : null;

        const png = await renderPostStoryImage({
          id: params.id,
          content: showContent ? (post?.content ?? '') : '',
          authorName: author?.name ?? 'RMH Studios',
          authorHandle: author?.handle ?? null,
          authorImage: author?.image ?? null,
        });

        return new Response(new Uint8Array(png), {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
          },
        });
      }),
    },
  },
});
