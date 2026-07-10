'use client';

import { useEffect, useRef, useState } from 'react';

export interface SuggestionContextMessage {
  author: string;
  content: string;
}

interface UseMessageSuggestionOptions {
  /** The current draft text in the composer. */
  draft: string;
  /** Recent conversation, oldest→newest. Truncated server-side for long chats. */
  context: SuggestionContextMessage[];
  /** Turn the feature off (e.g. user disabled it). Default on. */
  enabled?: boolean;
}

/**
 * Debounced inline-autocomplete for a chat composer. Returns the suggested
 * continuation to render as ghost text after `draft` (already spaced so it can
 * be appended directly). Clears on every keystroke until a fresh suggestion
 * arrives, and never throws — a failed or empty fetch just yields "".
 *
 * `context` is read through a ref so new incoming messages don't re-trigger a
 * fetch; only the draft (and `enabled`) drive requests.
 */
export function useMessageSuggestion({
  draft,
  context,
  enabled = true,
}: UseMessageSuggestionOptions): { suggestion: string; clear: () => void } {
  const [suggestion, setSuggestion] = useState('');
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    // Any edit invalidates the previous suggestion immediately.
    setSuggestion('');
    if (!enabled) return;

    const trimmed = draft.trim();
    // Skip trivial/huge drafts and ones that just ended a line (likely sending).
    if (trimmed.length < 2 || draft.length > 600 || draft.endsWith('\n')) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/ai/message-suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ draft, context: contextRef.current.slice(-20) }),
        });
        if (cancelled || !res.ok) return;
        const data = await res.json();
        let s = typeof data?.suggestion === 'string' ? data.suggestion : '';
        s = s.replace(/\s+/g, ' ').trim();
        if (!s) return;
        // Ensure a separating space when continuing right after a word/punct.
        const needsSpace =
          !/\s$/.test(draft) && /^[A-Za-z0-9]/.test(s) && /[A-Za-z0-9.,!?’'")\]]$/.test(draft);
        if (!cancelled) setSuggestion(needsSpace ? ` ${s}` : s);
      } catch {
        /* fail-soft: no ghost text */
      }
    }, 550);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // context intentionally excluded — read via ref so it doesn't re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, enabled]);

  return { suggestion, clear: () => setSuggestion('') };
}
