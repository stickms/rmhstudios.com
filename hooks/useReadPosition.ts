'use client';

/**
 * useReadPosition (B7) — remember where someone stopped in a long document, and
 * offer to take them back.
 *
 * ── Why it does not write on scroll ─────────────────────────────────────────
 *
 * The obvious implementation is a scroll listener that PUTs the current
 * fraction. Reading one long book fires scroll thousands of times; even
 * throttled to once a second that is several hundred writes to a single row per
 * reader, all of them immediately superseded, and the only one that actually
 * matters — the last — is the one most likely to be lost, because it races the
 * page unloading. Every write but the final one is waste, and the final one is
 * the unreliable one.
 *
 * So this hook writes on `visibilitychange` (plus `pagehide`, which is the event
 * iOS Safari reliably delivers when a tab is closed or swapped, and on unmount
 * for in-app navigation, which never hides the tab). One read produces roughly
 * one write. `navigator.sendBeacon` is what makes the hidden-tab write land: a
 * normal `fetch` from a document that is being torn down is cancelled, and even
 * `keepalive` is best-effort — a beacon is queued by the browser and survives
 * the document.
 *
 * ── Why it never jumps on its own ───────────────────────────────────────────
 *
 * An unrequested scroll jump reads as a bug. Someone who opened a book to
 * re-read the opening, or who followed a link to a specific section, has just
 * been thrown somewhere they did not ask to go — and there is no undo, because
 * the page they were on is gone. So the hook restores NOTHING by itself: it
 * hands back `showPrompt` and a `restore()` the reader calls from a dismissible
 * banner. A dismissal is remembered for the session, so paging back and forth
 * does not re-ask.
 *
 * ```tsx
 * const { showPrompt, saved, restore, dismiss } = useReadPosition('library', slug, {
 *   getFraction: () => window.scrollY / (document.body.scrollHeight - innerHeight),
 *   getAnchorId: () => nearestHeadingId(),
 * });
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { RESUME_MAX_RATIO } from '@/lib/history/constants';

const ENDPOINT = '/api/history/position';

/**
 * Below this the reader is effectively at the top: there is nothing to resume,
 * and writing it would overwrite a real position with a meaningless one on any
 * document that briefly reports 0 while it lays itself out.
 */
const MIN_FRACTION = 0.02;

/** Don't re-write a position that has barely moved since the last beacon. */
const MIN_DELTA = 0.01;

export interface StoredReadPosition {
  fraction: number;
  anchorId: string | null;
  updatedAt: string;
}

export interface UseReadPositionOptions {
  /** Current position as 0–1. Read lazily, only at beacon time. */
  getFraction: () => number;
  /** Nearest stable element id at the current position, when the document has any. */
  getAnchorId?: () => string | null | undefined;
  /**
   * What `restore()` does. The default scrolls the window — to the anchor
   * element when it exists, otherwise to `fraction` of the document.
   */
  onRestore?: (position: StoredReadPosition) => void;
  /** Hold off until the document has laid out; `false` disables everything. */
  enabled?: boolean;
}

export interface ReadPositionControls {
  /** The stored position, or `null` while unknown / absent. */
  saved: StoredReadPosition | null;
  /** Show the "pick up where you left off" prompt. Never implies a jump. */
  showPrompt: boolean;
  /** Go to the stored position. Only ever called from a user action. */
  restore: () => void;
  /** Hide the prompt for the rest of this session. */
  dismiss: () => void;
  /** Write now — for an explicit "save my place" control. */
  save: () => void;
}

function dismissKey(kind: string, entityId: string): string {
  return `rmh-readpos-dismissed:${kind}:${entityId}`;
}

function wasDismissed(kind: string, entityId: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(kind, entityId)) === '1';
  } catch {
    return false; // private mode / storage disabled — prompting again is harmless
  }
}

function defaultRestore(position: StoredReadPosition): void {
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  if (position.anchorId) {
    const el = document.getElementById(position.anchorId);
    if (el) {
      el.scrollIntoView({ behavior, block: 'start' });
      return;
    }
  }
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: Math.max(0, scrollable * position.fraction), behavior });
}

/**
 * @param kind One of the `ReadPosition.kind` values the API accepts
 *   (`library` | `news` | `blog` | `docs`). The route is the authority and 400s
 *   on anything else — this is a transport, not a second source of truth.
 */
export function useReadPosition(
  kind: string,
  entityId: string | null | undefined,
  opts: UseReadPositionOptions,
): ReadPositionControls {
  const { getFraction, getAnchorId, onRestore, enabled = true } = opts;

  const [saved, setSaved] = useState<StoredReadPosition | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  // The callbacks are read at beacon time, not subscribed to: a reader that
  // rebuilds `getFraction` every render must not re-register listeners (or, far
  // worse, fire a write) on every render.
  const latest = useRef({ getFraction, getAnchorId, onRestore });
  latest.current = { getFraction, getAnchorId, onRestore };

  /** Fraction of the last successful write, so an idle tab beacons nothing. */
  const lastSent = useRef<number | null>(null);

  /* ── Read the stored position once ─────────────────────────────────────── */
  useEffect(() => {
    if (!enabled || !entityId) return;
    let cancelled = false;

    const params = new URLSearchParams({ kind, entityId });
    fetch(`${ENDPOINT}?${params.toString()}`, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { position?: StoredReadPosition | null } | null) => {
        if (cancelled) return;
        const position = data?.position ?? null;
        setSaved(position);
        if (!position) return;
        // Same two bounds the resume rail uses: not at the top, not finished.
        const worthOffering =
          position.fraction > MIN_FRACTION && position.fraction < RESUME_MAX_RATIO;
        if (worthOffering && !wasDismissed(kind, entityId)) setShowPrompt(true);
      })
      .catch(() => {
        // Signed out (401) or offline. A reader that cannot remember your place
        // is still a reader; there is nothing useful to tell anyone here.
      });

    return () => {
      cancelled = true;
    };
  }, [kind, entityId, enabled]);

  /* ── Write on tab-hide / teardown, never on scroll ──────────────────────── */
  const send = useCallback(() => {
    if (!enabled || !entityId) return;

    const raw = latest.current.getFraction();
    if (!Number.isFinite(raw)) return;
    const fraction = Math.min(1, Math.max(0, raw));
    if (fraction < MIN_FRACTION) return;
    if (lastSent.current != null && Math.abs(fraction - lastSent.current) < MIN_DELTA) return;

    const body = JSON.stringify({
      kind,
      entityId,
      fraction,
      anchorId: latest.current.getAnchorId?.() ?? null,
    });
    lastSent.current = fraction;

    // A beacon is queued by the browser and outlives the document; a fetch from
    // a page being torn down is cancelled. `keepalive` is the fallback for the
    // (rare) engine without sendBeacon.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  }, [kind, entityId, enabled]);

  useEffect(() => {
    if (!enabled || !entityId) return;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') send();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // iOS Safari does not reliably fire `visibilitychange` on tab close; it does
    // fire `pagehide`. Both call the same de-duplicated `send()`.
    window.addEventListener('pagehide', send);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', send);
      // Client-side navigation away from the reader hides nothing and unloads
      // nothing, so unmount is the only signal there is.
      send();
    };
  }, [send, enabled, entityId]);

  /* ── Prompt controls ───────────────────────────────────────────────────── */
  const dismiss = useCallback(() => {
    setShowPrompt(false);
    if (!entityId) return;
    try {
      sessionStorage.setItem(dismissKey(kind, entityId), '1');
    } catch {
      // Storage disabled — the prompt simply returns on the next visit.
    }
  }, [kind, entityId]);

  const restore = useCallback(() => {
    setShowPrompt(false);
    if (!saved) return;
    (latest.current.onRestore ?? defaultRestore)(saved);
  }, [saved]);

  return { saved, showPrompt, restore, dismiss, save: send };
}
