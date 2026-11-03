/**
 * How far bottom-anchored `position: fixed` controls are from where the visible area ends, so they can follow it.
 *
 * iOS Safari lays fixed elements out against a container that it updates late while its toolbar grows and shrinks
 * (scrolling up brings the tab bar back; the controls then sit under it, or float above it, until the toolbar has
 * settled), whereas the visual viewport reports the new size at once. The error is measured, not assumed: a 1px fixed
 * probe in the bottom-left corner (never at an edge's centre, where Safari samples) shares the controls' container, so
 * the gap between the visual viewport's bottom and the probe's bottom is exactly how far the controls are off.
 *
 * Subscribers get that gap in px (positive: the controls should move DOWN by it). It is re-measured every frame while
 * it is not zero (the container catching up fires no event), and never when it is. SSR-safe; on a browser without a
 * visual viewport, or where the two agree (desktop), it is always 0 and nothing is written.
 */

type Listener = (px: number) => void;

const listeners = new Set<Listener>();
let probe: HTMLElement | null = null;
let frame = 0;
let value = 0;
let busyFrames = 0;
/** Re-measure for at most this many frames after an event: a stuck non-zero reading must not spin forever. */
const MAX_FRAMES = 180;

function measure(): number {
  const vv = window.visualViewport;
  if (!vv || !probe) return 0;
  const gap = vv.offsetTop + vv.height - probe.getBoundingClientRect().bottom;
  return Math.abs(gap) < 0.5 ? 0 : Math.round(gap * 2) / 2;
}

function tick() {
  frame = 0;
  const next = measure();
  if (next !== value) {
    value = next;
    for (const fn of listeners) fn(next);
  }
  if (value !== 0 && busyFrames++ < MAX_FRAMES) frame = requestAnimationFrame(tick);
}

function schedule() {
  busyFrames = 0;
  if (!frame) frame = requestAnimationFrame(tick);
}

function start() {
  probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:1px;height:1px;pointer-events:none;visibility:hidden;contain:strict';
  document.body.appendChild(probe);
  const vv = window.visualViewport;
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();
}

function stop() {
  const vv = window.visualViewport;
  vv?.removeEventListener('resize', schedule);
  vv?.removeEventListener('scroll', schedule);
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  probe?.remove();
  probe = null;
  value = 0;
}

/** The latest measured shift (0 until something subscribes). */
export function currentViewportShift(): number {
  return value;
}

/** Subscribe to the shift. The listener is called with the current value at once, then on every change. */
export function subscribeViewportShift(fn: Listener): () => void {
  if (typeof window === 'undefined') return () => {};
  if (listeners.size === 0) start();
  listeners.add(fn);
  fn(value);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) stop();
  };
}

/** Elements that follow the shift without a hook of their own: the floating stack's members and anything that opts in. */
export const FOLLOW_SELECTOR = '[data-floating], [data-vv-follow]';

type FollowRoot = Pick<ParentNode, 'querySelectorAll'>;

/**
 * Write the shift as `--vv-shift` on every element matching {@link FOLLOW_SELECTOR}, so a bottom-anchored fixed element
 * needs only `bottom: calc(… - var(--vv-shift, 0px))` to stay on the visible area while Safari's toolbar changes size,
 * like the hub orb and the compose button always did through `useViewportShift`. Before this, only those three
 * subscribed: the cookie bar, the mini-player, the party bar and every other `.bottom-above-dock` element followed
 * Safari's late fixed container and trailed the tab bar by however long it took to catch up.
 *
 * The values go on the elements themselves, never on `<html>` (a changing inherited property there restyles the
 * whole tree every frame). `subscribe` is injectable for tests. Returns the stop, which clears the property again.
 */
export function followViewportShift(
  root: FollowRoot,
  subscribe: (fn: Listener) => () => void = subscribeViewportShift,
): () => void {
  const write = (px: number) => {
    for (const el of root.querySelectorAll<HTMLElement>(FOLLOW_SELECTOR)) {
      if (px === 0) el.style.removeProperty('--vv-shift');
      else el.style.setProperty('--vv-shift', `${px}px`);
    }
  };
  const stop = subscribe(write);
  return () => {
    stop();
    write(0);
  };
}

/**
 * {@link followViewportShift} for the document, plus: a matching element that mounts while a shift is in force (a cookie
 * bar after hydration, a mini-player when a song starts) takes it at once instead of waiting for the next change.
 */
export function installViewportFollow(doc: Document = document): () => void {
  if (typeof window === 'undefined') return () => {};
  const stop = followViewportShift(doc);
  let observer: MutationObserver | null = null;
  if (typeof MutationObserver !== 'undefined' && doc.body) {
    observer = new MutationObserver((records) => {
      const px = currentViewportShift();
      if (px === 0) return;
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.matches(FOLLOW_SELECTOR)) n.style.setProperty('--vv-shift', `${px}px`);
          for (const el of n.querySelectorAll<HTMLElement>(FOLLOW_SELECTOR))
            el.style.setProperty('--vv-shift', `${px}px`);
        }
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
  }
  return () => {
    observer?.disconnect();
    stop();
  };
}
