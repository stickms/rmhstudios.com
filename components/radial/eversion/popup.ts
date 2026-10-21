/**
 * The globe that pops up out of whatever was pressed to navigate (amended 2026-10-21).
 *
 * The owner: "not a single page transition should be without eversion … even on non globe [navigation], have the
 * globe pop up smoothly and seamlessly". A link, a card, a button that navigates, the browser's back button: none of
 * them has the hub's globe to hand over to the effect, so this is the globe they get. It blooms out of the press
 * point the moment the navigation is asked for — the destination renders and is captured behind the frozen page
 * meanwhile, which is the run's own wait — and is then handed over EXACTLY as the hub's globe is (`radial.css`,
 * `data-eversion-swell`): from the effect's first frame it swells and travels on the sphere's own curve
 * (`--eversion-ease-wrap`) to land on it, and dissolves into it over the second half of WRAP. The effect's sphere
 * starts at this globe's pose (`pose()`), so the page wraps onto the globe the visitor is looking at.
 *
 * Plain DOM, not React: it must be on screen in the frame the press lands, with no render in between, on every
 * route, shell or not. One element, styled in `eversion.css`; everything that moves is `scale`, `transform` or
 * `opacity` on it (the compositor), written once per state, never per frame.
 */

import type { EversionHandover, GlobeStartState } from '@/lib/eversion/types';

/** The globe's radius: a fraction of the short side, never smaller than a fingertip nor larger than the hub's. */
export function popupRadius(w: number, h: number): number {
  return Math.round(Math.min(Math.max(Math.min(w, h) * 0.14, 48), 112));
}

/** Margin (px) kept between the globe and the viewport's edge. */
const EDGE = 12;

/** Where the globe sits for a press at (x, y): on the press, pulled in just enough to be whole on screen. */
export function popupCentre(
  origin: { x: number; y: number } | null,
  w: number,
  h: number,
  r: number,
): [number, number] {
  const at = origin ?? { x: w / 2, y: h / 2 };
  const clamp = (v: number, lo: number, hi: number) =>
    lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi);
  return [clamp(at.x, r + EDGE, w - r - EDGE), clamp(at.y, r + EDGE, h - r - EDGE)];
}

/** The bloom's length: `--evert-pop-in` (globals.css §7.3), the landing spring's settle time. */
const BLOOM_FALLBACK_MS = 600;
/** The shrink back into the press point when the run cannot go on. */
const DISMISS_MS = 320;

export interface Popup {
  /** The globe's pose, for the effect's sphere to start from. */
  pose(): GlobeStartState;
  /** Resolves once the bloom has landed (the run hands the globe over only from rest). */
  ready(): Promise<void>;
  /** The run's commit: the hand-over's geometry and timing. */
  everting(handover?: EversionHandover): void;
  /** The effect's first frame is up: swell into the sphere with it. */
  swelling(): void;
  /** The run is over; the globe has long dissolved into it. */
  closed(): void;
  /** No run after all: fold back into the press point. */
  dismiss(): void;
}

let current: HTMLElement | null = null;

/** Pop the globe up out of `origin` (client px), or the viewport's centre. Replaces one already up. */
export function showPopup(origin: { x: number; y: number } | null): Popup {
  current?.remove();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const r = popupRadius(w, h);
  const [cx, cy] = popupCentre(origin, w, h, r);
  const el = document.createElement('div');
  el.className = 'evert-popup';
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--popup-x', `${(cx - r).toFixed(1)}px`);
  el.style.setProperty('--popup-y', `${(cy - r).toFixed(1)}px`);
  el.style.setProperty('--popup-size', `${2 * r}px`);
  // The bloom grows out of the press itself, which the clamp may have moved off the globe's centre.
  const ox = origin ? Math.min(Math.max(origin.x - (cx - r), 0), 2 * r) : r;
  const oy = origin ? Math.min(Math.max(origin.y - (cy - r), 0), 2 * r) : r;
  el.style.setProperty('--popup-ox', `${ox.toFixed(1)}px`);
  el.style.setProperty('--popup-oy', `${oy.toFixed(1)}px`);
  for (let i = 0; i < 3; i++) {
    const meridian = document.createElement('span');
    meridian.className = 'evert-popup__meridian';
    el.appendChild(meridian);
  }
  const equator = document.createElement('span');
  equator.className = 'evert-popup__equator';
  el.appendChild(equator);
  document.body.appendChild(el);
  current = el;

  let landed = false;
  const ready = new Promise<void>((resolve) => {
    const done = () => {
      landed = true;
      el.removeEventListener('animationend', onEnd);
      resolve();
    };
    const onEnd = (e: AnimationEvent) => {
      if (e.target === el && e.animationName === 'evert-popup-in') done();
    };
    el.addEventListener('animationend', onEnd);
    setTimeout(done, BLOOM_FALLBACK_MS + 100);
  });

  const remove = () => {
    el.remove();
    if (current === el) current = null;
  };

  return {
    pose: () => ({ yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0, centre: [cx, cy], radius: r }),
    ready: () => (landed ? Promise.resolve() : ready),
    everting(handover) {
      if (!handover) return;
      el.style.setProperty('--eversion-swell', String(handover.swell));
      el.style.setProperty('--eversion-dx', `${handover.dx}px`);
      el.style.setProperty('--eversion-dy', `${handover.dy}px`);
      el.style.setProperty('--eversion-wrap', `${handover.wrapMs}ms`);
    },
    swelling() {
      el.setAttribute('data-eversion-swell', '');
    },
    closed: remove,
    dismiss() {
      el.setAttribute('data-leaving', '');
      setTimeout(remove, DISMISS_MS + 50);
    },
  };
}
