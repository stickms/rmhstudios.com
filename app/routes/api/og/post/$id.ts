import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { renderPostOgImage } from '@/lib/og/post-image.server';
import { postCardShowsContent } from '@/lib/og/post-visibility';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';

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
            createdAt: true,
            updatedAt: true,
            likeCount: true,
            commentCount: true,
            repostCount: true,
            // The display shape, not the raw columns: an author who set a
            // custom name or avatar has one everywhere else on the site, and a
            // card is not the place they revert to their OAuth identity.
            user: { select: userDisplaySelect },
            poll: {
              select: {
                question: true,
                options: { select: { text: true }, orderBy: { position: 'asc' } },
              },
            },
            community: { select: { name: true } },
            // The quoted post, for a quote-repost. Selected with its own
            // visibility columns because it is a different post with a
            // different audience — quoting something does not republish it.
            original: {
              select: {
                content: true,
                isSensitive: true,
                deletedAt: true,
                audience: true,
                unlockPrice: true,
                user: { select: userDisplaySelect },
              },
            },
          },
        });

        const author = post?.user ? resolveUser(post.user) : null;
        const quoted = post?.original?.user ? resolveUser(post.original.user) : null;

        // Only public, visible, free, unflagged posts get a content card;
        // otherwise a generic branded card, so nothing private, paid or
        // content-warned leaks into a preview. The gate covers the text, the
        // poll AND the attachments — see lib/og/post-visibility.ts.
        const showContent = postCardShowsContent(post);
        const showQuote = showContent && postCardShowsContent(post?.original);

        const png = await renderPostOgImage({
          id: params.id,
          // Re-render on edit (and the moment a content warning is applied)
          // rather than when the ten-minute PNG cache happens to expire.
          revision: `${post?.updatedAt?.getTime() ?? 0}:${showContent ? 1 : 0}`,
          content: showContent ? (post?.content ?? '') : '',
          authorName: author?.name ?? 'RMH Studios',
          authorHandle: author?.handle ?? null,
          authorImage: author?.image ?? null,
          authorVerified: author?.isVerified ?? false,
          createdAt: post?.createdAt ?? null,
          likeCount: post?.likeCount ?? 0,
          commentCount: post?.commentCount ?? 0,
          repostCount: post?.repostCount ?? 0,
          // The pictures themselves, not a sentence about them. Suppressed with
          // the text for anything that isn't public and free.
          images: showContent ? (post?.imageUrls ?? []) : [],
          gifUrl: showContent ? (post?.gifUrl ?? null) : null,
          pollQuestion: showContent ? (post?.poll?.question ?? null) : null,
          pollOptions: showContent ? (post?.poll?.options.map((o) => o.text) ?? []) : [],
          community: post?.community?.name ?? null,
          quote:
            showQuote && post?.original
              ? {
                  authorName: quoted?.name ?? 'Someone',
                  authorHandle: quoted?.handle ?? null,
                  content: post.original.content ?? '',
                }
              : null,
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
