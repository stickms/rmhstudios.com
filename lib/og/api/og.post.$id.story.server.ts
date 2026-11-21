import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { renderPostStoryImage } from '@/lib/og/post-story.server';
import { postCardContentWarning, postCardShowsContent } from '@/lib/og/post-visibility';
import { contentWarningNotice } from '@/lib/feed/content-warning';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';

/**
 * GET /api/og/post/$id/story — vertical 1080×1920 "share to Stories" image (PNG)
 * for a post. Only free, public, live posts render their content; anything else
 * gets a generic branded card so private/paid content never leaks.
 */
export const route = apiRoute('/api/og/post/$id/story', {
  GET: defineHandler({ auth: 'none' }, async ({ params }) => {
    const post = await prisma.rMHark.findUnique({
      where: { id: params.id },
      select: {
        content: true,
        deletedAt: true,
        audience: true,
        unlockPrice: true,
        isSensitive: true,
        contentWarning: true,
        community: { select: { isPrivate: true } },
        // The display shape, so the story card names the author the same
        // way every other surface does (see @/lib/user-display).
        user: { select: userDisplaySelect },
      },
    });

    const showContent = postCardShowsContent(post);
    // The reason stands in for the text of a warned post (sprint 06 #16).
    const warning = postCardContentWarning(post);
    const author = post?.user ? resolveUser(post.user) : null;

    const png = await renderPostStoryImage({
      id: params.id,
      content: showContent ? (post?.content ?? '') : warning ? contentWarningNotice(warning) : '',
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
});
