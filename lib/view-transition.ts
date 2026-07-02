'use client';

import { prefersReducedMotion } from '@/hooks/useReducedMotion';

type VTDocument = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> };
};

/**
 * Runs a DOM-updating callback inside a scoped View Transition when the browser
 * supports it and the user hasn't asked for reduced motion — otherwise it just
 * runs the update. Used for shared-element morphs (a feed post's media growing
 * into the detail hero); the full-page root cross-fade is disabled in CSS, so
 * only elements with a matching `view-transition-name` animate.
 *
 * IMPORTANT: `update` should RETURN the navigation promise (e.g.
 * `() => navigate({ to })`). The View Transition snapshots the "after" state
 * once that promise resolves, so returning it is what lets the new page's hero
 * be captured. Returning void still works — it just skips the morph.
 *
 * While a transition is in flight we mark <html> with `.vt-active` so the
 * per-page enter animation (`.page-root > *`) stands down and doesn't fight the
 * morph. It's always cleared, even if navigation rejects.
 */
export function runViewTransition(update: () => void | Promise<void>): void {
  if (typeof document === 'undefined') {
    void update();
    return;
  }
  const doc = document as VTDocument;
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    void update();
    return;
  }
  const root = document.documentElement;
  root.classList.add('vt-active');
  try {
    const transition = doc.startViewTransition(() => update());
    transition.finished.then(
      () => root.classList.remove('vt-active'),
      () => root.classList.remove('vt-active')
    );
  } catch {
    root.classList.remove('vt-active');
    void update();
  }
}

/** Stable shared-element name for a post's media across feed card ↔ detail. */
export function postMediaVTName(postId: string): string {
  return `vt-post-media-${postId}`;
}

/** Stable shared-element name for an album's cover across grid ↔ viewer. */
export function albumCoverVTName(albumId: string): string {
  return `vt-album-cover-${albumId}`;
}
