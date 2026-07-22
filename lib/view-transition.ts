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

// §17.2 WebKit precondition budget: `skipTransition()` is Chromium-only, so on
// WebKit the SKIP_BUDGET cannot bail out of a slow update — the freeze just holds.
// When a caller supplies a `preload`, we race it against THIS budget BEFORE
// capturing and only start the transition once the destination is known-warm;
// otherwise we navigate plain. That converts the budget from a Chromium-only
// escape hatch into a universal pre-condition.
const PRELOAD_BUDGET_MS = 160;

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
  opts: {
    liquid?: boolean;
    onSettled?: () => void;
    /**
     * §17.2 destination warm-up. When provided, it is raced against
     * {@link PRELOAD_BUDGET_MS} BEFORE the transition is captured; the morph only
     * runs once it resolves (warm). If the budget wins the update runs plain (no
     * morph, normal entrances) — the universal, WebKit-safe pre-condition that
     * replaces the Chromium-only `skipTransition()` escape as the primary guard.
     */
    preload?: () => Promise<unknown>;
  } = {},
): void {
  const { liquid = false, onSettled, preload } = opts;
  const settle = () => {
    try {
      onSettled?.();
    } catch {
      /* a caller's cleanup must never break navigation */
    }
  };
  const plain = () => {
    void update();
    settle();
  };
  if (typeof document === 'undefined') {
    plain();
    return;
  }
  const doc = document as VTDocument;
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    plain();
    return;
  }
  const root = document.documentElement;

  const startTransition = () => {
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
    // §17.3 VT watchdog: force-clear the freeze-adjacent root classes after ~1.5s
    // even if `transition.finished` never settles (a wedged capture / interrupted
    // transition must never leave the page frozen — "animations always end").
    const watchdog = setTimeout(clearClasses, 1500);
    try {
      let resolved = false;
      const transition = doc.startViewTransition(() =>
        Promise.resolve(update()).finally(() => {
          resolved = true;
        }),
      );
      // Chromium safety net: if the destination is still pending past the budget,
      // drop the morph (the §17.2 preload pre-condition is the primary guard now,
      // and it is the ONLY one that works on WebKit).
      const timer = setTimeout(() => {
        if (!resolved && typeof transition.skipTransition === 'function') {
          transition.skipTransition();
          clearClasses();
        }
      }, SKIP_BUDGET_MS);
      const done = () => {
        clearTimeout(timer);
        clearTimeout(watchdog);
        cleanup();
      };
      transition.finished.then(done, done);
    } catch {
      clearTimeout(watchdog);
      clearClasses();
      plain();
    }
  };

  if (!preload) {
    startTransition();
    return;
  }
  // Race the warm-up against the budget: morph only if the destination is ready.
  let decided = false;
  const decide = (warm: boolean) => {
    if (decided) return;
    decided = true;
    if (warm) startTransition();
    else plain();
  };
  const budget = setTimeout(() => decide(false), PRELOAD_BUDGET_MS);
  Promise.resolve()
    .then(preload)
    .then(
      () => {
        clearTimeout(budget);
        decide(true);
      },
      () => {
        clearTimeout(budget);
        decide(false);
      },
    );
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
  /**
   * §17.2 optional destination warm-up (see {@link runViewTransition}). Pass a
   * resolver that settles once the detail view will render instantly (e.g. its
   * data is already in a store/cache). When omitted the morph runs immediately.
   */
  preload?: () => Promise<unknown>,
): void {
  const prev = el?.style.viewTransitionName ?? '';
  if (el) el.style.viewTransitionName = name;
  runViewTransition(update, {
    liquid: true,
    preload,
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
