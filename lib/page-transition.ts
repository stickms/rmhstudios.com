/**
 * Page transitions: one very quick, opacity-only swap on every navigation, and a still frame when the two pages
 * share one. Design: docs/superpowers/specs/2026-10-27-smooth-transitions-design.md.
 *
 * Nothing here animates anything itself. It classifies a navigation (`navKind`), stamps it on `<html>` while the old
 * page is leaving (`installPageTransitions`), and finishes the one-shot entrance animations a freshly mounted page
 * would otherwise replay (`finishEntranceAnimations`), so the only entrance left is the shared swap in globals.css.
 * No View Transitions: WebKit has them off on purpose (lib/view-transition.ts), and this must look the same there.
 */

import { SMOOTH_EASE_CSS } from '@/lib/motion';

export type ShellLayout = 'catalog' | 'workspace' | 'editorial' | 'social';
export type NavKind = 'sibling' | 'cross';

const seg = (group: string) => new RegExp(`^/(${group})(/|$)`);
const CATALOG = seg('store|games|apps|create|library');
const WORKSPACE = seg('messages|settings|admin|developer');
const EDITORIAL = seg('blog|news');

/** The shell's layout group for a path (the `data-layout` the radial shell stamps, shared so both agree). */
export function shellLayoutFor(pathname: string): ShellLayout {
  const path = pathname.split(/[?#]/)[0] || '/';
  if (CATALOG.test(path)) return 'catalog';
  if (WORKSPACE.test(path)) return 'workspace';
  if (EDITORIAL.test(path)) return 'editorial';
  return 'social';
}

/** Two pages in one layout group share their frame (title, tabs, filters): only the content should swap. */
export function navKind(fromPath: string, toPath: string): NavKind {
  return shellLayoutFor(fromPath) === shellLayoutFor(toPath) ? 'sibling' : 'cross';
}

/** The shared swap keyframes (app/globals.css). */
const SWAP_ANIMATION = 'page-enter';

/**
 * Finish every one-shot CSS animation inside `root` so it never paints: title rises, card rises, feed item enters.
 * Skips infinite loops, transitions, scroll/view-timeline reveals (other timeline) and anything under
 * `[data-keep-entrance]`. Returns how many it finished.
 */
export function finishEntranceAnimations(
  root: Element,
  animations: Iterable<Animation> = typeof document === 'undefined' ? [] : document.getAnimations(),
  timeline: AnimationTimeline | null = typeof document === 'undefined' ? null : document.timeline,
): number {
  let finished = 0;
  for (const a of animations) {
    if (!('animationName' in a)) continue; // a CSS transition or a script animation
    if ((a as CSSAnimation).animationName === SWAP_ANIMATION) continue; // the one entrance that is meant to paint
    if (a.timeline !== timeline) continue;
    const effect = a.effect;
    const target = effect && 'target' in effect ? (effect.target as Element | null) : null;
    if (!target || !root.contains(target)) continue;
    if ((effect!.getTiming().iterations ?? 1) !== 1) continue;
    if (target.closest('[data-keep-entrance]')) continue;
    try {
      a.finish();
      finished += 1;
    } catch {
      // An animation that cannot be finished is left to play.
    }
  }
  return finished;
}

/** How long after a commit late-arriving content (data resolving, a lazy chunk) is still treated as part of the page swap. */
const WATCH_MS = 800;

/**
 * After a commit, finish the entrances of content that mounts a moment LATER (a loader resolving, a lazy section, a
 * streamed list) so those do not replay as a second blink. Observes `root` for added nodes for {@link WATCH_MS}; the
 * returned disposer ends it early (the next navigation takes over). An observer callback is a microtask right after
 * the DOM change, so it runs before the browser paints the new nodes.
 */
export function watchEntrances(
  root: Element,
  opts: {
    animations?: () => Iterable<Animation>;
    timeline?: AnimationTimeline | null;
    ms?: number;
  } = {},
): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const animations = opts.animations ?? (() => document.getAnimations());
  const observer = new MutationObserver(() => {
    if (opts.timeline === undefined) finishEntranceAnimations(root, animations());
    else finishEntranceAnimations(root, animations(), opts.timeline);
  });
  observer.observe(root, { childList: true, subtree: true });
  const timer = setTimeout(() => observer.disconnect(), opts.ms ?? WATCH_MS);
  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}

/** Elements that are not page content: the floating compose button, headings, and anything that keeps its entrance. */
const NOT_CONTENT = '.radial-feed__compose, h1, [data-keep-entrance]';

const tokenNumber = (name: string, fallback: number) => {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * A tab switch with no route change (PageTabs' `value` changed): the content after the tab strip swaps with the same
 * quick dip as a navigation, by animating its siblings from `--swap-dim` to 1 over `--swap-in`, and the entrances
 * its new content mounted with are finished so nothing replays. The strip itself never moves.
 */
export function swapContentAfter(
  anchor: Element,
  opts: { dim?: number; ms?: number; finish?: (root: Element) => number } = {},
): void {
  const dim = opts.dim ?? tokenNumber('--swap-dim', 0.6);
  const ms = opts.ms ?? tokenNumber('--swap-in', 120);
  for (let n = anchor.nextElementSibling; n; n = n.nextElementSibling) {
    if (n.matches(NOT_CONTENT)) continue;
    n.animate([{ opacity: dim }, { opacity: 1 }], {
      duration: ms,
      easing: SMOOTH_EASE_CSS,
    });
    (opts.finish ?? finishEntranceAnimations)(n);
  }
}

let guardOff: (() => void) | null = null;

/** The longest a navigation may keep the guard armed on its own (a load that never commits). */
const GUARD_MAX_MS = 8000;

/**
 * Guard the page column against entrance animations for the next `ms`. Armed when a navigation STARTS (a nested
 * layout can remount, and replay its heading's rise, before the pathname commits) and again at the commit for
 * {@link WATCH_MS} more (data arriving). Re-arming replaces the previous guard.
 */
export function armEntranceGuard(ms: number = WATCH_MS): void {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
  guardOff?.();
  const root = document.querySelector('.page-root');
  guardOff = root ? watchEntrances(root, { ms }) : null;
}

interface RouterLike {
  subscribe: (event: never, fn: never) => () => void;
}

let pendingKind: NavKind | null = null;
/** Bumped by every start and every commit, so a grace timer can tell whether anything happened since it was set. */
let epoch = 0;
/** How long a resolved navigation may wait for its commit before the old page is un-dimmed (cancelled, same page). */
const COMMIT_GRACE_MS = 250;

/**
 * The browser-side half. When a navigation starts, the OLD page is marked as leaving (`html[data-page-leaving]` =
 * its kind), which CSS reads to dim it very quickly. `html[data-nav-kind]` is deliberately NOT set yet: it keys the
 * sibling entrance rules, and setting it while the old page is still mounted would make that page's content match
 * them and start a fresh enter animation under its own dim. {@link commitPageTransition} applies it once the new
 * page is in.
 */
export function installPageTransitions(router: RouterLike): () => void {
  if (typeof document === 'undefined') return () => {};
  const html = document.documentElement;
  const subscribe = router.subscribe as unknown as (
    event: string,
    fn: (e: { fromLocation?: { pathname: string }; toLocation: { pathname: string } }) => void,
  ) => () => void;
  const offStart = subscribe('onBeforeLoad', ({ fromLocation, toLocation }) => {
    epoch += 1;
    armEntranceGuard(GUARD_MAX_MS);
    pendingKind = navKind(fromLocation?.pathname ?? toLocation.pathname, toLocation.pathname);
    // Back/forward lands where you were (BackNavAnimation): no dim at all.
    if (html.classList.contains('nav-pop')) return;
    html.dataset.pageLeaving = pendingKind;
  });
  // Resolving is NOT the end of the leave: React commits the new page a moment AFTER `onResolved`, and un-dimming
  // here would flash the old page back to full opacity before it is replaced. The commit ends it
  // ({@link commitPageTransition}); this only covers a navigation that resolves without one.
  const offEnd = subscribe('onResolved', () => {
    const seen = epoch;
    setTimeout(() => {
      if (epoch === seen) delete html.dataset.pageLeaving;
    }, COMMIT_GRACE_MS);
  });
  return () => {
    offStart();
    offEnd();
    pendingKind = null;
    delete html.dataset.pageLeaving;
  };
}

/** Call in a layout effect right after a page commits: applies the kind to `<html>` and ends the leave. */
export function commitPageTransition(html: HTMLElement = document.documentElement): void {
  epoch += 1;
  html.dataset.navKind = pendingKind ?? 'cross';
  pendingKind = null;
  delete html.dataset.pageLeaving;
}
