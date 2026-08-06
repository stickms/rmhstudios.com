'use client';

/**
 * The shared canvas host for the three spatial views (3D terrain, 4D projection,
 * the globe).
 *
 * Each of them is one `<canvas>` with one frame loop, and all three have the
 * same four obligations — which is why they are solved once, here, rather than
 * three times with two of them subtly wrong:
 *
 *  1. **The backing store is sized outside the loop.** Assigning `canvas.width`
 *     reallocates and clears the buffer, so doing it per frame is both a large
 *     allocation and a guaranteed flash. It happens on mount and on a real
 *     resize, which is exactly when the size changed (design-language §12.1
 *     rule 4). The device-pixel ratio is clamped to 2 for the same reason the
 *     navigation globe clamps it: fill rate scales with the square of the ratio,
 *     and a wireframe gains nothing visible from a 3× buffer.
 *  2. **The loop stops.** It runs only while the canvas is on screen, in a
 *     foreground tab, and either animating or dirty. A view that has settled
 *     draws its last frame and then schedules nothing — so a page left open on
 *     the analytics panel is doing no work at all, which is the §17.3
 *     "animations always end" contract these files are allowlisted under.
 *  3. **Colour comes from the theme, resolved once.** The palette is read from
 *     the element's own computed style on mount, on resize, and when the theme
 *     class on `<html>` changes — never per frame, because reading a computed
 *     style is a style flush and doing it inside a draw loop is the classic way
 *     to turn a 2ms frame into a 20ms one.
 *  4. **Nothing allocates per frame.** The hook hands the renderer a single
 *     mutable frame object it reuses, and the renderers keep their own scratch
 *     buffers.
 *
 * Note what this is NOT: a pointer-position effect. §5.1.1 retired cursor-driven
 * *styling* — gradients and sheens that repaint an element at pointer rate. A
 * chart you rotate by dragging is a control, and the thing it moves is a camera,
 * not a decoration.
 */

import { useCallback, useEffect, useRef } from 'react';

/** Every colour a spatial view draws in, resolved to strings a canvas accepts. */
export interface StagePaint {
  /** The eight categorical hues, in `DEBT_CATEGORIES` order. */
  categories: string[];
  /** The five sequential steps, pale end first. */
  sequential: string[];
  /** The theme's text ink. Every lighter weight is `globalAlpha` on this. */
  ink: string;
  /** The theme's page background — the surface ring around a hovered mark. */
  surface: string;
}

/** What a renderer is handed each frame. The object is reused; never retain it. */
export interface StageFrame {
  /** CSS pixels. The context is already scaled, so draw in these. */
  width: number;
  height: number;
  paint: StagePaint;
  /** `performance.now()` for this frame. */
  nowMs: number;
  /** Seconds since the previous frame, clamped — safe to integrate against. */
  dt: number;
}

/**
 * A renderer draws one frame and says whether it needs another.
 *
 * The return value is the settle condition, and it lives here rather than in the
 * hook's arguments because only the renderer knows: a globe that has been thrown
 * is still coasting for a second after the pointer left, and a ripple outlives
 * the poke that made it. Both are states React never sees — they are integrated
 * in refs inside the loop — so a React-side `animate` flag cannot know when they
 * are finished. Returning `false` (or nothing) is what lets a view that has come
 * to rest stop scheduling frames entirely.
 */
export type StageRenderer = (ctx: CanvasRenderingContext2D, frame: StageFrame) => boolean | void;

const FALLBACK_PAINT: StagePaint = {
  categories: [
    'rgb(218 118 0)',
    'rgb(0 98 212)',
    'rgb(0 168 77)',
    'rgb(146 0 254)',
    'rgb(174 146 0)',
    'rgb(186 0 122)',
    'rgb(0 166 186)',
    'rgb(229 0 38)',
  ],
  sequential: [
    'rgb(250 156 78)',
    'rgb(236 127 31)',
    'rgb(213 104 0)',
    'rgb(187 83 0)',
    'rgb(161 63 0)',
  ],
  ink: 'rgb(20 20 20)',
  surface: 'rgb(255 255 255)',
};

const CATEGORY_VARS = [
  '--kd-cat-food',
  '--kd-cat-transit',
  '--kd-cat-rent',
  '--kd-cat-gear',
  '--kd-cat-gambling',
  '--kd-cat-emotional',
  '--kd-cat-temporal',
  '--kd-cat-other',
];

const SEQUENTIAL_VARS = ['--kd-seq-1', '--kd-seq-2', '--kd-seq-3', '--kd-seq-4', '--kd-seq-5'];

/**
 * Read the palette off an element.
 *
 * Falls back per token rather than wholesale: a browser that cannot resolve one
 * value should lose that one colour, not the whole palette. The fallbacks are
 * the same literals the stylesheet carries, so a failure here is invisible
 * rather than a chart drawn in black.
 */
function readPaint(el: Element): StagePaint {
  const cs = getComputedStyle(el);
  const token = (name: string, fallback: string) => {
    const value = cs.getPropertyValue(name).trim();
    return /^(rgb|rgba|#|color\()/i.test(value) ? value : fallback;
  };
  return {
    categories: CATEGORY_VARS.map((name, i) => token(name, FALLBACK_PAINT.categories[i]!)),
    sequential: SEQUENTIAL_VARS.map((name, i) => token(name, FALLBACK_PAINT.sequential[i]!)),
    // `color` is already a resolved colour on every engine — it is the one
    // channel that never needs the fallback dance above.
    ink: cs.color || FALLBACK_PAINT.ink,
    surface: token('--site-bg', FALLBACK_PAINT.surface),
  };
}

/** Device-pixel ceiling. See the note above; this is the site's canvas convention. */
const MAX_DPR = 2;

/**
 * Mount a canvas that draws through `render`.
 *
 * `animate` is the only thing that decides whether the loop keeps scheduling:
 * pass `false` for a view that is at rest and call `invalidate()` when something
 * it depends on changes. A view that animates continuously (the 4D rotation, the
 * globe's idle spin) passes `true` and still stops the moment it leaves the
 * screen or the tab goes to the background.
 */
export function useCanvasStage(
  render: StageRenderer,
  animate: boolean,
): {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Ask for one more frame. Cheap and idempotent — safe to call from an event. */
  invalidate: () => void;
} {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderRef = useRef(render);
  renderRef.current = render;
  const animateRef = useRef(animate);
  animateRef.current = animate;

  const dirtyRef = useRef(true);
  const kickRef = useRef<() => void>(() => {});

  const invalidate = useCallback(() => {
    dirtyRef.current = true;
    kickRef.current();
  }, []);

  // A new `animate` value has to be able to start a stopped loop. The loop
  // itself reads the ref, so this only ever needs to nudge it.
  useEffect(() => {
    if (animate) kickRef.current();
  }, [animate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let ctx: CanvasRenderingContext2D | null = null;
    let paint = FALLBACK_PAINT;
    const frame: StageFrame = { width: 0, height: 0, paint, nowMs: 0, dt: 0 };

    let raf = 0;
    let last = 0;
    let onScreen = true;

    /** Size the backing store. Never called from the frame loop — see the note. */
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const px = Math.round(width * dpr);
      const py = Math.round(height * dpr);
      if (canvas.width !== px || canvas.height !== py) {
        canvas.width = px;
        canvas.height = py;
      }
      ctx = canvas.getContext('2d');
      if (ctx) {
        // One transform for the whole view: device pixels out, origin at the
        // CENTRE — which is where all three renderers project to zero.
        ctx.setTransform(dpr, 0, 0, dpr, (width * dpr) / 2, (height * dpr) / 2);
        ctx.lineJoin = 'round';
      }
      frame.width = width;
      frame.height = height;
      dirtyRef.current = true;
    };

    const readTheme = () => {
      paint = readPaint(canvas);
      frame.paint = paint;
      dirtyRef.current = true;
    };

    const step = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;

      let wantsMore = false;
      if (ctx) {
        frame.nowMs = now;
        frame.dt = dt;
        // Clear in CSS pixels around the centred origin — the transform above
        // means the canvas spans ±half the box on each axis.
        ctx.clearRect(-frame.width / 2, -frame.height / 2, frame.width, frame.height);
        wantsMore = renderRef.current(ctx, frame) === true;
      }
      dirtyRef.current = false;

      // The settle condition: schedule another frame only while something is
      // genuinely moving — either React says so, or the renderer just said it
      // has not finished. This is what makes the loop bounded rather than
      // eternal, and it is why these files can be allowlisted honestly.
      if (wantsMore || animateRef.current || dirtyRef.current) schedule();
      else last = 0;
    };

    const schedule = () => {
      if (raf) return;
      if (!onScreen || document.visibilityState !== 'visible') return;
      raf = requestAnimationFrame(step);
    };

    kickRef.current = schedule;

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    };

    const sync = () => {
      if (onScreen && document.visibilityState === 'visible') {
        dirtyRef.current = true;
        schedule();
      } else {
        stop();
      }
    };

    measure();
    readTheme();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        measure();
        schedule();
      });
      resizeObserver.observe(canvas);
    }

    let intersectionObserver: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver((records) => {
        onScreen = records.some((record) => record.isIntersecting);
        sync();
      });
      intersectionObserver.observe(canvas);
    }

    // The theme is a class swap on <html>. Watching for it is what keeps a
    // canvas — which cannot inherit CSS the way an SVG mark does — from staying
    // in the previous theme's ink until the next resize.
    let themeObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined') {
      themeObserver = new MutationObserver(() => {
        readTheme();
        schedule();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      stop();
      kickRef.current = () => {};
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      themeObserver?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return { canvasRef, invalidate };
}

/**
 * Pointer position in CSS pixels relative to the canvas **centre** — the same
 * origin the context is transformed to, so a hit test compares against the very
 * numbers the renderer drew with.
 */
export function pointerOnStage(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
}
