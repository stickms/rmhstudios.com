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
 *
 * `opts.liquid` (§5.48) additionally toggles `html.vt-liquid` for the
 * transition's lifetime — globals.css lengthens the group morph onto the springy
 * `--ease-glass` curve so a card *expands* into its detail hero. `opts.onSettled`
 * runs once the transition finishes (or immediately on the no-VT / reduced-motion
 * fallback path), with the same always-cleared guarantee as `.vt-active` — used
 * to strip a click-time `view-transition-name` back off a list item (§5.48).
 */
export function runViewTransition(
  update: () => void | Promise<void>,
  opts: { liquid?: boolean; onSettled?: () => void } = {},
): void {
  const { liquid = false, onSettled } = opts;
  const settle = () => {
    try {
      onSettled?.();
    } catch {
      /* a caller's cleanup must never break navigation */
    }
  };
  if (typeof document === 'undefined') {
    void update();
    settle();
    return;
  }
  const doc = document as VTDocument;
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    void update();
    settle();
    return;
  }
  const root = document.documentElement;
  root.classList.add('vt-active');
  if (liquid) root.classList.add('vt-liquid');
  const cleanup = () => {
    root.classList.remove('vt-active');
    root.classList.remove('vt-liquid');
    settle();
  };
  try {
    const transition = doc.startViewTransition(() => update());
    transition.finished.then(cleanup, cleanup);
  } catch {
    root.classList.remove('vt-active');
    root.classList.remove('vt-liquid');
    void update();
    settle();
  }
}

/**
 * Shared-element name for any card→detail liquid open (§5.48). `kind` is the
 * adopter family ('post' | 'image' | 'book' | 'album' | 'blog' | 'news' |
 * 'build' | 'persona'); the detail page names its hero with the same string.
 */
export function liquidVTName(kind: string, id: string): string {
  return `liquid-${kind}-${id}`;
}

/**
 * Run a card→detail liquid open (§5.48). Tags `el` with `name` for exactly ONE
 * transition — set now, restored when the transition settles — so list items
 * never carry a `view-transition-name` at rest (names must be unique per
 * document; a rest name on every card risks collisions and taxes every unrelated
 * transition). The destination hero carries the same `name` statically.
 *
 * Degrades cleanly: with no VT support / reduced motion, `update` runs and the
 * name is restored synchronously — the destination still mounts its staggered
 * content, which reads as a designed entrance on its own.
 */
export function runLiquidOpen(
  el: HTMLElement | null,
  name: string,
  update: () => void | Promise<void>,
): void {
  const prev = el?.style.viewTransitionName ?? '';
  if (el) el.style.viewTransitionName = name;
  runViewTransition(update, {
    liquid: true,
    onSettled: () => {
      if (el) el.style.viewTransitionName = prev;
    },
  });
}

/** Stable shared-element name for a post's media across feed card ↔ detail. */
export function postMediaVTName(postId: string): string {
  return `vt-post-media-${postId}`;
}

/** Stable shared-element name for an album's cover across grid ↔ viewer. */
export function albumCoverVTName(albumId: string): string {
  return `vt-album-cover-${albumId}`;
}
