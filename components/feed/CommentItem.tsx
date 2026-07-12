'use client';

import { useState, useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { MessageCircle, Repeat2, Heart, Eye, Trash2, MoreHorizontal, Repeat, BadgeCheck, ShieldCheck, Languages, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-schema';
import { RMHarkContent } from './RMHarkContent';
import ChatMediaEmbed, { stripEmbedUrls, extractMediaEmbeds } from '@/components/shared/ChatMediaEmbed';
import { GifPicker } from '@/components/feed/GifPicker';
import { EngagementListModal } from './EngagementListModal';
import { UserAvatar } from './UserAvatar';
import { AIGenerateButton } from './AIGenerateButton';
import { MentionTextarea } from './MentionTextarea';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { useFreshUser } from '@/stores/userDisplayStore';
import { timeAgoShort } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useLocaleStore } from '@/stores/localeStore';
import { LOCALE_TO_LANGUAGE_NAME } from '@/lib/i18n/config';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import type { ReactionSummary } from '@/lib/social/reactions';
import { applyReactionToggle } from '@/lib/social/reactions';
import { ReactionMenu } from '@/components/shared/ReactionMenu';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { useReactionTrigger } from '@/lib/emoji/use-reaction-trigger';

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  user: { id: string; name: string; image: string | null; username: string | null; handle?: string | null; isVerified?: boolean; isAdmin?: boolean };
  likeCount?: number;
  repostCount?: number;
  viewCount?: number;
  liked?: boolean;
  reposted?: boolean;
  replies?: Comment[];
  deletedAt?: string | null;
  deletedByAdmin?: boolean;
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

function formatCount(n: number | undefined): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// How many levels of replies to indent before collapsing the rest behind a
// "Show more replies" button. Keeps deep chains from running off-screen.
const MAX_NESTED_DEPTH = 4;

function countDescendants(replies: Comment[] | undefined): number {
  if (!replies?.length) return 0;
  return replies.reduce((total, r) => total + 1 + countDescendants(r.replies), 0);
}

interface CommentItemProps {
  comment: Comment;
  postId: string;
  sessionUser?: SessionUser | null;
  onReplyAdded?: (parentId: string, reply: Comment) => void;
  onCommentRemoved?: (commentId: string) => void;
  /** Nesting level — used to cap indentation on long reply chains. */
  depth?: number;
}

export function CommentItem({ comment, postId, sessionUser, onReplyAdded, onCommentRemoved, depth = 0 }: CommentItemProps) {
  const { t } = useTranslation("feed");
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
  const [reactions, setReactions] = useState<ReactionSummary[]>(comment.reactions ?? []);
  const [reactionMenu, setReactionMenu] = useState<{ x: number; y: number } | null>(null);
  const reactionTrigger = useReactionTrigger((x, y) => setReactionMenu({ x, y }));
  const viewTracked = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [engagementModal, setEngagementModal] = useState<'likes' | 'reposts' | null>(null);
  const [threadExpanded, setThreadExpanded] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // When the site language changes, drop any cached translation so the next
  // "Translate" click re-translates into the newly selected language.
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
      const res = await fetch(`/api/comments/${comment.id}/translate?to=${encodeURIComponent(to)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.text) {
          setTranslatedText(data.text);
          setShowTranslated(true);
        }
      }
    } finally {
      setTranslating(false);
    }
  };

  const hasReplies = !!comment.replies?.length;
  // At the depth cap, collapse the remaining chain behind a button instead of
  // indenting further (which would push content out of bounds).
  const collapseThread = depth >= MAX_NESTED_DEPTH && hasReplies && !threadExpanded;

  const isAuthor = sessionUser?.id === comment.userId;

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Track view
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    fetch(`/api/rmharks/${postId}/comment/${comment.id}/view`, { method: 'POST' })
      .then(() => setViewCount((v) => v + 1))
      .catch(() => {});
  }, [postId, comment.id]);

  const toggleLike = () => {
    if (!sessionUser) return;
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
      commit: () => fetch(`/api/rmharks/${postId}/comment/${comment.id}/like`, { method: 'POST' }),
    });
  };

  const toggleRepost = () => {
    if (!sessionUser) return;
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
      commit: () => fetch(`/api/rmharks/${postId}/comment/${comment.id}/repost`, { method: 'POST' }),
    });
  };

  const toggleReaction = async (emoji: string) => {
    const prev = reactions;
    setReactions(applyReactionToggle(prev, emoji));
    try {
      const res = await fetch(`/api/comments/${comment.id}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error('react failed');
    } catch {
      setReactions(prev);
    }
  };

  const handleDelete = async () => {
    if (!(await confirm({ title: t('delete-reply-confirm', { defaultValue: 'Delete this reply?' }), danger: true }))) return;
    try {
      const res = await fetch(`/api/rmharks/${postId}/comment/${comment.id}`, { method: 'DELETE' });
      if (res.ok) {
        onCommentRemoved?.(comment.id);
      }
    } catch (error) {
      console.error('Delete comment error:', error);
    }
  };

  const handleSubmitReply = async () => {
    if (!replyContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rmharks/${postId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: replyContent.trim(),
          parentId: comment.id,
        }),
      });
      if (res.ok) {
        const newReply = await res.json();
        onReplyAdded?.(comment.id, newReply);
        setReplyContent('');
        setReplyOpen(false);
      }
    } catch (error) {
      console.error('Reply error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="py-3" {...(comment.deletedAt || comment.pending ? {} : reactionTrigger)}>
      <div className="flex gap-2.5">
        {/* Avatar */}
        <UserAvatar user={freshCommentUser} size="sm" />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-sm">
            <Link to={`/u/${freshCommentUser.handle || freshCommentUser.id}` as string} className="flex items-center gap-1.5 min-w-0 hover:underline">
              <span className="font-bold text-site-text truncate">
                {freshCommentUser.name || 'Unknown'}
              </span>
              {freshCommentUser.isVerified && (
                <BadgeCheck className="w-4 h-4 text-site-success shrink-0" />
              )}
              {freshCommentUser.isAdmin && (
                <span title={t('admin-title', { defaultValue: 'Admin' })} className="inline-flex items-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-site-accent" />
                </span>
              )}
              {freshCommentUser.handle && (
                <span className="text-site-text-dim truncate">
                  @{freshCommentUser.handle}
                </span>
              )}
            </Link>
            <span className="text-site-text-dim shrink-0">
              · {timeAgoShort(comment.createdAt)}
            </span>

            {/* More menu */}
            {!comment.deletedAt && (
              <div className="relative ml-auto shrink-0" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-site-bg border border-site-border rounded-site shadow-xl py-1 z-30">
                    <button
                      onClick={() => { setMenuOpen(false); setEngagementModal('likes'); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                    >
                      <Heart className="w-4 h-4 text-site-text-dim" />
                      {t('liked-by', { defaultValue: 'Liked by' })}
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); setEngagementModal('reposts'); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                    >
                      <Repeat className="w-4 h-4 text-site-text-dim" />
                      {t('rermarkd-by', { defaultValue: "reRMHark'd by" })}
                    </button>
                    {comment.content.length > 8 && (
                      <button
                        onClick={handleTranslate}
                        disabled={translating}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors disabled:opacity-60"
                      >
                        <Languages className="w-4 h-4 text-site-text-dim" />
                        {translating ? t('translating', { defaultValue: 'Translating…' }) : translatedText ? (showTranslated ? t('show-original', { defaultValue: 'Show original' }) : t('show-translation', { defaultValue: 'Show translation' })) : t('translate', { defaultValue: 'Translate' })}
                      </button>
                    )}
                    {isAuthor && (
                      <button
                        onClick={() => { setMenuOpen(false); handleDelete(); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-danger hover:bg-site-danger/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t('delete', { defaultValue: 'Delete' })}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <RMHarkContent text={stripEmbedUrls(comment.content)} className="text-sm text-site-text mt-0.5 whitespace-pre-wrap break-words" />
          {extractMediaEmbeds(comment.content).length > 0 && (
            <ChatMediaEmbed content={comment.content} themePrefix="site" />
          )}
          {showTranslated && translatedText && (
            <p className="mt-1 whitespace-pre-wrap break-words rounded-site-sm bg-site-surface/50 p-2 text-sm text-site-text">
              {translatedText}
            </p>
          )}

          {!comment.deletedAt && !comment.pending && (
            <ReactionChips reactions={reactions} onToggle={toggleReaction} className="mt-1.5" />
          )}

          {/* Actions row */}
          {!comment.deletedAt && (
            <div className="flex items-center gap-5 mt-2 -ml-1.5">
              {/* Reply */}
              {sessionUser && (
                <button
                  onClick={() => setReplyOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent-dim/50 transition-[color,background-color,transform] duration-150 group active:scale-95"
                >
                  <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </button>
              )}

              {/* reRMHark */}
              <div className={`flex items-center rounded-full transition-colors ${
                reposted ? 'text-site-success' : 'text-site-text-dim'
              }`}>
                <button
                  onClick={toggleRepost}
                  className="p-1 rounded-full hover:bg-site-success/10 transition-[background-color,transform] duration-150 group active:scale-95"
                  title="reRMHark"
                >
                  <Repeat2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </button>
                <AnimatedCount value={repostCount} format={formatCount} hideZero className="text-xs pr-0.5" />
              </div>

              {/* Like */}
              <div className={`flex items-center rounded-full transition-colors ${
                liked ? 'text-site-danger' : 'text-site-text-dim'
              }`}>
                <button
                  onClick={toggleLike}
                  className="p-1 rounded-full hover:bg-site-danger/10 transition-[background-color,transform] duration-150 group active:scale-95"
                  title="Like"
                >
                  <Heart className={`w-4 h-4 group-hover:scale-110 transition-transform ${liked ? 'fill-current' : ''}`} />
                </button>
                <AnimatedCount value={likeCount} format={formatCount} hideZero className="text-xs pr-0.5" />
              </div>

              {/* Views */}
              <div className="flex items-center gap-1 px-1.5 py-1 text-site-text-dim">
                <Eye className="w-4 h-4" />
                <AnimatedCount value={viewCount} format={formatCount} hideZero className="text-xs" />
              </div>
            </div>
          )}

          {/* Inline reply box */}
          {replyOpen && sessionUser && (
            <div className="mt-2 flex gap-2">
              <UserAvatar
                user={{ id: sessionUser.id || '', name: sessionUser.name || null, image: sessionUser.image || null }}
                size="xs"
                linkToProfile={false}
              />
              <div className="flex-1 min-w-0">
                <MentionTextarea
                  ref={replyRef}
                  autoFocus
                  value={replyContent}
                  onChange={setReplyContent}
                  placeholder={t('reply-placeholder', { handle: freshCommentUser.handle || freshCommentUser.name || 'Unknown', defaultValue: 'Reply to @{{handle}}...' })}
                  rows={2}
                  maxLength={MAX_COMMENT_LENGTH}
                  className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-xs rounded-site-sm p-2 border border-site-border resize-none outline-none focus:border-site-accent transition-colors"
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
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono ${remaining <= 20 ? 'text-site-warning' : 'text-site-text-dim'}`}>
                      {remaining}
                    </span>
                    <button
                      onClick={() => { setReplyOpen(false); setReplyContent(''); setShowGifPicker(false); }}
                      className="text-[10px] text-site-text-dim hover:text-site-text transition-colors"
                    >
                      {t('cancel', { defaultValue: 'Cancel' })}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <AIGenerateButton
                      request={{ mode: 'reply', rmharkId: postId, parentId: comment.id, draft: replyContent }}
                      onGenerated={(text) => setReplyContent(text)}
                      size="sm"
                      title="Generate a reply with AI"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGifPicker((v) => !v)}
                      aria-label={t('add-gif-aria', { defaultValue: 'Add a GIF' })}
                      className="p-1.5 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent/10 transition-colors"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                    <EmojiPickerButton direction="up" onSelect={insertEmoji} />
                    <Button
                      variant="accent"
                      size="sm"
                      disabled={!replyContent.trim() || remaining < 0 || submitting}
                      onClick={handleSubmitReply}
                      className="h-6 text-xs px-2.5"
                    >
                      {submitting ? t('posting', { defaultValue: 'Posting...' }) : t('reply', { defaultValue: 'Reply' })}
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

          {/* Threaded replies */}
          {hasReplies && (
            collapseThread ? (
              <button
                onClick={() => setThreadExpanded(true)}
                className="mt-2 ml-2 flex items-center gap-1.5 text-xs font-medium text-site-accent hover:underline"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {t('show-more-replies', { count: countDescendants(comment.replies), defaultValue: 'Show {{count}} more reply', defaultValue_plural: 'Show {{count}} more replies' })}
              </button>
            ) : (
              <div className="mt-2 ml-2 border-l-2 border-site-border pl-3 space-y-1">
                {comment.replies!.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    postId={postId}
                    sessionUser={sessionUser}
                    onReplyAdded={onReplyAdded}
                    onCommentRemoved={onCommentRemoved}
                    // Reset depth after an expanded thread so indentation
                    // restarts shallow instead of running off-screen.
                    depth={threadExpanded ? 0 : depth + 1}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>

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
    </div>
  );
}
