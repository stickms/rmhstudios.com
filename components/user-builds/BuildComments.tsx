'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, MessageCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession } from '@/components/Providers';
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
  const { t } = useTranslation('c-user-builds');
  const [showReplies, setShowReplies] = useState(depth === 0);

  return (
    <div className={depth > 0 ? 'ml-6 border-l border-site-border pl-4' : ''}>
      <div className="py-3">
        <div className="flex items-start gap-3">
          <UserAvatar
            src={comment.user.image ?? undefined}
            alt={comment.user.name || t('user-alt', { defaultValue: 'User' })}
            size={32}
            fallbackName={comment.user.name ?? undefined}
          />
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-medium text-site-text">
                {comment.user.name || t('anonymous', { defaultValue: 'Anonymous' })}
              </span>
              <span className="text-xs text-site-text-dim">{timeAgo(comment.createdAt)}</span>
            </div>
            <p className="text-sm text-site-text-muted whitespace-pre-wrap break-words">
              {comment.content}
            </p>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onReply(comment.id)}
              className="-ml-2.5 mt-1 text-site-text-dim"
            >
              {t('reply', { defaultValue: 'Reply' })}
            </Button>
          </div>
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2">
            {comment.replyCount && comment.replyCount > comment.replies.length && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowReplies(!showReplies)}
                aria-expanded={showReplies}
                className="-ml-2.5 mb-2 text-site-accent"
              >
                <ChevronDown
                  className={`transition-transform ${showReplies ? 'rotate-180' : ''}`}
                  aria-hidden
                />
                {showReplies
                  ? t('hide', { defaultValue: 'Hide' })
                  : t('show-replies', {
                      defaultValue: 'Show {{count}} replies',
                      count: comment.replyCount,
                    })}
              </Button>
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
  const { t } = useTranslation('c-user-builds');
  const { data: session } = useSession();
  const [comments, setComments] = useState<BuildComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchComments = useCallback(
    async (cursorParam?: string) => {
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
    },
    [buildId],
  );

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
              ? {
                  ...c,
                  replies: [...(c.replies || []), newComment],
                  replyCount: (c.replyCount || 0) + 1,
                }
              : c,
          ),
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
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-site-text">
        <MessageCircle className="size-5 text-site-accent" aria-hidden />
        {t('comments', { defaultValue: 'Comments' })}
      </h2>

      {/* Comment Form */}
      {session ? (
        <form onSubmit={handleSubmit} className="mb-6 space-y-2">
          {replyTo && replyToComment && (
            <div className="flex items-center gap-2 text-sm text-site-text-muted">
              <span>
                {t('replying-to', {
                  defaultValue: 'Replying to {{name}}',
                  name: replyToComment.user.name,
                })}
              </span>
              <Button type="button" variant="ghost" size="xs" onClick={() => setReplyTo(null)}>
                {t('cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              id="comment-input"
              type="text"
              aria-label={t('write-comment', { defaultValue: 'Write a comment...' })}
              placeholder={
                replyTo
                  ? t('write-reply', { defaultValue: 'Write a reply...' })
                  : t('write-comment', { defaultValue: 'Write a comment...' })
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1"
              maxLength={2000}
            />
            <Button
              type="submit"
              variant="accent"
              size="icon"
              loading={submitting}
              loadingText={<></>}
              disabled={!content.trim()}
              aria-label={t('post-comment', { defaultValue: 'Post comment' })}
            >
              <Send aria-hidden />
            </Button>
          </div>
        </form>
      ) : (
        <p className="mb-6 text-sm text-site-text-muted">
          <a href="/login" className="text-site-accent hover:underline">
            {t('sign-in', { defaultValue: 'Sign in' })}
          </a>{' '}
          {t('to-leave-a-comment', { defaultValue: 'to leave a comment.' })}
        </p>
      )}

      {/* Comments List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-12 text-center text-sm text-site-text-dim">
          {t('no-comments', { defaultValue: 'No comments yet. Be the first!' })}
        </p>
      ) : (
        <div className="divide-y divide-site-border">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} onReply={handleReply} />
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <Button
          variant="ghost"
          onClick={() => cursor && fetchComments(cursor)}
          className="mt-4 w-full text-site-accent"
        >
          {t('load-more-comments', { defaultValue: 'Load more comments' })}
        </Button>
      )}
    </div>
  );
}
