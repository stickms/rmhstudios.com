import { useState, useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useReconsider } from '@/components/safety/use-reconsider';
import {
  Heart,
  Trash2,
  Repeat,
  BadgeCheck,
  ShieldCheck,
  Languages,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-limits';
import { RMHarkContent } from './RMHarkContent';
import ChatMediaEmbed, {
  stripEmbedUrls,
  extractMediaEmbeds,
} from '@/components/shared/ChatMediaEmbed';
import { GifPicker } from '@/components/feed/GifPicker';
import { EngagementListModal } from './EngagementListModal';
import { UserAvatar } from './UserAvatar';
import { AIGenerateButton } from './AIGenerateButton';
import { MentionTextarea } from './MentionTextarea';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { useFreshUser } from '@/stores/userDisplayStore';
import { relativeTimeShort } from '@/lib/utils';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { useTranslation } from 'react-i18next';
import { useLocaleStore } from '@/stores/localeStore';
import { LOCALE_TO_LANGUAGE_NAME } from '@/lib/i18n/config';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { useSignInPrompt } from '@/hooks/useSignInPrompt';
import { formatCount } from './format-count';
import { Spine, SpineItem } from '@/components/ui/spine';
import { flattenReplies, type FlatReply } from './post-detail/post-detail-state';
import type { ReactionSummary } from '@/lib/social/reactions';
import { reactToCommentApi } from '@/lib/social/comment-reaction.contract';
import { applyReactionToggle } from '@/lib/social/reactions';
import { ReactionMenu } from '@/components/shared/ReactionMenu';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { useReactionTrigger } from '@/lib/emoji/use-reaction-trigger';
import { HideReplyMenuItem, HiddenRepliesGroup } from './HiddenReplies';
import {
  viewCommentApi,
  likeCommentApi,
  repostCommentApi,
  deleteCommentApi,
} from '@/lib/feed/rmhark-actions.contract';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import { translateCommentApi } from '@/lib/ai/ai.contract';

import { createCommentApi } from '@/lib/feed/rmhark-actions.contract';
export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  user: {
    id: string;
    name: string;
    image: string | null;
    username: string | null;
    handle?: string | null;
    isVerified?: boolean;
    isAdmin?: boolean;
  };
  likeCount?: number;
  repostCount?: number;
  viewCount?: number;
  liked?: boolean;
  reposted?: boolean;
  replies?: Comment[];
  deletedAt?: string | null;
  deletedByAdmin?: boolean;
  /** X2: the post's author folded this reply under "Hidden replies". */
  hidden?: boolean;
  /** Grouped-by-emoji reaction summary (server-side via `groupReactions`). */
  reactions?: ReactionSummary[];
  /** Client-only: optimistic comment awaiting its server round-trip. */
  pending?: boolean;
}

interface SessionUser {
  id?: string;
  name?: string | null;
  image?: string | null;
}

interface CommentItemProps {
  comment: Comment;
  postId: string;
  sessionUser?: SessionUser | null;
  onReplyAdded?: (parentId: string, reply: Comment) => void;
  onCommentRemoved?: (commentId: string) => void;
  /**
   * 0 for a reply to the post, which owns the one nested spine of everything under it; 1 for a row on that spine
   * (Steel P2: replies to a reply are one level, indented 8px, never deeper).
   */
  depth?: number;
  /** Set on a row below the first level of that nested spine: whom it answers (it is not indented a third time). */
  replyingTo?: string | null;
  /** The post author's id — only they get the hide/unhide reply control (X2). */
  postAuthorId?: string;
  /** Called after the author hides/unhides a reply so the page can regroup it. */
  onHiddenChange?: (commentId: string, hidden: boolean) => void;
}

export function CommentItem({
  comment,
  postId,
  sessionUser,
  onReplyAdded,
  onCommentRemoved,
  depth = 0,
  replyingTo = null,
  postAuthorId,
  onHiddenChange,
}: CommentItemProps) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const locale = useLocaleStore((s) => s.locale);
  const freshCommentUser = useFreshUser(comment.user) ?? comment.user;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const insertEmoji = useEmojiInsert(replyRef, replyContent, setReplyContent);
  const remaining = MAX_COMMENT_LENGTH - replyContent.length;

  const [liked, setLiked] = useState(comment.liked ?? false);
  const [likeCount, setLikeCount] = useState(comment.likeCount ?? 0);
  const [reposted, setReposted] = useState(comment.reposted ?? false);
  const [repostCount, setRepostCount] = useState(comment.repostCount ?? 0);
  const [viewCount, setViewCount] = useState(comment.viewCount ?? 0);
  const { run: runLike } = useOptimisticAction();
  const { run: runRepost } = useOptimisticAction();
  const { run: runReaction } = useOptimisticAction();
  const promptSignIn = useSignInPrompt();
  const [reactions, setReactions] = useState<ReactionSummary[]>(comment.reactions ?? []);
  const [reactionMenu, setReactionMenu] = useState<{ x: number; y: number } | null>(null);
  const reactionTrigger = useReactionTrigger((x, y) => setReactionMenu({ x, y }));
  const viewTracked = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [engagementModal, setEngagementModal] = useState<'likes' | 'reposts' | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  // When the site language changes, drop any cached translation so the next
  //"Translate"click re-translates into the newly selected language.
  useEffect(() => {
    setTranslatedText(null);
    setShowTranslated(false);
  }, [locale]);

  const handleTranslate = async () => {
    setMenuOpen(false);
    if (translatedText) {
      setShowTranslated((s) => !s);
      return;
    }
    const to = LOCALE_TO_LANGUAGE_NAME[locale];
    setTranslating(true);
    try {
      const data = await api(translateCommentApi, {
        params: { commentId: comment.id },
        query: { to },
        timeoutMs: AI_TIMEOUT_MS,
      });
      if (data.text) {
        setTranslatedText(data.text);
        setShowTranslated(true);
      }
    } catch {
      // A failed translation leaves the comment as it was; there is nothing to report.
    } finally {
      setTranslating(false);
    }
  };

  // The row owning the nested spine flattens everything under it onto that one spine.
  const { visible: visibleReplies, hidden: hiddenReplies } = flattenReplies(comment);
  const hasReplies = visibleReplies.length + hiddenReplies.length > 0;

  const isAuthor = sessionUser?.id === comment.userId;

  // Outside-press dismissal, Escape, focus return, the roving arrow keys and the
  // close animation all live in AnchoredMenu now. This file used to carry its own
  // outside-click listener — and, because the panel was an in-place
  // `absolute top-full … z-50`, it was measured inside `.radial-frame`'s stacking
  // context (pinned at z-index 1), so a comment near the top of the column had its
  // menu painted UNDER the top bar. AnchoredMenu portals to <body>.

  // Track view
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    api(viewCommentApi, { params: { id: postId, commentId: comment.id } })
      .then(() => setViewCount((v) => v + 1))
      .catch(() => {});
  }, [postId, comment.id]);

  const toggleLike = () => {
    if (!sessionUser) {
      promptSignIn(t('like-reply-sign-in', { defaultValue: 'Sign in to like replies.' }));
      return;
    }
    const wasLiked = liked;
    const prevCount = likeCount;
    runLike({
      apply: () => {
        setLiked(!wasLiked);
        setLikeCount((c) => c + (wasLiked ? -1 : 1));
      },
      rollback: () => {
        setLiked(wasLiked);
        setLikeCount(prevCount);
      },
      commit: () => api(likeCommentApi, { params: { id: postId, commentId: comment.id } }),
    });
  };

  const toggleRepost = () => {
    if (!sessionUser) {
      promptSignIn(t('rermhark-reply-sign-in', { defaultValue: 'Sign in to reRMHark replies.' }));
      return;
    }
    const wasReposted = reposted;
    const prevCount = repostCount;
    runRepost({
      apply: () => {
        setReposted(!wasReposted);
        setRepostCount((c) => c + (wasReposted ? -1 : 1));
      },
      rollback: () => {
        setReposted(wasReposted);
        setRepostCount(prevCount);
      },
      commit: () => api(repostCommentApi, { params: { id: postId, commentId: comment.id } }),
    });
  };

  const toggleReaction = async (emoji: string) => {
    if (!sessionUser) {
      promptSignIn(t('react-sign-in', { defaultValue: 'Sign in to react.' }));
      return;
    }
    const prev = reactions;
    await runReaction({
      apply: () => setReactions(applyReactionToggle(prev, emoji)),
      rollback: () => setReactions(prev),
      commit: () => api(reactToCommentApi, { params: { commentId: comment.id }, body: { emoji } }),
    });
  };

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: t('delete-reply-confirm', { defaultValue: 'Delete this reply?' }),
        danger: true,
      }))
    )
      return;
    try {
      await api(deleteCommentApi, { params: { id: postId, commentId: comment.id } });
      onCommentRemoved?.(comment.id);
    } catch (error) {
      console.error('Delete comment error:', error);
    }
  };

  const renderReply = ({ comment: reply, replyingTo: to }: FlatReply) => (
    <CommentItem
      key={reply.id}
      comment={reply}
      postId={postId}
      sessionUser={sessionUser}
      onReplyAdded={onReplyAdded}
      onCommentRemoved={onCommentRemoved}
      postAuthorId={postAuthorId}
      onHiddenChange={onHiddenChange}
      depth={1}
      replyingTo={to}
    />
  );

  const reconsider = useReconsider();
  const handleSubmitReply = async () => {
    if (!replyContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const newReply = await reconsider((confirmReconsider) =>
        api(createCommentApi, {
          params: { id: postId },
          body: {
            content: replyContent.trim(),
            parentId: comment.id,
            confirmReconsider,
          },
        }),
      );
      if (!newReply) return;
      onReplyAdded?.(comment.id, newReply as Comment);
      setReplyContent('');
      setReplyOpen(false);
    } catch (error) {
      console.error('Reply error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = freshCommentUser.name || t('unknown-user', { defaultValue: 'Unknown' });

  return (
    // A reply is a spine item (Steel section 10, Post and replies): one dot, no card. The replies under it are ONE nested
    // spine inside this row, indented 8px (P2), flattened however deep they were written.
    <SpineItem as="article" {...(comment.deletedAt || comment.pending ? {} : reactionTrigger)}>
      <div className="flex items-center gap-2.5">
        <UserAvatar user={freshCommentUser} size="sm" />
        <div className="min-w-0">
          <Link
            to={`/u/${freshCommentUser.handle || freshCommentUser.id}` as string}
            className="t-body flex items-center gap-1 font-semibold text-site-text hover:underline"
          >
            <span className="truncate">{displayName}</span>
            {freshCommentUser.isVerified && (
              <>
                <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
                <span className="sr-only">{t('verified', { defaultValue: 'Verified' })}</span>
              </>
            )}
            {freshCommentUser.isAdmin && (
              <>
                <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                <span className="sr-only">{t('admin-title', { defaultValue: 'Admin' })}</span>
              </>
            )}
          </Link>
          <span className="t-meta block truncate">
            {freshCommentUser.handle ? `@${freshCommentUser.handle} · ` : ''}
            <RelativeTime date={comment.createdAt} format={relativeTimeShort} />
          </span>
        </div>
      </div>

      {replyingTo && (
        <p className="t-meta mt-2">
          {t('replying-to', { handle: replyingTo, defaultValue: 'Replying to {{handle}}' })}
        </p>
      )}

      {/* Content */}
      <RMHarkContent
        text={stripEmbedUrls(comment.content)}
        className="t-post mt-2 whitespace-pre-wrap break-words"
      />
      {extractMediaEmbeds(comment.content).length > 0 && (
        <ChatMediaEmbed content={comment.content} themePrefix="site" />
      )}
      {showTranslated && translatedText && (
        <p className="t-body mt-2 border-s-2 border-site-border ps-3 whitespace-pre-wrap break-words">
          {translatedText}
        </p>
      )}

      {!comment.deletedAt && !comment.pending && (
        <ReactionChips reactions={reactions} onToggle={toggleReaction} className="mt-2" />
      )}

      {/* K8: plain muted words, 18px apart. "On" is ink at weight 600. */}
      {!comment.deletedAt && (
        <div className="feed-actions">
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={liked}
            data-on={liked ? '' : undefined}
            className="feed-action"
          >
            {t('like', { defaultValue: 'Like' })}
            {formatCount(likeCount) && (
              <span className="feed-action__count">{formatCount(likeCount)}</span>
            )}
          </button>
          <button
            type="button"
            onClick={toggleRepost}
            aria-pressed={reposted}
            data-on={reposted ? '' : undefined}
            className="feed-action"
          >
            {t('action-repost', { defaultValue: 'Repost' })}
            {formatCount(repostCount) && (
              <span className="feed-action__count">{formatCount(repostCount)}</span>
            )}
          </button>
          {sessionUser && (
            <button
              type="button"
              onClick={() => setReplyOpen((v) => !v)}
              aria-expanded={replyOpen}
              className="feed-action"
            >
              {t('reply', { defaultValue: 'Reply' })}
            </button>
          )}
          <div className="relative">
            <button
              ref={menuBtnRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t('more-options', { defaultValue: 'More options' })}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="feed-action"
            >
              {t('action-more', { defaultValue: 'More' })}
            </button>
            <AnchoredMenu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              anchorRef={menuBtnRef}
              label={t('more-options', { defaultValue: 'More options' })}
              className="w-52"
            >
              <MenuItem
                icon={Heart}
                onSelect={() => {
                  setMenuOpen(false);
                  setEngagementModal('likes');
                }}
              >
                {t('liked-by', { defaultValue: 'Liked by' })}
              </MenuItem>
              <MenuItem
                icon={Repeat}
                onSelect={() => {
                  setMenuOpen(false);
                  setEngagementModal('reposts');
                }}
              >
                {t('rermarkd-by', { defaultValue: "reRMHark'd by" })}
              </MenuItem>
              {comment.content.length > 8 && (
                <MenuItem icon={Languages} disabled={translating} onSelect={handleTranslate}>
                  {translating
                    ? t('translating', { defaultValue: 'Translating…' })
                    : translatedText
                      ? showTranslated
                        ? t('show-original', { defaultValue: 'Show original' })
                        : t('show-translation', { defaultValue: 'Show translation' })
                      : t('translate', { defaultValue: 'Translate' })}
                </MenuItem>
              )}
              {!!sessionUser?.id && sessionUser.id === postAuthorId && !comment.pending && (
                <HideReplyMenuItem
                  postId={postId}
                  commentId={comment.id}
                  hidden={!!comment.hidden}
                  onChanged={(h) => onHiddenChange?.(comment.id, h)}
                  onDone={() => setMenuOpen(false)}
                />
              )}
              {isAuthor && (
                <MenuItem
                  icon={Trash2}
                  tone="danger"
                  onSelect={() => {
                    setMenuOpen(false);
                    handleDelete();
                  }}
                >
                  {t('delete', { defaultValue: 'Delete' })}
                </MenuItem>
              )}
            </AnchoredMenu>
          </div>
          {viewCount > 0 && (
            <span className="feed-actions__views t-meta">
              {t('post-views', { n: formatCount(viewCount), defaultValue: '{{n}} views' })}
            </span>
          )}
        </div>
      )}

      {/* Inline reply box */}
      {replyOpen && sessionUser && (
        <div className="mt-3 flex gap-2">
          <UserAvatar
            user={{
              id: sessionUser.id || '',
              name: sessionUser.name || null,
              image: sessionUser.image || null,
            }}
            size="xs"
            linkToProfile={false}
          />
          <div className="min-w-0 flex-1">
            <MentionTextarea
              ref={replyRef}
              autoFocus
              value={replyContent}
              onChange={setReplyContent}
              placeholder={t('reply-placeholder', {
                handle: freshCommentUser.handle || freshCommentUser.name || 'Unknown',
                defaultValue: 'Post your reply...',
              })}
              rows={2}
              maxLength={MAX_COMMENT_LENGTH}
              className="glass-inset t-body w-full resize-none px-3 py-2 text-site-text outline-none placeholder:text-site-text-muted"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmitReply();
                }
                if (e.key === 'Escape') {
                  setReplyOpen(false);
                  setReplyContent('');
                  setShowGifPicker(false);
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`t-meta ${remaining <= 20 ? 'font-semibold text-site-danger' : ''}`}
                >
                  {remaining}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReplyOpen(false);
                    setReplyContent('');
                    setShowGifPicker(false);
                  }}
                  className="feed-action"
                >
                  {t('cancel', { defaultValue: 'Cancel' })}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <AIGenerateButton
                  request={{
                    mode: 'reply',
                    rmharkId: postId,
                    parentId: comment.id,
                    draft: replyContent,
                  }}
                  onGenerated={(text) => setReplyContent(text)}
                  size="sm"
                  title="Generate a reply with AI"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowGifPicker((v) => !v)}
                  aria-label={t('add-gif-aria', { defaultValue: 'Add a GIF' })}
                >
                  <ImageIcon className="size-4" aria-hidden />
                </Button>
                <EmojiPickerButton direction="up" onSelect={insertEmoji} />
                <Button
                  variant="default"
                  size="sm"
                  disabled={!replyContent.trim() || remaining < 0 || submitting}
                  onClick={handleSubmitReply}
                >
                  {submitting
                    ? t('posting', { defaultValue: 'Posting…' })
                    : t('reply', { defaultValue: 'Reply' })}
                </Button>
              </div>
            </div>
            {showGifPicker && (
              <GifPicker
                className="mt-2"
                onClose={() => setShowGifPicker(false)}
                onSelect={(u) => {
                  setReplyContent((c) => (c ? `${c} ${u}` : u));
                  setShowGifPicker(false);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* The one nested spine: every reply under this one, in order (P2). */}
      {depth === 0 && hasReplies && (
        <Spine>
          {visibleReplies.map(renderReply)}
          <HiddenRepliesGroup count={hiddenReplies.length}>
            {hiddenReplies.map(renderReply)}
          </HiddenRepliesGroup>
        </Spine>
      )}

      {engagementModal && (
        <EngagementListModal
          open={engagementModal !== null}
          onClose={() => setEngagementModal(null)}
          postId={postId}
          commentId={comment.id}
          type={engagementModal}
        />
      )}

      {reactionMenu && (
        <ReactionMenu
          x={reactionMenu.x}
          y={reactionMenu.y}
          onSelect={toggleReaction}
          onClose={() => setReactionMenu(null)}
        />
      )}
    </SpineItem>
  );
}
