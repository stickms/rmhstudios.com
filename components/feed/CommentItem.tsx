'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-schema';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; image: string | null; username: string | null };
  replies?: Comment[];
}

interface SessionUser {
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

interface CommentItemProps {
  comment: Comment;
  postId: string;
  sessionUser?: SessionUser | null;
  onReplyAdded?: (parentId: string, reply: Comment) => void;
}

export function CommentItem({ comment, postId, sessionUser, onReplyAdded }: CommentItemProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const remaining = MAX_COMMENT_LENGTH - replyContent.length;

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
          <p className="text-sm text-site-text mt-0.5 whitespace-pre-wrap break-words">
            {comment.content}
          </p>

          {/* Reply button */}
          {sessionUser && (
            <button
              onClick={() => setReplyOpen((v) => !v)}
              className="mt-1 text-xs text-site-text-dim hover:text-site-accent transition-colors"
            >
              Reply
            </button>
          )}

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
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
