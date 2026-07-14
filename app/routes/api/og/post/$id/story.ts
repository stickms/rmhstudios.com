import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { renderPostStoryImage } from '@/lib/og/post-story.server';

/**
 * GET /api/og/post/$id/story — vertical 1080×1920 "share to Stories" image (PNG)
 * for a post. Only free, public, live posts render their content; anything else
 * gets a generic branded card so private/paid content never leaks.
 */
export const Route = createFileRoute('/api/og/post/$id/story')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const post = await prisma.rMHark.findUnique({
            where: { id: params.id },
            select: {
              content: true,
              deletedAt: true,
              audience: true,
              unlockPrice: true,
              isSensitive: true,
              user: { select: { name: true, handle: true, image: true } },
            },
          });

          const hideContent =
            !post ||
            post.deletedAt ||
            post.audience !== 'PUBLIC' ||
            (post.unlockPrice ?? 0) > 0 ||
            post.isSensitive;

          const png = await renderPostStoryImage({
            id: params.id,
            content: hideContent ? '' : post?.content ?? '',
            authorName: post?.user?.name ?? 'RMH Studios',
            authorHandle: post?.user?.handle ?? null,
            authorImage: post?.user?.image ?? null,
          });

          return new Response(new Uint8Array(png), {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=600, s-maxage=600',
            },
          });
        } catch (error) {
          console.error('Story image error:', error);
          return new Response('Failed to render image', { status: 500 });
        }
      },
    },
  },
});
