/**
 * How much room a soft body has to bulge (spec 2026-11-03-globe-jelly-overhaul, "Clipping").
 *
 * The silhouette the shader draws extends past its host. It must never be cut off, so before it may bulge on a side
 * the engine measures that side's free room — the gap to the nearest clipping ancestor, to the viewport's left/right
 * edge, and half the gap to the nearest neighbouring body (so two bodies never overlap) — and caps the lattice there.
 *
 * Pure geometry: rects in, numbers out. The engine reads the rects once per rect refresh (never per frame); the DOM
 * helper {@link clippingAncestors} runs at activation.
 */

import type { Sides } from './lattice';

export interface RoomRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Horizontal extent of the viewport. Vertical viewport edges are not limits: a page scrolls, and a fixed edge simply hides. */
export interface ViewportX {
  left: number;
  right: number;
}

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/**
 * Free room on each side, CSS px, in `[0, margin]`. A host larger than a clipping ancestor, a clip edge at or inside the
 * host's edge, a neighbour touching it, and any non-finite input all give 0 on that side.
 */
export function roomFromRects(
  host: RoomRect,
  clips: readonly RoomRect[],
  viewport: ViewportX,
  neighbours: readonly RoomRect[],
  margin: number,
): Sides {
  const m = Math.max(0, finite(margin));
  let top = m;
  let right = m;
  let bottom = m;
  let left = m;
  const h = {
    left: finite(host.left),
    top: finite(host.top),
    right: finite(host.right),
    bottom: finite(host.bottom),
  };
  for (const c of clips) {
    top = Math.min(top, h.top - finite(c.top));
    right = Math.min(right, finite(c.right) - h.right);
    bottom = Math.min(bottom, finite(c.bottom) - h.bottom);
    left = Math.min(left, h.left - finite(c.left));
  }
  left = Math.min(left, h.left - finite(viewport.left));
  right = Math.min(right, finite(viewport.right) - h.right);
  for (const n of neighbours) {
    const overlapX = n.left < h.right && n.right > h.left;
    const overlapY = n.top < h.bottom && n.bottom > h.top;
    if (overlapX && overlapY) {
      // Overlapping bodies (a nested or stacked pair): no room toward each other.
      continue;
    }
    if (overlapX) {
      if (n.bottom <= h.top) top = Math.min(top, (h.top - n.bottom) / 2);
      else if (n.top >= h.bottom) bottom = Math.min(bottom, (n.top - h.bottom) / 2);
    } else if (overlapY) {
      if (n.right <= h.left) left = Math.min(left, (h.left - n.right) / 2);
      else if (n.left >= h.right) right = Math.min(right, (n.left - h.right) / 2);
    }
  }
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(m, v)) : 0);
  return { top: clamp(top), right: clamp(right), bottom: clamp(bottom), left: clamp(left) };
}

/** The clipped (padding-box) region of a clipping ancestor, from its border box rect and its border widths. */
export function clipRegion(
  rect: RoomRect,
  clientLeft: number,
  clientTop: number,
  clientWidth: number,
  clientHeight: number,
): RoomRect {
  const left = rect.left + clientLeft;
  const top = rect.top + clientTop;
  return { left, top, right: left + clientWidth, bottom: top + clientHeight };
}

/**
 * Ancestors of `el` that clip their content: any non-`visible` overflow on either axis, or paint containment. The
 * document element is not one (the viewport is handled separately); `body` is, since a page often sets
 * `overflow-x: hidden` there.
 */
export function clippingAncestors(
  el: Element,
  win: Pick<Window, 'getComputedStyle'>,
  root: Element,
): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
    const s = win.getComputedStyle(p);
    const clipsContent =
      (s.overflowX !== 'visible' && s.overflowX !== '') ||
      (s.overflowY !== 'visible' && s.overflowY !== '') ||
      /\b(paint|strict|content)\b/.test(s.contain);
    if (clipsContent) out.push(p);
  }
  return out;
}

/** Equal within `eps` px on every side (the engine's hysteresis, so a sub-pixel scroll does not wake a redraw). */
export function sameRoom(a: Sides, b: Sides, eps = 1): boolean {
  return (
    Math.abs(a.top - b.top) < eps &&
    Math.abs(a.right - b.right) < eps &&
    Math.abs(a.bottom - b.bottom) < eps &&
    Math.abs(a.left - b.left) < eps
  );
}
