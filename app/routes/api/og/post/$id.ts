import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { renderPostOgImage } from '@/lib/og/post-image.server';

/** GET /api/og/post/$id — dynamic Open Graph card image (PNG) for a post. */
export const Route = createFileRoute('/api/og/post/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ params }) => {
        const post = await prisma.rMHark.findUnique({
          where: { id: params.id },
          select: {
            id: true,
            content: true,
            gifUrl: true,
            imageUrls: true,
            isSensitive: true,
            deletedAt: true,
            audience: true,
            unlockPrice: true,
            likeCount: true,
            commentCount: true,
            repostCount: true,
            user: { select: { name: true, handle: true, image: true } },
            poll: { select: { question: true, _count: { select: { options: true } } } },
            community: { select: { name: true } },
          },
        });

        // Only public, visible, free posts get a content card; otherwise a
        // generic branded card (no private/paid content leaks into previews).
        // A content warning is treated the same way: whatever it was set on the
        // post to hide, an unfurl is exactly the surface that would leak it.
        const hideContent =
          !post ||
          post.deletedAt ||
          post.audience !== 'PUBLIC' ||
          (post.unlockPrice ?? 0) > 0 ||
          post.isSensitive;

        const png = await renderPostOgImage({
          id: params.id,
          content: hideContent ? '' : (post?.content ?? ''),
          authorName: post?.user?.name ?? 'RMH Studios',
          authorHandle: post?.user?.handle ?? null,
          authorImage: post?.user?.image ?? null,
          likeCount: post?.likeCount ?? 0,
          commentCount: post?.commentCount ?? 0,
          repostCount: post?.repostCount ?? 0,
          // What the post carries, so the card says "2 photos" / "Poll · 4
          // options" instead of looking like a bare one-liner. Suppressed with
          // the text for anything that isn't public and free.
          imageCount: hideContent ? 0 : (post?.imageUrls?.length ?? 0),
          hasGif: hideContent ? false : Boolean(post?.gifUrl),
          pollQuestion: hideContent ? null : (post?.poll?.question ?? null),
          pollOptionCount: hideContent ? 0 : (post?.poll?._count.options ?? 0),
          community: post?.community?.name ?? null,
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
