'use client';

import { useState, useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { MessageCircle, Repeat2, Heart, Eye, Trash2, MoreHorizontal, Repeat, BadgeCheck, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-schema';
import { RMHarkContent } from './RMHarkContent';
import { EngagementListModal } from './EngagementListModal';
import { UserAvatar } from './UserAvatar';
import { AIGenerateButton } from './AIGenerateButton';
import { useFreshUser } from '@/stores/userDisplayStore';

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
}

interface SessionUser {
  id?: string;
  name?: string | null;
  image?: string | null;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function formatCount(n: number | undefined): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface CommentItemProps {
  comment: Comment;
  postId: string;
  sessionUser?: SessionUser | null;
  onReplyAdded?: (parentId: string, reply: Comment) => void;
  onCommentRemoved?: (commentId: string) => void;
}

export function CommentItem({ comment, postId, sessionUser, onReplyAdded, onCommentRemoved }: CommentItemProps) {
  const freshCommentUser = useFreshUser(comment.user) ?? comment.user;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const remaining = MAX_COMMENT_LENGTH - replyContent.length;

  const [liked, setLiked] = useState(comment.liked ?? false);
  const [likeCount, setLikeCount] = useState(comment.likeCount ?? 0);
  const [reposted, setReposted] = useState(comment.reposted ?? false);
  const [repostCount, setRepostCount] = useState(comment.repostCount ?? 0);
  const [viewCount, setViewCount] = useState(comment.viewCount ?? 0);
  const viewTracked = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [engagementModal, setEngagementModal] = useState<'likes' | 'reposts' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const toggleLike = async () => {
    if (!sessionUser) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => c + (wasLiked ? -1 : 1));

    try {
      const res = await fetch(`/api/rmharks/${postId}/comment/${comment.id}/like`, { method: 'POST' });
      if (!res.ok) {
        setLiked(wasLiked);
        setLikeCount(comment.likeCount ?? 0);
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount(comment.likeCount ?? 0);
    }
  };

  const toggleRepost = async () => {
    if (!sessionUser) return;
    const wasReposted = reposted;
    setReposted(!wasReposted);
    setRepostCount((c) => c + (wasReposted ? -1 : 1));

    try {
      const res = await fetch(`/api/rmharks/${postId}/comment/${comment.id}/repost`, { method: 'POST' });
      if (!res.ok) {
        setReposted(wasReposted);
        setRepostCount(comment.repostCount ?? 0);
      }
    } catch {
      setReposted(wasReposted);
      setRepostCount(comment.repostCount ?? 0);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this reply?')) return;
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
    <div className="py-3">
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
                <BadgeCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              )}
              {freshCommentUser.isAdmin && (
                <span title="Admin" className="inline-flex items-center shrink-0">
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
              · {timeAgo(comment.createdAt)}
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
                  <div className="absolute right-0 top-full mt-1 w-44 bg-site-bg border border-site-border rounded-xl shadow-xl py-1 z-30">
                    <button
                      onClick={() => { setMenuOpen(false); setEngagementModal('likes'); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                    >
                      <Heart className="w-4 h-4 text-site-text-dim" />
                      Liked by
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); setEngagementModal('reposts'); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                    >
                      <Repeat className="w-4 h-4 text-site-text-dim" />
                      reRMHark'd by
                    </button>
                    {isAuthor && (
                      <button
                        onClick={() => { setMenuOpen(false); handleDelete(); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-danger hover:bg-site-danger/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <RMHarkContent text={comment.content} className="text-sm text-site-text mt-0.5 whitespace-pre-wrap break-words" />

          {/* Actions row */}
          {!comment.deletedAt && (
            <div className="flex items-center gap-5 mt-2 -ml-1.5">
              {/* Reply */}
              {sessionUser && (
                <button
                  onClick={() => setReplyOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent-dim/50 transition-colors group"
                >
                  <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </button>
              )}

              {/* reRMHark */}
              <div className={`flex items-center rounded-full transition-colors ${
                reposted ? 'text-emerald-400' : 'text-site-text-dim'
              }`}>
                <button
                  onClick={toggleRepost}
                  className="p-1 rounded-full hover:bg-emerald-400/10 transition-colors group"
                  title="reRMHark"
                >
                  <Repeat2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </button>
                {formatCount(repostCount) && (
                  <span className="text-xs pr-0.5">{formatCount(repostCount)}</span>
                )}
              </div>

              {/* Like */}
              <div className={`flex items-center rounded-full transition-colors ${
                liked ? 'text-rose-400' : 'text-site-text-dim'
              }`}>
                <button
                  onClick={toggleLike}
                  className="p-1 rounded-full hover:bg-rose-400/10 transition-colors group"
                  title="Like"
                >
                  <Heart className={`w-4 h-4 group-hover:scale-110 transition-transform ${liked ? 'fill-current' : ''}`} />
                </button>
                {formatCount(likeCount) && (
                  <span className="text-xs pr-0.5">{formatCount(likeCount)}</span>
                )}
              </div>

              {/* Views */}
              <div className="flex items-center gap-1 px-1.5 py-1 text-site-text-dim">
                <Eye className="w-4 h-4" />
                {formatCount(viewCount) && (
                  <span className="text-xs">{formatCount(viewCount)}</span>
                )}
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
                <textarea
                  autoFocus
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={`Reply to @${freshCommentUser.handle || freshCommentUser.name || 'Unknown'}...`}
                  rows={2}
                  maxLength={MAX_COMMENT_LENGTH}
                  className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-xs rounded-lg p-2 border border-site-border resize-none outline-none focus:border-site-accent transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSubmitReply();
                    }
                    if (e.key === 'Escape') {
                      setReplyOpen(false);
                      setReplyContent('');
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono ${remaining <= 20 ? 'text-site-warning' : 'text-site-text-dim'}`}>
                      {remaining}
                    </span>
                    <AIGenerateButton
                      request={{ mode: 'reply', rmharkId: postId, parentId: comment.id, draft: replyContent }}
                      onGenerated={(text) => setReplyContent(text)}
                      size="sm"
                      title="Generate a reply with AI"
                    />
                    <button
                      onClick={() => { setReplyOpen(false); setReplyContent(''); }}
                      className="text-[10px] text-site-text-dim hover:text-site-text transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={!replyContent.trim() || remaining < 0 || submitting}
                    onClick={handleSubmitReply}
                    className="h-6 text-xs px-2.5"
                  >
                    {submitting ? 'Posting...' : 'Reply'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Threaded replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-2 ml-2 border-l-2 border-site-border pl-3 space-y-1">
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  postId={postId}
                  sessionUser={sessionUser}
                  onReplyAdded={onReplyAdded}
                  onCommentRemoved={onCommentRemoved}
                />
              ))}
            </div>
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
    </div>
  );
}
