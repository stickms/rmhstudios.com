'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { useReconsider } from '@/components/safety/use-reconsider';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RMHarkOverflowMenu } from './RMHarkOverflowMenu';
import { useLocaleStore } from '@/stores/localeStore';
import { LOCALE_TO_LANGUAGE_NAME } from '@/lib/i18n/config';
import { useResolvedUser, useSession } from '@/components/Providers';
import { useFreshUser, useUserDisplayStore } from '@/stores/userDisplayStore';
import { useFeedStore } from '@/stores/feedStore';
import { RMHarkActions } from './RMHarkActions';
import { CommentItem } from './CommentItem';
import { HiddenRepliesGroup } from './HiddenReplies';
import { AIGenerateButton } from './AIGenerateButton';
import { MentionTextarea } from './MentionTextarea';
import type { Comment } from './CommentItem';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-limits';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import type { FeedItem } from '@/lib/feed-types';
import { RMHarkContent, extractFirstUrl } from './RMHarkContent';
import { PollDisplay } from './PollDisplay';
import { TakeMeterLazy } from './TakeMeterLazy';
import { ContextNotesLazy } from '@/components/context-notes/ContextNotesLazy';
import { RunnableEmbed } from '@/components/code-embed/RunnableEmbed';
import { PostPlusBadges } from '@/components/posts-plus/PostPlusBadges';
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
import { EditHistoryButton } from './EditHistory';
import { postBodyUrl, postCommentsUrl } from '@/lib/feed/post-detail-prefetch';
import { peekIntentFetch, takeOrFetch } from '@/lib/route/intent-fetch';

interface PostDetailProps {
  postId: string;
}

export function PostDetail({ postId }: PostDetailProps) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });
  const locale = useLocaleStore((s) => s.locale);
  // §17.2: seed the detail from the feed card's already-known data so the hero (the
  // liquid-open morph target) renders INSTANTLY — no skeleton flash, no second
  // entrance when the fetch lands. Warm opens (from the feed) hit this; a cold URL
  // load finds no seed and shows the spinner until the fetch resolves.
  // A post with no feed seed may still have arrived before this page mounted:
  // the route's `beforeLoad` and the card's intent handlers start its fetches
  // (lib/feed/post-detail-prefetch). Settled ones render in the first commit.
  const [arrived] = useState(() => ({
    body: peekIntentFetch(postBodyUrl(postId)),
    comments: peekIntentFetch(postCommentsUrl(postId)),
  }));
  const [post, setPost] = useState<FeedItem | null>(
    () =>
      useFeedStore.getState().items.find((i) => i.id === postId) ??
      (arrived.body?.status === 200 ? (arrived.body.data as FeedItem) : null),
  );
  const [comments, setComments] = useState<Comment[]>(() =>
    Array.isArray(arrived.comments?.data) ? (arrived.comments.data as Comment[]) : [],
  );
  const [loading, setLoading] = useState(
    () => !useFeedStore.getState().items.some((i) => i.id === postId) && !arrived.body,
  );
  const [loadingComments, setLoadingComments] = useState(
    () => !Array.isArray(arrived.comments?.data),
  );
  const [notFound, setNotFound] = useState(() => arrived.body?.status === 404);
  const [commentContent, setCommentContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data: session } = useSession();
  const { resolved: resolvedUser } = useResolvedUser();
  const remaining = MAX_COMMENT_LENGTH - commentContent.length;
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);

  // Keep the shared feed store in sync with engagement that happens here, so
  // navigating back to the feed reflects the new counts instead of stale ones.
  const syncToFeed = useCallback(
    (updates: Partial<FeedItem>) => {
      const store = useFeedStore.getState();
      if (store.items.some((i) => i.id === postId)) {
        store.updateItem(postId, updates);
      }
    },
    [postId],
  );

  const bumpFeedComment = useCallback(
    (delta: number) => {
      const store = useFeedStore.getState();
      const current = store.items.find((i) => i.id === postId);
      if (current) {
        store.updateItem(postId, {
          commentCount: Math.max(0, (current.commentCount ?? 0) + delta),
        });
      }
    },
    [postId],
  );

  const linkPreviewUrl = useMemo(() => {
    if (
      !post ||
      post.poll ||
      post.gifUrl ||
      (post.imageUrls && post.imageUrls.length > 0) ||
      !post.content
    )
      return null;
    return extractFirstUrl(post.content);
  }, [post]);

  const isAuthor = session?.user?.id === post?.user?.id;
  const freshPostUser = useFreshUser(post?.user);
  const freshOriginalUser = useFreshUser(post?.original?.user);

  // Drop any cached translation when the site language changes, so the next
  //"Translate"re-translates into the newly selected language.
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
        { credentials: 'include' },
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
    // §17.2: keep the seeded hero on screen while the full record loads (only show
    // the spinner when there was no seed) so the morph never lands on a skeleton.
    const seed = useFeedStore.getState().items.find((i) => i.id === postId) ?? null;
    // A request already started for this open (the route's beforeLoad, the card's
    // intent) is taken once here instead of issuing a second one.
    const url = postBodyUrl(postId);
    if (seed) setPost(seed);
    setLoading(!seed && !peekIntentFetch(url));
    takeOrFetch(url)
      .then(({ status, data: body }) => {
        if (status === 404) {
          setNotFound(true);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = body as any;
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
    const url = postCommentsUrl(postId);
    setLoadingComments(!Array.isArray(peekIntentFetch(url)?.data));
    takeOrFetch(url)
      .then(({ data }) => setComments(Array.isArray(data) ? (data as Comment[]) : []))
      .catch(console.error)
      .finally(() => setLoadingComments(false));
  }, [postId]);

  const reconsider = useReconsider();
  const handleSubmit = async () => {
    if (!commentContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await reconsider((confirmReconsider) =>
        fetch(`/api/rmharks/${postId}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: commentContent.trim(), confirmReconsider }),
        }),
      );
      if (!res) return;
      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => [comment, ...prev]);
        setCommentContent('');
        setPost((prev) => (prev ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 } : prev));
        bumpFeedComment(1);
      } else {
        // Surfaces the reply-control 403 ("The author limited who can reply…").
        const data = await res.json().catch(() => ({}));
        toast.error(
          data.error || t('comment-failed', { defaultValue: 'Could not post your reply' }),
        );
      }
    } catch (error) {
      console.error('Comment error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplyAdded = useCallback(
    (parentId: string, reply: Comment) => {
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
      setPost((prev) => (prev ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 } : prev));
      bumpFeedComment(1);
    },
    [bumpFeedComment],
  );

  const handleCommentRemoved = useCallback(
    (commentId: string) => {
      const removeDeep = (comments: Comment[]): Comment[] =>
        comments
          .filter((c) => c.id !== commentId)
          .map((c) => (c.replies?.length ? { ...c, replies: removeDeep(c.replies) } : c));
      setComments((prev) => removeDeep(prev));
      setPost((prev) =>
        prev ? { ...prev, commentCount: Math.max(0, (prev.commentCount ?? 0) - 1) } : prev,
      );
      bumpFeedComment(-1);
    },
    [bumpFeedComment],
  );

  // X2: flip a reply's hidden flag in place (it regroups under "Hidden replies").
  const handleHiddenChange = useCallback((commentId: string, hidden: boolean) => {
    const setDeep = (list: Comment[]): Comment[] =>
      list.map((c) => ({
        ...c,
        ...(c.id === commentId ? { hidden } : {}),
        ...(c.replies?.length ? { replies: setDeep(c.replies) } : {}),
      }));
    setComments((prev) => setDeep(prev));
  }, []);

  const formatFullDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center px-4 pt-4 pb-12">
        <Spinner size={32} />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="flex flex-col items-center justify-center px-4 pt-4 pb-12 text-center">
        <p className="text-lg font-medium text-site-text mb-2">
          {t('post-not-found', { defaultValue: 'Post not found' })}
        </p>
        <p className="text-sm text-site-text-muted mb-4">
          {t('post-not-found-detail', { defaultValue: "This post doesn't exist or was deleted." })}
        </p>
        <Link to="/">
          <Button variant="accent" size="sm">
            {t('go-home', { defaultValue: 'Go Home' })}
          </Button>
        </Link>
      </div>
    );
  }

  const sessionUserForReplies = session?.user
    ? {
        ...session.user,
        image: resolvedUser?.image || session.user.image,
        name: resolvedUser?.name || session.user.name,
      }
    : undefined;

  const authorName = freshPostUser?.name || t('unknown-user', { defaultValue: 'Unknown' });

  // One column, one rhythm: the post, the reply surface, every reply thread and
  // the related posts are siblings of `.post-page` (feed.css), so they share the
  // same width, the same gutter and the same --space-4 gap. The page title is
  // the author's name, visually hidden: the card below already says who wrote it.
  return (
    <div className="post-page">
      <h1 className="sr-only">
        {t('post-by', { defaultValue: 'Post by {{name}}', name: authorName })}
      </h1>
      <div className="post-page__back">
        <button type="button" onClick={() => window.history.back()} className="page-heading__back">
          <ArrowLeft aria-hidden />
          <span>{t('back', { defaultValue: 'Back' })}</span>
        </button>
      </div>

      {/* The post: a singular panel, so `.glass-pane` (L2). It is the liquid-open
          hero the feed card morphs into (§5.48); the name is static because there
          is one post per detail page. Author, body, media, timestamp and the
          action row all live inside it. */}
      <article
        className="glass-pane post-page__post relative"
        style={{ viewTransitionName: liquidVTName('post', postId) }}
      >
        {/* More menu — top right (shared with the feed card so features match) */}
        {!post.deletedAt && (
          <div className="absolute top-3 right-3 z-20">
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
        <div className="flex items-center gap-3 mb-4 pr-10">
          <UserAvatar user={freshPostUser} size="lg" />
          <div className="min-w-0">
            <Link
              to={`/u/${freshPostUser?.handle || freshPostUser?.id}` as string}
              className="hover:underline"
            >
              <span className="block truncate text-base font-bold text-site-text">
                {authorName}
              </span>
            </Link>
            {freshPostUser?.handle && (
              <p className="truncate text-sm text-site-text-muted">@{freshPostUser.handle}</p>
            )}
          </div>
        </div>

        {/* Content - larger text for detail view */}
        {post.content && (
          <RMHarkContent
            text={post.content}
            className="mb-4 text-lg leading-relaxed whitespace-pre-wrap break-words text-site-text sm:text-xl"
          />
        )}

        {/* Translation (toggled from the overflow menu) */}
        {showTranslated && translatedText && (
          <div className="mb-3 rounded-site glass-fill px-4 py-3 text-[15px] leading-relaxed text-site-text whitespace-pre-wrap break-words">
            {translatedText}
          </div>
        )}

        {/* Poll */}
        {post.poll && (
          <div className="mb-3">
            <PollDisplay
              poll={post.poll}
              postId={postId}
              onUpdate={(updatedPoll) =>
                setPost((prev) => (prev ? { ...prev, poll: updatedPoll } : prev))
              }
            />
          </div>
        )}

        {/* Take meter (X6) — only on posts the author marked as a take */}
        {post.isTake && !post.locked && (
          <div className="mb-3">
            <TakeMeterLazy postId={postId} />
          </div>
        )}

        {post.hasEmbed && !post.locked && <RunnableEmbed postId={postId} />}

        {/* Context notes (X3) — a button until opened; open straight away when a note is visible */}
        {!post.locked && (
          <div className="mb-3">
            <ContextNotesLazy postId={postId} hasNote={post.hasNote} />
          </div>
        )}

        {/* Series part (X5) and auto-delete (X8) badges */}
        {!post.locked && (
          <PostPlusBadges
            postId={postId}
            seriesId={post.seriesId}
            expiresAt={post.expiresAt}
            className="mb-3"
          />
        )}

        {/* Image / GIF — hidden behind a content warning when marked sensitive.
 The gutter is `mb-5`, not the `mb-3` the text blocks above use: a photo's
 edge is a hard rectangle, so the gap that reads as a paragraph break under
 text reads as the timestamp sitting ON the image. */}
        {(post.gifUrl || (post.imageUrls && post.imageUrls.length > 0)) && (
          <SensitiveMedia sensitive={post.isSensitive} className="mb-4">
            {post.gifUrl && <GifEmbed url={post.gifUrl} className="mb-1" />}
            {post.imageUrls && post.imageUrls.length > 0 && (
              <PostImageGrid
                urls={post.imageUrls}
                alts={post.imageAlts}
                heroName={postMediaVTName(postId)}
                // This is the single-post page, so the post's first image is the
                // largest element on it and therefore the LCP candidate. No
                // `<link rel=preload>` to pair with: the post body is fetched on
                // the client, so the URL does not exist at head() time.
                priority
              />
            )}
          </SensitiveMedia>
        )}

        {/* Link preview — only when no poll, gif, or image */}
        {linkPreviewUrl && <LinkPreview url={linkPreviewUrl} className="mb-3" />}

        {/* Quoted original */}
        {post.original && (
          <div className="glass-fill mb-3 rounded-site px-4 py-3">
            <div className="flex items-center gap-2 text-sm mb-1">
              {freshOriginalUser ? (
                <Link
                  to={`/u/${freshOriginalUser.handle || freshOriginalUser.id}` as string}
                  className="flex items-center gap-2 min-w-0 hover:underline"
                >
                  <span className="font-bold text-site-text truncate">
                    {freshOriginalUser.name || t('unknown-user', { defaultValue: 'Unknown' })}
                  </span>
                  {freshOriginalUser.handle && (
                    <span className="text-site-text-dim truncate">@{freshOriginalUser.handle}</span>
                  )}
                </Link>
              ) : (
                <span className="font-bold text-site-text truncate">
                  {t('unknown-user', { defaultValue: 'Unknown' })}
                </span>
              )}
            </div>
            <RMHarkContent
              text={post.original.content ?? ''}
              className="text-site-text text-sm whitespace-pre-wrap break-words"
            />
          </div>
        )}

        {/* Full timestamp */}
        <p className="mb-1 text-sm text-site-text-muted">
          {formatFullDate(post.createdAt)}
          {post.edited && !post.deletedAt ? (
            <EditHistoryButton postId={postId} className="text-sm" />
          ) : null}
        </p>

        {/* The passive "N reRMHarks · N Likes · N Views" bar that used to sit here
            is gone. `RMHarkActions` directly below already renders every one of
            those counts against the same icons the rest of the site uses, so the
            page showed each figure twice: once as text that looked clickable and
            did nothing, and once on the control that performs the action. The
            toolbar stays because it is the one you can press. It closes the card
            with space, not a rule. */}
        {!post.deletedAt && (
          <RMHarkActions
            item={post}
            className="mt-2 -mb-2"
            onUpdate={(_, updates) => {
              setPost((prev) => (prev ? { ...prev, ...updates } : prev));
              syncToFeed(updates);
            }}
          />
        )}
      </article>

      {/* Deleted notice: a quiet card in the column, not a ruled strip. */}
      {post.deletedAt && (
        <div className="glass-fill rounded-site px-5 py-4">
          <p className="text-center text-sm text-site-text-muted">
            {post.deletedByAdmin
              ? t('deleted-by-admin', { defaultValue: 'This RMHark was deleted by an admin.' })
              : t('deleted-by-user', { defaultValue: 'This RMHark was deleted by the user.' })}
          </p>
        </div>
      )}

      {/* Reply surface. Signed in: the composer, a singular panel (`.glass-pane`)
          around a `.glass-inset` field, the same grammar as the feed's composer.
          Signed out: a quiet `.glass-fill` card with the one way forward. */}
      {!post.deletedAt && session ? (
        <section
          className="glass-pane post-page__compose"
          aria-label={t('reply', { defaultValue: 'Reply' })}
        >
          {post.replyControl && post.replyControl !== 'EVERYONE' && (
            <p className="mb-3 flex items-center gap-2 text-xs text-site-text-muted">
              <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {post.replyControl === 'FOLLOWING'
                ? t('reply-limited-following', {
                    defaultValue: 'Accounts the author follows can reply',
                  })
                : t('reply-limited-mentioned', {
                    defaultValue: 'Only accounts the author mentioned can reply',
                  })}
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
            <div className="min-w-0 flex-1">
              <MentionTextarea
                id="post-comment-input"
                value={commentContent}
                onChange={setCommentContent}
                placeholder={t('reply-placeholder', { defaultValue: 'Post your reply...' })}
                rows={2}
                maxLength={MAX_COMMENT_LENGTH}
                className="glass-inset w-full resize-none rounded-site px-4 py-3 text-sm text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmit();
                  }
                }}
              />
              <div className="mt-3 flex items-center justify-between">
                <span
                  className={`font-mono text-xs ${remaining <= 20 ? 'text-site-warning' : 'text-site-text-muted'}`}
                >
                  {remaining}
                </span>
                <div className="flex items-center gap-2">
                  <AIGenerateButton
                    request={{ mode: 'reply', rmharkId: postId, draft: commentContent }}
                    onGenerated={(text) => setCommentContent(text)}
                    size="sm"
                    title={t('ai-generate-title', { defaultValue: 'Generate a reply with AI' })}
                  />
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={!commentContent.trim() || remaining < 0 || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting
                      ? t('posting', { defaultValue: 'Posting…' })
                      : t('reply', { defaultValue: 'Reply' })}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : !post.deletedAt ? (
        <div className="glass-fill flex flex-wrap items-center justify-between gap-3 rounded-site px-5 py-4">
          <p className="text-sm text-site-text-muted">
            {t('sign-in-to-reply', { defaultValue: 'Sign in to reply' })}
          </p>
          <Link to="/login" search={{ callbackURL: pathname }}>
            <Button variant="accent" size="sm" tabIndex={-1}>
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Button>
          </Link>
        </div>
      ) : null}

      {/* Replies: each top-level reply is its own card (CommentItem draws it), and
          nested replies indent inside their parent's card, so the column keeps one
          width all the way down. */}
      {!post.deletedAt && (
        <>
          {!loadingComments && comments.length > 0 && (
            <ThreadSummary postId={postId} commentCount={comments.length} />
          )}
          {loadingComments ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : comments.length === 0 ? (
            <div className="glass-fill rounded-site">
              <EmptyState
                icon={MessageCircle}
                title={t('no-replies-title', { defaultValue: 'No replies yet' })}
                description={t('no-replies-hint', { defaultValue: 'Be the first to reply.' })}
                className="py-8"
              />
            </div>
          ) : (
            // §16.3.5 — one entrance per navigation. The post body is fetched
            // CLIENT-side (the route loader only has meta+sidebar), so the column
            // enters ONCE via `page-enter`/the liquid-open morph while a spinner
            // shows, THEN the replies arrive a beat later. Re-staggering them here
            // was a second, jarring entrance wave on the SAME navigation (the
            // owner's "double load animation"). `initial={false}` mounts the
            // replies already-settled — the page/morph is the single entrance.
            <>
              <motion.div
                className="post-page__replies"
                variants={staggerContainer(0.03)}
                initial={false}
                animate="animate"
              >
                {comments
                  .filter((c) => !c.hidden)
                  .map((comment, i) => {
                    const node = (
                      <CommentItem
                        comment={comment}
                        postId={postId}
                        postAuthorId={post.user?.id}
                        onHiddenChange={handleHiddenChange}
                        sessionUser={sessionUserForReplies}
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
              <HiddenRepliesGroup card count={comments.filter((c) => c.hidden).length}>
                {comments
                  .filter((c) => c.hidden)
                  .map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      postId={postId}
                      depth={1}
                      postAuthorId={post.user?.id}
                      onHiddenChange={handleHiddenChange}
                      sessionUser={sessionUserForReplies}
                      onReplyAdded={handleReplyAdded}
                      onCommentRemoved={handleCommentRemoved}
                    />
                  ))}
              </HiddenRepliesGroup>
            </>
          )}
        </>
      )}

      {!post.deletedAt && <RelatedPosts postId={postId} />}
    </div>
  );
}
