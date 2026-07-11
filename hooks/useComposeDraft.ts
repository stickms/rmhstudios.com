'use client';

/**
 * Composer draft autosave. Losing a written-but-unsent post to a refresh or a
 * stray navigation is the worst kind of feed UX failure, so the composer's
 * text (+ gif URL — media attachments hold object URLs that can't survive a
 * reload) is debounced into localStorage and offered back the next time an
 * empty composer mounts.
 */

import { useEffect, useRef } from 'react';

const KEY = 'rmh-compose-draft';
const DEBOUNCE_MS = 600;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // silently drop week-old drafts

export interface ComposeDraft {
  content: string;
  gifUrl: string;
  savedAt: number;
}

export function readComposeDraft(): ComposeDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ComposeDraft;
    if (!draft?.content?.trim()) return null;
    if (typeof draft.savedAt !== 'number' || Date.now() - draft.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearComposeDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore (private mode / storage disabled)
  }
}

/**
 * Debounced autosave of the composer text. Disable for seeded modes (quotes,
 * share_target) so they don't overwrite a draft the user typed elsewhere.
 */
export function useComposeDraftAutosave(content: string, gifUrl: string, enabled = true) {
  const first = useRef(true);
  useEffect(() => {
    if (!enabled) return;
    // Skip the mount pass: an empty composer must not clear a stored draft
    // before the user had a chance to restore it.
    if (first.current) {
      first.current = false;
      if (!content) return;
    }
    const timer = setTimeout(() => {
      try {
        if (content.trim()) {
          const draft: ComposeDraft = { content, gifUrl, savedAt: Date.now() };
          localStorage.setItem(KEY, JSON.stringify(draft));
        } else {
          localStorage.removeItem(KEY);
        }
      } catch {
        // ignore (private mode / storage disabled)
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [content, gifUrl, enabled]);
}
