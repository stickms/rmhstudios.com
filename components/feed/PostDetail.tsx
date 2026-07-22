'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { RMHarkOverflowMenu } from './RMHarkOverflowMenu';
import { useLocaleStore } from '@/stores/localeStore';
import { LOCALE_TO_LANGUAGE_NAME } from '@/lib/i18n/config';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser } from '@/components/Providers';
import { useFreshUser, useUserDisplayStore } from '@/stores/userDisplayStore';
import { useFeedStore } from '@/stores/feedStore';
import { RMHarkActions } from './RMHarkActions';
import { CommentItem } from './CommentItem';
import { AIGenerateButton } from './AIGenerateButton';
import { MentionTextarea } from './MentionTextarea';
import type { Comment } from './CommentItem';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-schema';
import { Link, useNavigate } from '@tanstack/react-router';
import type { FeedItem } from '@/lib/feed-types';
import { RMHarkContent, extractFirstUrl } from './RMHarkContent';
import { PollDisplay } from './PollDisplay';
import { GifEmbed } from './GifEmbed';
import { PostImageGrid } from './PostImageGrid';
import { SensitiveMedia } from './SensitiveMedia';
import { postMediaVTName, liquidVTName } from '@/lib/view-transition';
import { m as motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { LinkPreview } from './LinkPreview';
import { UserAvatar } from './UserAvatar';
import { ThreadSummary } from './ThreadSummary';
import { RelatedPosts } from './RelatedPosts';

interface PostDetailProps {
  postId: string;
}

export function PostDetail({ postId }: PostDetailProps) {
  const { t } = useTranslation("feed");
  const navigate = useNavigate();
  const locale = useLocaleStore((s) => s.locale);
  const [post, setPost] = useState<FeedItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data: session } = authClient.useSession();
  const { resolved: resolvedUser } = useResolvedUser();
  const remaining = MAX_COMMENT_LENGTH - commentContent.length;
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);

  // Keep the shared feed store in sync with engagement that happens here, so
  // navigating back to the feed reflects the new counts instead of stale ones.
  const syncToFeed = useCallback((updates: Partial<FeedItem>) => {
    const store = useFeedStore.getState();
    if (store.items.some((i) => i.id === postId)) {
      store.updateItem(postId, updates);
    }
  }, [postId]);

  const bumpFeedComment = useCallback((delta: number) => {
    const store = useFeedStore.getState();
    const current = store.items.find((i) => i.id === postId);
    if (current) {
      store.updateItem(postId, {
        commentCount: Math.max(0, (current.commentCount ?? 0) + delta),
      });
    }
  }, [postId]);

  const linkPreviewUrl = useMemo(() => {
    if (!post || post.poll || post.gifUrl || (post.imageUrls && post.imageUrls.length > 0) || !post.content) return null;
    return extractFirstUrl(post.content);
  }, [post]);

  const isAuthor = session?.user?.id === post?.user?.id;
  const freshPostUser = useFreshUser(post?.user);
  const freshOriginalUser = useFreshUser(post?.original?.user);

  // Drop any cached translation when the site language changes, so the next
  // "Translate" re-translates into the newly selected language.
  useEffect(() => {
    setTranslatedText(null);
    setShowTranslated(false);
  }, [locale]);

  const handleTranslate = async () => {
    if (translatedText) {
      setShowTranslated((s) => !s);
      return;
    }
    setTranslating(true);
    try {
      const res = await fetch(
        `/api/rmharks/${postId}/translate?to=${encodeURIComponent(LOCALE_TO_LANGUAGE_NAME[locale])}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        toast.error(t('translate-error', { defaultValue: 'Could not translate this post.' }));
        return;
      }
      const data = await res.json();
      if (data.text) {
        setTranslatedText(data.text);
        setShowTranslated(true);
      }
    } finally {
      setTranslating(false);
    }
  };

  // Fetch post
  useEffect(() => {
    setLoading(true);
    fetch(`/api/rmharks/${postId}`)
      .then(async (res) => {
        if (res.status === 404) { setNotFound(true); return; }
        const data = await res.json();
        // Update user display cache
        const users = [];
        if (data.user) users.push(data.user);
        if (data.repostedBy) users.push(data.repostedBy);
        if (data.original?.user) users.push(data.original.user);
        if (users.length > 0) useUserDisplayStore.getState().setUsers(users);
        setPost(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [postId]);

  // Fetch comments
  useEffect(() => {
    setLoadingComments(true);
    fetch(`/api/rmharks/${postId}/comment`)
      .then((res) => res.json())
      .then((data) => setComments(data))
      .catch(console.error)
      .finally(() => setLoadingComments(false));
  }, [postId]);

  const handleSubmit = async () => {
    if (!commentContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rmharks/${postId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentContent.trim() }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => [comment, ...prev]);
        setCommentContent('');
        setPost((prev) => prev ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 } : prev);
        bumpFeedComment(1);
      } else {
        // Surfaces the reply-control 403 ("The author limited who can reply…").
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t('comment-failed', { defaultValue: 'Could not post your reply' }));
      }
    } catch (error) {
      console.error('Comment error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplyAdded = useCallback((parentId: string, reply: Comment) => {
    const addReplyDeep = (comments: Comment[]): Comment[] =>
      comments.map((c) => {
        if (c.id === parentId) {
          return { ...c, replies: [...(c.replies ?? []), reply] };
        }
        if (c.replies?.length) {
          return { ...c, replies: addReplyDeep(c.replies) };
        }
        return c;
      });
    setComments((prev) => addReplyDeep(prev));
    setPost((prev) => prev ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 } : prev);
    bumpFeedComment(1);
  }, [bumpFeedComment]);

  const handleCommentRemoved = useCallback((commentId: string) => {
    const removeDeep = (comments: Comment[]): Comment[] =>
      comments
        .filter((c) => c.id !== commentId)
        .map((c) => c.replies?.length ? { ...c, replies: removeDeep(c.replies) } : c);
    setComments((prev) => removeDeep(prev));
    setPost((prev) => prev ? { ...prev, commentCount: Math.max(0, (prev.commentCount ?? 0) - 1) } : prev);
    bumpFeedComment(-1);
  }, [bumpFeedComment]);

  const formatFullDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={32} />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <p className="text-lg font-medium text-site-text mb-1">{t("post-not-found", { defaultValue: "Post not found" })}</p>
        <p className="text-sm text-site-text-muted mb-4">{t("post-not-found-detail", { defaultValue: "This post doesn't exist or was deleted." })}</p>
        <Link to="/"><Button variant="accent" size="sm">{t("go-home", { defaultValue: "Go Home" })}</Button></Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header bar */}
      <div className="sticky top-2 z-10 mx-2 rounded-site glass-chrome shadow-site-sm md:top-3 md:mx-3">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => window.history.back()}
            className="p-1.5 -ml-1.5 rounded-site-sm hover:bg-site-surface transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-site-text" />
          </button>
          <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text">
            {t("post-header", { defaultValue: "Post" })}
          </h1>
        </div>
      </div>

      {/* Post content (expanded) — the liquid-open hero the feed card morphs into
          (§5.48). The name is static here (one post per detail page → unique).
          §16.3.4: `mt-3` gives the standard capsule-to-first-content gutter below
          the "← Post" header capsule (§15.4 rhythm — it was flush before). */}
      <div
        className="relative mt-3 px-4 pt-4 pb-3 border-b border-site-border"
        style={{ viewTransitionName: liquidVTName('post', postId) }}
      >

        {/* More menu — top right (shared with the feed card so features match) */}
        {!post.deletedAt && (
          <div className="absolute top-4 right-4 z-20">
            <RMHarkOverflowMenu
              item={post}
              isAuthor={isAuthor}
              onUpdate={(updates) => {
                setPost((prev) => (prev ? { ...prev, ...updates } : prev));
                syncToFeed(updates);
              }}
              onRemove={() => navigate({ to: '/' })}
              translate={{
                translating,
                hasTranslation: translatedText !== null,
                showing: showTranslated,
                onToggle: handleTranslate,
              }}
            />
          </div>
        )}

        {/* User header */}
        <div className="flex items-center gap-3 mb-3 pr-8">
          <UserAvatar user={freshPostUser} size="lg" />
          <div>
            <Link to={`/u/${freshPostUser?.handle || freshPostUser?.id}` as string} className="hover:underline">
              <span className="font-bold text-site-text">{freshPostUser?.name || t("unknown-user", { defaultValue: "Unknown" })}</span>
            </Link>
            {freshPostUser?.handle && (
              <p className="text-sm text-site-text-dim">@{freshPostUser.handle}</p>
            )}
          </div>
        </div>

        {/* Content - larger text for detail view */}
        {post.content && (
          <RMHarkContent text={post.content} className="text-site-text text-[17px] leading-relaxed whitespace-pre-wrap break-words mb-3" />
        )}

        {/* Translation (toggled from the overflow menu) */}
        {showTranslated && translatedText && (
          <div className="mb-3 rounded-site border border-site-border bg-site-surface/40 p-3 text-[15px] leading-relaxed text-site-text whitespace-pre-wrap break-words">
            {translatedText}
          </div>
        )}

        {/* Poll */}
        {post.poll && (
          <div className="mb-3">
            <PollDisplay
              poll={post.poll}
              postId={postId}
              onUpdate={(updatedPoll) => setPost((prev) => prev ? { ...prev, poll: updatedPoll } : prev)}
            />
          </div>
        )}

        {/* Image / GIF — hidden behind a content warning when marked sensitive */}
        {(post.gifUrl || (post.imageUrls && post.imageUrls.length > 0)) && (
          <SensitiveMedia sensitive={post.isSensitive} className="mb-3">
            {post.gifUrl && <GifEmbed url={post.gifUrl} className="mb-1" />}
            {post.imageUrls && post.imageUrls.length > 0 && (
              <PostImageGrid urls={post.imageUrls} alts={post.imageAlts} heroName={postMediaVTName(postId)} />
            )}
          </SensitiveMedia>
        )}

        {/* Link preview — only when no poll, gif, or image */}
        {linkPreviewUrl && <LinkPreview url={linkPreviewUrl} className="mb-3" />}

        {/* Quoted original */}
        {post.original && (
          <div className="mb-3 border border-site-border rounded-site p-3 bg-site-surface/30">
            <div className="flex items-center gap-1.5 text-sm mb-1">
              {freshOriginalUser ? (
                <Link to={`/u/${freshOriginalUser.handle || freshOriginalUser.id}` as string} className="flex items-center gap-1.5 min-w-0 hover:underline">
                  <span className="font-bold text-site-text truncate">{freshOriginalUser.name || t("unknown-user", { defaultValue: "Unknown" })}</span>
                  {freshOriginalUser.handle && (
                    <span className="text-site-text-dim truncate">@{freshOriginalUser.handle}</span>
                  )}
                </Link>
              ) : (
                <span className="font-bold text-site-text truncate">{t("unknown-user", { defaultValue: "Unknown" })}</span>
              )}
            </div>
            <RMHarkContent text={post.original.content ?? ''} className="text-site-text text-sm whitespace-pre-wrap break-words" />
          </div>
        )}

        {/* Full timestamp */}
        <p className="text-sm text-site-text-dim mb-3">{formatFullDate(post.createdAt)}</p>

        {/* Engagement stats bar */}
        {!post.deletedAt && <div className="flex items-center gap-4 py-3 border-t border-site-border text-sm">
          <span>
            <AnimatedCount value={post.repostCount ?? 0} format={(n) => n.toLocaleString()} className="font-bold text-site-text" />{' '}
            <span className="text-site-text-dim">{t("rermharks", { defaultValue: "reRMHarks" })}</span>
          </span>
          <span>
            <AnimatedCount value={post.likeCount ?? 0} format={(n) => n.toLocaleString()} className="font-bold text-site-text" />{' '}
            <span className="text-site-text-dim">{t("likes", { defaultValue: "Likes" })}</span>
          </span>
          <span>
            <AnimatedCount value={post.viewCount ?? 0} format={(n) => n.toLocaleString()} className="font-bold text-site-text" />{' '}
            <span className="text-site-text-dim">{t("views", { defaultValue: "Views" })}</span>
          </span>
        </div>}

        {/* Actions */}
        {!post.deletedAt && (
          <div className="border-t border-site-border pt-1">
            <RMHarkActions
              item={post}
              onUpdate={(_, updates) => {
                setPost((prev) => prev ? { ...prev, ...updates } : prev);
                syncToFeed(updates);
              }}
            />
          </div>
        )}
      </div>

      {/* Deleted notice */}
      {post.deletedAt && (
        <div className="px-4 py-4 border-b border-site-border">
          <p className="text-sm text-site-text-dim text-center">
            {post.deletedByAdmin
              ? t("deleted-by-admin", { defaultValue: "This RMHark was deleted by an admin." })
              : t("deleted-by-user", { defaultValue: "This RMHark was deleted by the user." })}
          </p>
        </div>
      )}

      {/* Comment compose */}
      {!post.deletedAt && session ? (
        <div className="px-4 py-3 border-b border-site-border">
          {post.replyControl && post.replyControl !== 'EVERYONE' && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-site-text-muted">
              <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {post.replyControl === 'FOLLOWING'
                ? t('reply-limited-following', { defaultValue: 'Accounts the author follows can reply' })
                : t('reply-limited-mentioned', { defaultValue: 'Only accounts the author mentioned can reply' })}
            </p>
          )}
          <div className="flex gap-3">
            {/* User avatar */}
            <UserAvatar
              user={{
                id: session.user!.id,
                name: resolvedUser?.name || session.user?.name,
                image: resolvedUser?.image || session.user?.image,
              }}
              size="sm"
              linkToProfile={false}
            />
            <div className="flex-1 min-w-0">
              <MentionTextarea
                id="post-comment-input"
                value={commentContent}
                onChange={setCommentContent}
                placeholder={t("reply-placeholder", { defaultValue: "Post your reply..." })}
                rows={2}
                maxLength={MAX_COMMENT_LENGTH}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-site p-3 border border-site-border resize-none outline-none focus:border-site-accent transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmit();
                  }
                }}
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs font-mono ${remaining <= 20 ? 'text-site-warning' : 'text-site-text-dim'}`}>
                  {remaining}
                </span>
                <div className="flex items-center gap-1.5">
                  <AIGenerateButton
                    request={{ mode: 'reply', rmharkId: postId, draft: commentContent }}
                    onGenerated={(text) => setCommentContent(text)}
                    size="sm"
                    title={t("ai-generate-title", { defaultValue: "Generate a reply with AI" })}
                  />
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={!commentContent.trim() || remaining < 0 || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? t("posting", { defaultValue: "Posting..." }) : t("reply", { defaultValue: "Reply" })}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : !post.deletedAt ? (
        <div className="px-4 py-3 border-b border-site-border text-center text-sm text-site-text-dim">
          {t("sign-in-to-reply", { defaultValue: "Sign in to reply" })}
        </div>
      ) : null}

      {/* Comments list */}
      {!post.deletedAt && <div className="px-4">
        {!loadingComments && comments.length > 0 && (
          <ThreadSummary postId={postId} commentCount={comments.length} />
        )}
        {loadingComments ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-center text-sm text-site-text-dim py-8">
            {t("no-replies", { defaultValue: "No replies yet. Be the first!" })}
          </p>
        ) : (
          // §16.3.5 — one entrance per navigation. The post body is fetched
          // CLIENT-side (the route loader only has meta+sidebar), so the column
          // enters ONCE via `page-enter`/the liquid-open morph while a spinner
          // shows, THEN the replies arrive a beat later. Re-staggering them here
          // was a second, jarring entrance wave on the SAME navigation (the
          // owner's "double load animation"). `initial={false}` mounts the
          // replies already-settled — the page/morph is the single entrance;
          // reduced motion collapsed this anyway.
          <motion.div
            className="divide-y divide-site-border"
            variants={staggerContainer(0.03)}
            initial={false}
            animate="animate"
          >
            {comments.map((comment, i) => {
              const node = (
                <CommentItem
                  comment={comment}
                  postId={postId}
                  sessionUser={session?.user ? { ...session.user, image: resolvedUser?.image || session.user.image, name: resolvedUser?.name || session.user.name } : undefined}
                  onReplyAdded={handleReplyAdded}
                  onCommentRemoved={handleCommentRemoved}
                />
              );
              return i < 8 ? (
                <motion.div key={comment.id} variants={staggerItem}>
                  {node}
                </motion.div>
              ) : (
                <div key={comment.id}>{node}</div>
              );
            })}
          </motion.div>
        )}
      </div>}

      {!post.deletedAt && <RelatedPosts postId={postId} />}

    </div>
  );
}
