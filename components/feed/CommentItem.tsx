'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { MessageCircle, Repeat2, Heart, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-schema';
import { RMHarkContent } from './RMHarkContent';

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  user: { id: string; name: string; image: string | null; username: string | null };
  likeCount?: number;
  repostCount?: number;
  viewCount?: number;
  liked?: boolean;
  reposted?: boolean;
  replies?: Comment[];
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

  const isAuthor = sessionUser?.id === comment.userId;

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
        <Link href={`/profile/${comment.user.id}`} className="shrink-0">
          <div className="w-8 h-8 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-xs">
            {comment.user.image ? (
              <img src={comment.user.image} alt={comment.user.name || 'User'} className="w-full h-full rounded-full object-cover" />
            ) : (
              (comment.user.name?.[0] || 'U').toUpperCase()
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-sm">
            <Link href={`/profile/${comment.user.id}`} className="flex items-center gap-1.5 min-w-0 hover:underline">
              <span className="font-bold text-site-text truncate">
                {comment.user.name || 'Unknown'}
              </span>
              {comment.user.username && (
                <span className="text-site-text-dim truncate">
                  @{comment.user.username}
                </span>
              )}
            </Link>
            <span className="text-site-text-dim shrink-0">
              · {timeAgo(comment.createdAt)}
            </span>
          </div>

          {/* Content */}
          <RMHarkContent text={comment.content} className="text-sm text-site-text mt-0.5 whitespace-pre-wrap break-words" />

          {/* Actions row */}
          <div className="flex items-center gap-3 mt-1.5 -ml-1">
            {/* Reply */}
            {sessionUser && (
              <button
                onClick={() => setReplyOpen((v) => !v)}
                className="flex items-center gap-1 px-1 py-0.5 rounded-full text-site-text-dim hover:text-site-accent transition-colors group"
              >
                <MessageCircle className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              </button>
            )}

            {/* reRMHark */}
            <div className={`flex items-center rounded-full transition-colors ${
              reposted ? 'text-emerald-400' : 'text-site-text-dim'
            }`}>
              <button
                onClick={toggleRepost}
                className="p-0.5 rounded-full hover:bg-emerald-400/10 transition-colors group"
                title="reRMHark"
              >
                <Repeat2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              </button>
              {formatCount(repostCount) && (
                <span className="text-[11px] pr-0.5">{formatCount(repostCount)}</span>
              )}
            </div>

            {/* Like */}
            <div className={`flex items-center rounded-full transition-colors ${
              liked ? 'text-rose-400' : 'text-site-text-dim'
            }`}>
              <button
                onClick={toggleLike}
                className="p-0.5 rounded-full hover:bg-rose-400/10 transition-colors group"
                title="Like"
              >
                <Heart className={`w-3.5 h-3.5 group-hover:scale-110 transition-transform ${liked ? 'fill-current' : ''}`} />
              </button>
              {formatCount(likeCount) && (
                <span className="text-[11px] pr-0.5">{formatCount(likeCount)}</span>
              )}
            </div>

            {/* Views */}
            <div className="flex items-center gap-0.5 text-site-text-dim">
              <Eye className="w-3.5 h-3.5" />
              {formatCount(viewCount) && (
                <span className="text-[11px]">{formatCount(viewCount)}</span>
              )}
            </div>

            {/* Delete */}
            {isAuthor && (
              <button
                onClick={handleDelete}
                className="p-0.5 rounded-full text-site-text-dim hover:text-site-danger hover:bg-site-danger/10 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Inline reply box */}
          {replyOpen && sessionUser && (
            <div className="mt-2 flex gap-2">
              <div className="w-7 h-7 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-[10px] shrink-0">
                {sessionUser.image ? (
                  <img src={sessionUser.image} alt={sessionUser.name || 'You'} className="w-full h-full rounded-full object-cover" />
                ) : (
                  (sessionUser.name?.[0] || 'U').toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <textarea
                  autoFocus
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={`Reply to @${comment.user.name || 'Unknown'}...`}
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
    </div>
  );
}
