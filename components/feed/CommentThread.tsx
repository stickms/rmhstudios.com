'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Image as ImageIcon } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { CommentItem } from './CommentItem';
import { AIGenerateButton } from './AIGenerateButton';
import { GifPicker } from '@/components/feed/GifPicker';
import { MentionTextarea } from './MentionTextarea';
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
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation('feed');
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
    const text = content.trim();
    const sessionUser = session!.user as {
      id: string;
      name?: string | null;
      image?: string | null;
      username?: string | null;
      handle?: string | null;
      isVerified?: boolean;
      isAdmin?: boolean;
    };

    // Optimistic comment: show it at the top instantly (dimmed) and clear the
    // box, then reconcile with the saved record or roll back on failure.
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Comment = {
      id: tempId,
      content: text,
      createdAt: new Date().toISOString(),
      userId: sessionUser.id,
      user: {
        id: sessionUser.id,
        name: sessionUser.name ?? '',
        image: sessionUser.image ?? null,
        username: sessionUser.username ?? null,
        handle: sessionUser.handle ?? null,
        isVerified: sessionUser.isVerified,
        isAdmin: sessionUser.isAdmin,
      },
      likeCount: 0,
      repostCount: 0,
      viewCount: 0,
      liked: false,
      reposted: false,
      replies: [],
      pending: true,
    };
    setComments((prev) => [optimistic, ...prev]);
    setContent('');
    onCommentAdded();
    setSubmitting(true);

    try {
      const res = await fetch(`/api/rmharks/${rmharkId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => prev.map((c) => (c.id === tempId ? comment : c)));
      } else {
        setComments((prev) => prev.filter((c) => c.id !== tempId));
        setContent(text);
        toast.error(t('comment-error', { defaultValue: 'Could not post comment' }));
      }
    } catch (error) {
      console.error('Comment error:', error);
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setContent(text);
      toast.error(t('comment-error', { defaultValue: 'Could not post comment' }));
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
        className="relative bg-site-bg border border-site-border rounded-site shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-site-border">
          <h2 className="font-bold text-site-text">{t("comments-heading", { defaultValue: "Comments" })}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-site-sm text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-sm text-site-text-dim py-8">
              {t("no-comments", { defaultValue: "No comments yet. Be the first!" })}
            </p>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className={comment.pending ? 'opacity-60 pointer-events-none' : undefined}
                aria-busy={comment.pending || undefined}
              >
                <CommentItem comment={comment} postId={rmharkId} />
              </div>
            ))
          )}
        </div>

        {/* Compose */}
        {session ? (
          <div className="border-t border-site-border px-4 py-3">
            <MentionTextarea
              value={content}
              onChange={setContent}
              placeholder={t("write-comment-placeholder", { defaultValue: "Write a comment..." })}
              rows={2}
              maxLength={MAX_COMMENT_LENGTH}
              className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-site p-3 border border-site-border resize-none outline-none focus:border-site-accent transition-colors"
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
                  title={t("generate-reply-ai", { defaultValue: "Generate a reply with AI" })}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGifPicker((v) => !v)}
                  aria-label={t('add-gif-aria', { defaultValue: 'Add a GIF' })}
                  className="p-1.5 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent/10 transition-colors"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
                <Button
                  variant="accent"
                  size="sm"
                  disabled={!content.trim() || remaining < 0 || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? t("posting", { defaultValue: "Posting..." }) : t("comment-button", { defaultValue: "Comment" })}
                </Button>
              </div>
            </div>
            {showGifPicker && (
              <GifPicker
                className="mt-2"
                onClose={() => setShowGifPicker(false)}
                onSelect={(u) => {
                  setContent((c) => (c ? `${c} ${u}` : u));
                  setShowGifPicker(false);
                }}
              />
            )}
          </div>
        ) : (
          <div className="border-t border-site-border px-4 py-3 text-center text-sm text-site-text-dim">
            {t("sign-in-to-comment", { defaultValue: "Sign in to comment" })}
          </div>
        )}
      </div>
    </div>
  );
}
