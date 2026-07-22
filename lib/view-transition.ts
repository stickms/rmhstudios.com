'use client';

import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { isWebKit } from '@/lib/liquid-gl/trust';

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

// Only one native snapshot transition may own the document at a time. Keeping
// its complete cleanup here lets a second navigation (or a route-level recovery
// check) synchronously finish an interrupted predecessor instead of carrying a
// frozen pseudo-element or click-time shared-element name onto the next page.
let finishActiveTransition: (() => void) | null = null;

/**
 * End any in-flight native transition and clear its temporary document state.
 * Safe to call after ordinary route changes: it is a no-op once the transition
 * has settled normally.
 */
export function recoverViewTransition(): void {
  finishActiveTransition?.();
  finishActiveTransition = null;
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('vt-active', 'vt-liquid');
  }
}

/**
 * WebKit's View Transition implementation has no `skipTransition()` escape.
 * If capture or the DOM update wedges, its rendering freeze can outlive every
 * JS watchdog because those timers share the blocked main thread. Keep the
 * enhancement on engines where it can be synchronously abandoned; Safari
 * receives the same navigation and lightweight page/component animations,
 * just without the native snapshot morph.
 */
export function nativeViewTransitionsAllowed(ua: string): boolean {
  return !isWebKit(ua);
}

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
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
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
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (
    typeof doc.startViewTransition !== 'function' ||
    prefersReducedMotion() ||
    !nativeViewTransitionsAllowed(ua)
  ) {
    plain();
    return;
  }
  const root = document.documentElement;

  const startTransition = () => {
    // A quick second navigation must not inherit the first transition's source
    // name or snapshot. `finish()` below invokes skipTransition when available.
    recoverViewTransition();
    root.classList.add('vt-active');
    if (liquid) root.classList.add('vt-liquid');
    // `settle`/`cleanup` are idempotent: the skip path clears the liquid classes
    // synchronously (so the destination's normal enter animation runs at once,
    // not a stalled morph), and `transition.finished` later runs cleanup once —
    // the guard keeps `onSettled` (and the class removal) firing exactly once, so
    // the staggers never double-fire.
    let finished = false;
    let transition: ViewTransition | null = null;
    let budgetTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const finish = (skipSnapshot: boolean) => {
      if (finished) return;
      finished = true;
      if (budgetTimer) clearTimeout(budgetTimer);
      if (watchdog) clearTimeout(watchdog);
      // A browser-owned snapshot can outlive our DOM classes when `finished`
      // wedges. Explicitly drop it before releasing the source element name.
      if (skipSnapshot) {
        try {
          transition?.skipTransition?.();
        } catch {
          /* already settled / unsupported */
        }
      }
      root.classList.remove('vt-active', 'vt-liquid');
      settle();
      if (finishActiveTransition === abort) finishActiveTransition = null;
    };
    const abort = () => finish(true);
    finishActiveTransition = abort;
    try {
      let resolved = false;
      transition = doc.startViewTransition(() =>
        Promise.resolve(update()).finally(() => {
          resolved = true;
        }),
      );
      // Chromium safety net: if the destination is still pending past the budget,
      // drop the morph (the §17.2 preload pre-condition is the primary guard now,
      // and it is the ONLY one that works on WebKit).
      budgetTimer = setTimeout(() => {
        if (!resolved && typeof transition?.skipTransition === 'function') {
          abort();
        }
      }, SKIP_BUDGET_MS);
      // §17.3 VT watchdog: perform the FULL cleanup, including browser snapshot
      // cancellation and the caller's source-name restoration. The old watchdog
      // only removed root classes, which left stale glass elements behind.
      watchdog = setTimeout(abort, 1_200);
      transition.finished.then(() => finish(false), abort);
    } catch {
      abort();
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
