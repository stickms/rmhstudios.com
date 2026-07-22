'use client';

import { prefersReducedMotion } from '@/hooks/useReducedMotion';

type ViewTransition = {
  finished: Promise<void>;
  ready?: Promise<void>;
  /** Drops the animation but still commits the DOM update. Chromium-only today. */
  skipTransition?: () => void;
};
type VTDocument = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => ViewTransition;
};

// §15.2 readiness budget: `startViewTransition` freezes rendering until the
// update callback's promise resolves. A slow destination loader stalls that
// freeze, and the entrance work after it reads as the morph "cancelling"
// (the owner's choppy-open complaint). If the update hasn't resolved within
// this budget we `skipTransition()` — instant swap + normal staggered
// entrances instead of a frozen half-morph. Warm navigations (preloaded on
// intent) resolve well inside it and morph smoothly.
const SKIP_BUDGET_MS = 180;

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
  // `settle`/`cleanup` are idempotent: the skip path clears the liquid classes
  // synchronously (so the destination's normal enter animation runs at once,
  // not a stalled morph), and `transition.finished` later runs cleanup once —
  // the guard keeps `onSettled` (and the class removal) firing exactly once, so
  // the staggers never double-fire.
  let cleared = false;
  const clearClasses = () => {
    if (cleared) return;
    cleared = true;
    root.classList.remove('vt-active');
    root.classList.remove('vt-liquid');
  };
  const cleanup = () => {
    clearClasses();
    settle();
  };
  try {
    let resolved = false;
    const transition = doc.startViewTransition(() =>
      Promise.resolve(update()).finally(() => {
        resolved = true;
      }),
    );
    // If the destination is still pending past the budget, drop the morph.
    const timer = setTimeout(() => {
      if (!resolved && typeof transition.skipTransition === 'function') {
        transition.skipTransition();
        clearClasses();
      }
    }, SKIP_BUDGET_MS);
    const done = () => {
      clearTimeout(timer);
      cleanup();
    };
    transition.finished.then(done, done);
  } catch {
    clearClasses();
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
