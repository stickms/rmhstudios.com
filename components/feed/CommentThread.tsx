'use client';

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { CommentItem } from './CommentItem';
import { AIGenerateButton } from './AIGenerateButton';
import type { Comment } from './CommentItem';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-schema';

interface CommentThreadProps {
  rmharkId: string;
  open: boolean;
  onClose: () => void;
  onCommentAdded: () => void;
}

export function CommentThread({ rmharkId, open, onClose, onCommentAdded }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data: session } = authClient.useSession();
  const remaining = MAX_COMMENT_LENGTH - content.length;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/rmharks/${rmharkId}/comment`)
      .then((res) => res.json())
      .then((data) => setComments(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [rmharkId, open]);

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rmharks/${rmharkId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => [comment, ...prev]);
        setContent('');
        onCommentAdded();
      }
    } catch (error) {
      console.error('Comment error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Prevent body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative bg-site-bg border border-site-border rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-site-border">
          <h2 className="font-bold text-site-text">Comments</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-site-accent animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-sm text-site-text-dim py-8">
              No comments yet. Be the first!
            </p>
          ) : (
            comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} postId={rmharkId} />
            ))
          )}
        </div>

        {/* Compose */}
        {session ? (
          <div className="border-t border-site-border px-4 py-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a comment..."
              rows={2}
              maxLength={MAX_COMMENT_LENGTH}
              className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border resize-none outline-none focus:border-site-accent transition-colors"
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-mono ${remaining <= 20 ? 'text-site-warning' : 'text-site-text-dim'}`}>
                  {remaining}
                </span>
                <AIGenerateButton
                  request={{ mode: 'reply', rmharkId, draft: content }}
                  onGenerated={(text) => setContent(text)}
                  size="sm"
                  title="Generate a reply with AI"
                />
              </div>
              <Button
                variant="accent"
                size="sm"
                disabled={!content.trim() || remaining < 0 || submitting}
                onClick={handleSubmit}
              >
                {submitting ? 'Posting...' : 'Comment'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-site-border px-4 py-3 text-center text-sm text-site-text-dim">
            Sign in to comment
          </div>
        )}
      </div>
    </div>
  );
}
