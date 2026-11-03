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
