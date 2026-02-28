'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { useFeedStore } from '@/stores/feedStore';
import { MAX_RMHEET_LENGTH } from '@/lib/rmheet-schema';
import Link from 'next/link';

export function ComposeBox() {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { prependItem } = useFeedStore();

  const { data: session } = authClient.useSession();
  const remaining = MAX_RMHEET_LENGTH - content.length;

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/rmheets', {
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
    } catch (error) {
      console.error('Post error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) {
    return (
      <div className="px-4 py-6 border-b border-site-border text-center">
        <p className="text-sm text-site-text-muted mb-2">Sign in to post RMHeets</p>
        <Link href="/login">
          <Button variant="accent" size="sm">Sign In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-site-border">
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

        {/* Compose area */}
        <div className="flex-1 min-w-0">
          <textarea
            id="compose-box"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            rows={3}
            maxLength={MAX_RMHEET_LENGTH}
            className="w-full bg-transparent text-site-text placeholder:text-site-text-dim text-base resize-none border-none outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />

          <div className="flex items-center justify-between mt-2">
            {/* Character counter */}
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

            <Button
              variant="accent"
              size="sm"
              disabled={!content.trim() || remaining < 0 || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
