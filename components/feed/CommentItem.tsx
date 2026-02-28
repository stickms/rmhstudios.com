'use client';

import Link from 'next/link';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; image: string | null; username: string | null };
  replies?: Comment[];
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
  onReply?: (commentId: string, userName: string) => void;
}

export function CommentItem({ comment, onReply }: CommentItemProps) {
  return (
    <div className="py-2">
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
          {onReply && (
            <button
              onClick={() => onReply(comment.id, comment.user.name || 'Unknown')}
              className="mt-1 text-xs text-site-text-dim hover:text-site-accent transition-colors"
            >
              Reply
            </button>
          )}

          {/* Threaded replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-2 ml-2 border-l-2 border-site-border pl-3 space-y-1">
              {comment.replies.map((reply) => (
                <CommentItem key={reply.id} comment={reply} onReply={onReply} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
