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
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
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
    return {
      id: post.id,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      repostCount: post.repostCount,
      imageUrl: post.imageUrls?.[0] ?? null,
      imageAlt: post.imageAlts?.[0]?.trim() || null,
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
  const profileHref = post ? `https://rmhstudios.com/u/${post.user.handle || post.user.id}` : '#';
  const postHref = post ? `https://rmhstudios.com/u/${post.user.handle || post.user.id}/post/${post.id}` : '#';

  if (!post) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-site-bg p-4">
        <div className="glass-fill px-5 py-4 text-sm text-site-text-muted">
          {t("post-not-embeddable", { defaultValue: "This post isn’t available to embed." })}
        </div>
      </main>
    );
  }

  return (
    <main className="bg-site-bg p-3">
      <article className="glass-fill mx-auto max-w-xl p-4">
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
            {post.user.handle && <p className="truncate text-xs text-site-text-dim">@{post.user.handle}</p>}
          </a>
        </div>

        {post.content && (
          <p className="mt-3 whitespace-pre-wrap break-words text-base text-site-text">{post.content}</p>
        )}
        {post.imageUrl && (
          <img src={post.imageUrl} alt={post.imageAlt ?? ''} className="mt-3 max-h-80 w-full rounded-site-sm object-cover" />
        )}

        <div className="mt-3 flex items-center gap-4 text-xs text-site-text-dim">
          <span className="inline-flex items-center gap-1.5">
            <Heart className="size-3.5" aria-hidden /> {post.likeCount}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Repeat className="size-3.5" aria-hidden /> {post.repostCount}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle className="size-3.5" aria-hidden /> {post.commentCount}
          </span>
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
