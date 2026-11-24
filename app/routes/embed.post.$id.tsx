/**
 * Embeddable post widget (#26).
 *
 * A chrome-free, iframe-friendly rendering of a single public post for embedding
 * on external sites. Top-level route (outside _site) so it carries no sidebars
 * or app navigation. Only public, non-deleted, free posts are embeddable; other
 * states render a neutral fallback so private/paid content never leaks.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { useGifAlt } from '@/components/feed/use-gif-alt';
import { CoveredLine } from '@/components/feed/CoveredLine';
import { contentWarningOrNull } from '@/lib/feed/content-warning';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { nullPostCounts } from '@/lib/feed/quiet-counts';
import { ExternalLink, Heart, MessageCircle, Repeat } from 'lucide-react';

const fetchEmbed = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const post = await prisma.rMHark.findUnique({
      where: { id },
      select: {
        id: true,
        content: true,
        createdAt: true,
        deletedAt: true,
        audience: true,
        unlockPrice: true,
        community: { select: { isPrivate: true } },
        likeCount: true,
        commentCount: true,
        repostCount: true,
        imageUrls: true,
        imageAlts: true,
        gifUrl: true,
        gifAlt: true,
        isSensitive: true,
        contentWarning: true,
        user: { select: userDisplaySelect },
      },
    });

    if (
      !post ||
      post.deletedAt || post.audience !== 'PUBLIC' ||
      post.community?.isPrivate ||
      (post.unlockPrice ?? 0) > 0
    ) {
      return null;
    }
    const user = resolveUser(post.user as any);
    // An embed has no viewer: an author who hides their counts gets an embed without them (lib/feed/quiet-counts).
    const counts = {
      likeCount: post.likeCount as number | null,
      commentCount: post.commentCount as number | null,
      repostCount: post.repostCount as number | null,
    };
    // An embed has no way to reveal a post, so a content warning reason stands in for the text and media (sprint 06 #16).
    const reason = contentWarningOrNull(post.contentWarning);
    return {
      id: post.id,
      content: reason ? '' : post.content,
      contentWarning: reason,
      createdAt: post.createdAt.toISOString(),
      ...(user.hideCounts ? nullPostCounts(counts) : counts),
      imageUrl: reason ? null : (post.imageUrls?.[0] ?? null),
      imageAlt: reason ? null : (post.imageAlts?.[0]?.trim() || null),
      // The GIF (sprint 06 #15) with its description; a sensitive post's GIF stays out of an embed.
      gifUrl: post.isSensitive || reason ? null : (post.gifUrl ?? null),
      gifAlt: post.isSensitive || reason ? null : (post.gifAlt?.trim() || null),
      user: { name: user.name, handle: user.handle, image: user.image, id: user.id },
    };
  });

export const Route = createFileRoute('/embed/post/$id')({
  loader: async ({ params }) => ({ post: await fetchEmbed({ data: params.id }) }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: EmbedPost,
});

function EmbedPost() {
  const { t } = useTranslation("pages");
  const { post } = Route.useLoaderData();
  const gifAltText = useGifAlt();
  const profileHref = post ? `https://rmhstudios.com/u/${post.user.handle || post.user.id}` : '#';
  const postHref = post ? `https://rmhstudios.com/u/${post.user.handle || post.user.id}/post/${post.id}` : '#';

  if (!post) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-site-bg p-4">
        <div className="px-5 py-4 text-sm text-site-text-muted">
          {t("post-not-embeddable", { defaultValue: "This post isn’t available to embed." })}
        </div>
      </main>
    );
  }

  return (
    <main className="bg-site-bg p-3">
      <article className="mx-auto max-w-xl p-4">
        <div className="flex items-center gap-3">
          {post.user.image ? (
            <img src={post.user.image} alt="" className="size-11 rounded-full object-cover" />
          ) : (
            <div className="flex size-11 items-center justify-center rounded-full bg-site-surface text-site-accent font-bold">
              {(post.user.name || post.user.handle || 'R')[0]?.toUpperCase()}
            </div>
          )}
          <a href={profileHref} target="_blank" rel="noopener noreferrer" className="min-w-0">
            <p className="truncate text-sm font-bold text-site-text">{post.user.name || t("anonymous-user", { defaultValue: "Someone" })}</p>
            {post.user.handle && <p className="truncate text-xs text-site-text-muted">@{post.user.handle}</p>}
          </a>
        </div>

        {post.contentWarning && (
          <CoveredLine reason={post.contentWarning} className="mt-3 whitespace-pre-wrap break-words text-base text-site-text" />
        )}
        {post.content && (
          <p className="mt-3 whitespace-pre-wrap break-words text-base text-site-text">{post.content}</p>
        )}
        {post.imageUrl && (
          <img src={post.imageUrl} alt={post.imageAlt ?? ''} className="mt-3 max-h-80 w-full rounded-site-sm object-cover" />
        )}
        {!post.imageUrl && post.gifUrl && (
          <img src={post.gifUrl} alt={gifAltText(post.gifAlt)} className="mt-3 max-h-80 w-full rounded-site-sm object-cover" />
        )}

        <div className="mt-3 flex items-center gap-4 text-xs text-site-text-muted">
          {post.likeCount !== null && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Heart className="size-3.5" aria-hidden /> {post.likeCount}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Repeat className="size-3.5" aria-hidden /> {post.repostCount}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="size-3.5" aria-hidden /> {post.commentCount}
              </span>
            </>
          )}
          <a
            href={postHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 font-semibold text-site-accent hover:underline"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {t('post-view-on-rmh', { defaultValue: 'View on RMH Studios' })}
          </a>
        </div>
      </article>
    </main>
  );
}
