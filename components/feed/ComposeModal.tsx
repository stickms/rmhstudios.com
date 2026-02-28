'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { useFeedStore } from '@/stores/feedStore';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-schema';

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
}

export function ComposeModal({ open, onClose }: ComposeModalProps) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { prependItem } = useFeedStore();
  const { data: session } = authClient.useSession();

  const remaining = MAX_RMHARK_LENGTH - content.length;

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/rmharks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('Post error:', data.error);
        return;
      }

      const item = await res.json();
      prependItem(item);
      setContent('');
      onClose();
    } catch (error) {
      console.error('Post error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !session) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="absolute inset-x-4 top-[10vh] mx-auto max-w-lg bg-site-bg border border-site-border rounded-2xl shadow-xl animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-site-border">
          <button
            onClick={onClose}
            className="p-1.5 -ml-1.5 rounded-full text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <Button
            variant="accent"
            size="sm"
            disabled={!content.trim() || remaining < 0 || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Posting...' : 'Post'}
          </Button>
        </div>

        {/* Compose area */}
        <div className="px-4 py-3">
          <div className="flex gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-sm ring-2 ring-site-bg shrink-0">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                (session.user.name?.[0] || 'U').toUpperCase()
              )}
            </div>

            <div className="flex-1 min-w-0">
              <textarea
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind?"
                rows={4}
                maxLength={MAX_RMHARK_LENGTH}
                className="w-full bg-transparent text-site-text placeholder:text-site-text-dim text-base resize-none border-none outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmit();
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-site-border flex items-center justify-end">
          <span
            className={`text-xs font-mono ${
              remaining <= 0
                ? 'text-site-danger'
                : remaining <= 20
                  ? 'text-site-warning'
                  : 'text-site-text-dim'
            }`}
          >
            {remaining}
          </span>
        </div>
      </div>
    </div>
  );
}
