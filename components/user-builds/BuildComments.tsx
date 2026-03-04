'use client';

import { useState, useEffect, useCallback } from 'react';
import { Send, Loader2, MessageCircle, ChevronDown } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import type { BuildComment } from '@/lib/user-builds-types';

interface BuildCommentsProps {
  buildId: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function CommentItem({
  comment,
  onReply,
  depth = 0,
}: {
  comment: BuildComment;
  onReply: (parentId: string) => void;
  depth?: number;
}) {
  const [showReplies, setShowReplies] = useState(depth === 0);

  return (
    <div className={depth > 0 ? 'ml-8 border-l border-site-border pl-4' : ''}>
      <div className="py-3">
        <div className="flex items-start gap-3">
          {comment.user.image ? (
            <img
              src={comment.user.image}
              alt={comment.user.name || 'User'}
              className="w-8 h-8 rounded-full shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-sm font-bold shrink-0">
              {(comment.user.name?.[0] || 'U').toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm text-site-text">
                {comment.user.name || 'Anonymous'}
              </span>
              <span className="text-xs text-site-text-dim">
                {timeAgo(comment.createdAt)}
              </span>
            </div>
            <p className="text-sm text-site-text-muted whitespace-pre-wrap break-words">
              {comment.content}
            </p>
            <button
              onClick={() => onReply(comment.id)}
              className="mt-1 text-xs text-site-text-dim hover:text-violet-400 transition-colors"
            >
              Reply
            </button>
          </div>
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2">
            {comment.replyCount && comment.replyCount > comment.replies.length && (
              <button
                onClick={() => setShowReplies(!showReplies)}
                className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 mb-2"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showReplies ? 'rotate-180' : ''}`} />
                {showReplies ? 'Hide' : `Show ${comment.replyCount} replies`}
              </button>
            )}
            {showReplies &&
              comment.replies.map((reply) => (
                <CommentItem key={reply.id} comment={reply} onReply={onReply} depth={depth + 1} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BuildComments({ buildId }: BuildCommentsProps) {
  const { data: session } = authClient.useSession();
  const [comments, setComments] = useState<BuildComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchComments = useCallback(async (cursorParam?: string) => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '20');
      if (cursorParam) params.set('cursor', cursorParam);

      const res = await fetch(`/api/user-builds/${buildId}/comments?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch comments');

      const data = await res.json();

      if (cursorParam) {
        setComments((prev) => [...prev, ...data.items]);
      } else {
        setComments(data.items);
      }
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  }, [buildId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/user-builds/${buildId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          parentId: replyTo || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to post comment');

      const newComment = await res.json();

      if (replyTo) {
        // Add reply to parent comment
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyTo
              ? { ...c, replies: [...(c.replies || []), newComment], replyCount: (c.replyCount || 0) + 1 }
              : c
          )
        );
      } else {
        // Add top-level comment
        setComments((prev) => [newComment, ...prev]);
      }

      setContent('');
      setReplyTo(null);
    } catch (error) {
      console.error('Error posting comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = (parentId: string) => {
    setReplyTo(parentId);
    // Focus the input
    document.getElementById('comment-input')?.focus();
  };

  const replyToComment = replyTo ? comments.find((c) => c.id === replyTo) : null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-site-text mb-4 flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-violet-400" />
        Comments
      </h2>

      {/* Comment Form */}
      {session ? (
        <form onSubmit={handleSubmit} className="mb-6">
          {replyTo && replyToComment && (
            <div className="flex items-center gap-2 mb-2 text-sm text-site-text-muted">
              <span>Replying to {replyToComment.user.name}</span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-violet-400 hover:text-violet-300"
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <input
              id="comment-input"
              type="text"
              placeholder={replyTo ? 'Write a reply...' : 'Write a comment...'}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 px-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text text-sm outline-none focus:border-violet-500/50 transition-colors"
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={!content.trim() || submitting}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-site-text-muted mb-6">
          <a href="/login" className="text-violet-400 hover:text-violet-300">
            Sign in
          </a>{' '}
          to leave a comment.
        </p>
      )}

      {/* Comments List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center text-site-text-dim py-8">No comments yet. Be the first!</p>
      ) : (
        <div className="divide-y divide-site-border">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} onReply={handleReply} />
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <button
          onClick={() => cursor && fetchComments(cursor)}
          className="w-full mt-4 py-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
        >
          Load more comments
        </button>
      )}
    </div>
  );
}
