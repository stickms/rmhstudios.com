'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { splitThread } from '@/lib/feed/thread-splitter';
import type { FeedItem } from '@/lib/feed-types';

/** Mirrors MAX_SEGMENTS in app/routes/api/rmharks/thread.ts. */
const MAX_THREAD_POSTS = 25;

interface ThreadPostPanelProps {
  /** The composer's draft. The panel only shows when it is over the post limit. */
  content: string;
  /**
   * Why this draft cannot be a thread, or null when it can. Threads are public,
   * text-only posts (that is what the thread endpoint creates), so attachments
   * and non-default visibility/reply/paywall options have to come off first.
   */
  blockedBy: 'attachments' | 'options' | null;
  /** Called with the thread's root post once it is published. */
  onPosted: (root: FeedItem) => void;
}

/**
 * X1 — "Post as thread (N posts)". Mounted by the composer only once the draft
 * is longer than one RMHark, and loaded as its own chunk, so the splitter and
 * this preview cost nothing for the 99% of drafts that fit.
 *
 * Publishing goes through the existing authored-thread endpoint, which creates
 * the whole self-reply chain (root + follow-ups linked by `threadRootId`) in
 * one transaction — so a half-posted thread cannot happen.
 */
export default function ThreadPostPanel({ content, blockedBy, onPosted }: ThreadPostPanelProps) {
  const { t } = useTranslation('f-feed-plus');
  const [busy, setBusy] = useState(false);
  const posts = useMemo(() => splitThread(content), [content]);
  const count = posts.length;
  const tooLong = count > MAX_THREAD_POSTS;
  const canPost = count >= 2 && !tooLong && !blockedBy && !busy;

  const publish = async () => {
    if (!canPost) return;
    setBusy(true);
    try {
      const res = await fetch('/api/rmharks/thread', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: posts }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.error ?? t('thread-failed', { defaultValue: 'Could not post the thread' }),
        );
        return;
      }
      toast.success(t('thread-posted', { defaultValue: 'Thread posted' }));
      onPosted(data as FeedItem);
    } catch {
      toast.error(t('thread-failed', { defaultValue: 'Could not post the thread' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="glass-fill mt-2 rounded-site p-3"
      aria-label={t('thread-panel-label', { defaultValue: 'Post as thread' })}
    >
      <div className="flex items-start gap-2">
        <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0 text-site-accent" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-site-text-muted">
          {t('thread-offer', {
            defaultValue:
              'This is longer than one post. Post it as a thread and it is split at natural breaks. Put --- on its own line to choose where a post ends.',
          })}
        </p>
      </div>

      {count >= 2 && (
        <ol className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1" aria-live="polite">
          {posts.map((post, i) => (
            <li
              key={i}
              className="glass-inset rounded-site-sm px-3 py-2 text-sm text-site-text whitespace-pre-wrap break-words"
            >
              {post}
            </li>
          ))}
        </ol>
      )}

      {tooLong && (
        <p className="mt-2 text-xs text-site-danger">
          {t('thread-too-long', {
            max: MAX_THREAD_POSTS,
            defaultValue: 'A thread can have at most {{max}} posts. Shorten the draft.',
          })}
        </p>
      )}
      {blockedBy === 'attachments' && (
        <p className="mt-2 text-xs text-site-warning">
          {t('thread-blocked-attachments', {
            defaultValue:
              'Threads are text-only. Remove the image, GIF or poll to post as a thread.',
          })}
        </p>
      )}
      {blockedBy === 'options' && (
        <p className="mt-2 text-xs text-site-warning">
          {t('thread-blocked-options', {
            defaultValue:
              'Threads are public posts. Set visibility to Everyone and remove the content warning, reply limit and unlock price to post as a thread.',
          })}
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <Button variant="accent" size="sm" disabled={!canPost} loading={busy} onClick={publish}>
          {t('thread-post-button', {
            n: count,
            defaultValue: 'Post as thread ({{n}} posts)',
          })}
        </Button>
      </div>
    </section>
  );
}
