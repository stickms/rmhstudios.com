import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { renderPostOgImage } from '@/lib/og/post-image.server';

/** GET /api/og/post/$id — dynamic Open Graph card image (PNG) for a post. */
export const Route = createFileRoute('/api/og/post/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const post = await prisma.rMHark.findUnique({
            where: { id: params.id },
            select: {
              id: true,
              content: true,
              deletedAt: true,
              audience: true,
              unlockPrice: true,
              likeCount: true,
              commentCount: true,
              repostCount: true,
              user: { select: { name: true, handle: true, image: true } },
            },
          });

          // Only public, visible, free posts get a content card; otherwise a
          // generic branded card (no private/paid content leaks into previews).
          const hideContent =
            !post || post.deletedAt || post.audience !== 'PUBLIC' || (post.unlockPrice ?? 0) > 0;

          const png = await renderPostOgImage({
            id: params.id,
            content: hideContent ? '' : (post?.content ?? ''),
            authorName: post?.user?.name ?? 'RMH Studios',
            authorHandle: post?.user?.handle ?? null,
            authorImage: post?.user?.image ?? null,
            likeCount: post?.likeCount ?? 0,
            commentCount: post?.commentCount ?? 0,
            repostCount: post?.repostCount ?? 0,
          });

          return new Response(new Uint8Array(png), {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
            },
          });
        } catch (error) {
          console.error('OG image error:', error);
          return new Response('Failed to render image', { status: 500 });
        }
      },
    },
  },
});
