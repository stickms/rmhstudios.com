'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * One-tap reply chips above a DM composer.
 *
 * Tapping a chip FILLS the composer rather than sending. Phone keyboards send
 * on tap because the chip is the whole interaction there; here the composer is
 * already in front of the user, and a message sent to another person by a
 * single misplaced tap is not recoverable. Filling keeps the last word theirs.
 *
 * The fetch is deliberately narrow — it runs only when there is something to
 * reply TO and nothing already being written:
 *   · the composer is empty (a draft means they've already decided),
 *   · the newest message is the other person's,
 *   · that message hasn't been suggested for before (`fetchedFor`), so
 *     re-renders, reconnects and read-receipts don't re-spend the call.
 * Anything else renders nothing at all.
 */
export function SmartReplies({
  conversationId,
  /** Newest message id, or null when the thread is empty / ends with our own. */
  replyToMessageId,
  draft,
  onPick,
}: {
  conversationId: string;
  replyToMessageId: string | null;
  draft: string;
  onPick: (reply: string) => void;
}) {
  const { t } = useTranslation('feed');
  const [replies, setReplies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // The message id we last spent a request on — the guard against re-fetching
  // the same conversation state as the component re-renders.
  const fetchedFor = useRef<string | null>(null);

  const idle = draft.trim().length === 0;

  useEffect(() => {
    if (!idle || !replyToMessageId) {
      setReplies([]);
      return;
    }
    if (fetchedFor.current === replyToMessageId) return;

    let cancelled = false;
    // A beat after the message lands, so a burst of messages costs one call.
    const timer = setTimeout(async () => {
      fetchedFor.current = replyToMessageId;
      setLoading(true);
      try {
        const res = await fetch('/api/ai/smart-replies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ conversationId }),
        });
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        setReplies(res.ok && Array.isArray(data.replies) ? data.replies : []);
      } catch {
        // Fail silent: no chips is a perfectly good chat composer.
        if (!cancelled) setReplies([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [conversationId, replyToMessageId, idle]);

  if (!idle || replies.length === 0) return null;

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={t('smart-replies-label', { defaultValue: 'Suggested replies' })}
      aria-busy={loading}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-site-accent" aria-hidden />
      {replies.map((reply) => (
        <button
          key={reply}
          type="button"
          onClick={() => {
            onPick(reply);
            // A picked set is spent — leaving it up invites a second tap that
            // would overwrite what the first one just put in the composer.
            setReplies([]);
          }}
          className="max-w-full truncate rounded-full border border-site-border px-3 py-1 text-xs text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
        >
          {reply}
        </button>
      ))}
    </div>
  );
}
