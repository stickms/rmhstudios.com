'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { hasFrostedOverlay, subscribeFrostedOverlay } from '@/hooks/useFrostedOverlay';

/**
 * The pointer metaball — a gooey liquid drop that rides under the mouse.
 *
 * ## Where it runs
 *
 * Fine pointers only ({@link FINE_POINTER}). It is a *cursor*: on a phone there
 * is nothing to replace, and a drop that chases a finger is a per-frame SVG
 * filter bought with a phone's battery for a mark the finger is already
 * covering. Touch pointer events are ignored even on a hybrid machine, so a
 * touchscreen laptop keeps the drop for its mouse and never teleports it to a
 * tap.
 *
 * ## Why it paints a shape and nothing else
 *
 * The obvious cheap goo is a CSS one: an opaque plate behind white blobs, then
 * `filter: blur() contrast()` to threshold them into a fused silhouette. It
 * needs `mix-blend-mode: difference` to hide the plate — black being the
 * identity element of `difference` — and that is the trap. The trick only holds
 * while the compositor blends against the *true* page backdrop; the moment the
 * layer gets its own render surface (which GPU compositing decides, not us) the
 * plate stops cancelling and the whole box shows up as a bright rectangle
 * following the pointer. It is not reproducible under software rasterisation,
 * which makes it exactly the kind of bug you cannot test your way out of.
 *
 * So there is no plate and no blend mode. An SVG **alpha ramp** does the fusing
 * — blur, then a steep contrast curve on the alpha channel alone — which emits
 * the fused silhouette and *transparency everywhere else*. There is no box to
 * reveal, on any compositing path.
 *
 * Legibility then has to come from the shape itself rather than from inverting
 * the backdrop: the drop is filled with the theme's ink and carries a halo in
 * the theme's background colour — a rim built from filter primitives (dilate the
 * fused alpha, flood it, merge it underneath), all inside the one filter. Those
 * two tokens are contrast-paired by definition, so the drop reads on the page
 * *and* on an accent-filled control, in every theme.
 *
 * The halo used to be two CSS `drop-shadow()`s chained after this filter in CSS.
 * Never do that: chaining a shorthand filter function after a `url()` reference
 * takes Chromium off its fast path badly enough to block the main thread outright
 * (measured — see the note on `.metaball` in `radial.css`), and the dilated rim
 * reads as a cleaner ring than two stacked blurs did anyway.
 *
 * Dropping the blend is also a straight win: blending forces the compositor to
 * read back the backdrop under a moving layer every single frame.
 *
 * ## What keeps it cheap
 *
 * - **A small, bounded filter region.** Cost scales with area, so the box is
 *   fixed at {@link BOX}px and every blob offset is clamped inside it — the tail
 *   can stretch but can never escape (or grow) the region being filtered.
 * - **It stops.** The loop runs only while a spring is still converging, and
 *   drops its `will-change` at rest, so a parked pointer costs nothing and the
 *   filter is not re-evaluated.
 * - **Frame-rate independent easing.** Each spring converges at a fixed rate
 *   *per second* (`1 - e^(-λ·dt)`), not per frame. On a 144Hz screen the drop
 *   follows exactly the same curve it does at 60Hz instead of snapping to the
 *   pointer, and a dropped frame doesn't produce a visible jump.
 * - **It stands down under a full-screen frosted overlay.** See
 *   {@link subscribeFrostedOverlay} for the measurements: a `backdrop-filter`
 *   layer is re-blurred *in full* whenever anything above it moves, so the drop
 *   and a viewport-covering scrim together cost 6× the frame time — which, since
 *   the drop IS the cursor, is felt as the cursor lagging. While one is up the
 *   pointer goes back to the OS as {@link stillCursorValue}, a still image of the
 *   drop: same mark, drawn by the compositor, zero page damage.
 *
 * It renders into `document.body` so it sits outside `.radial-shell`'s isolated
 * stacking context and its z-index can be reasoned about against the page rather
 * than against the shell's internal layers.
 *
 * Behaviours: swells over interactive elements, narrows into a caret over text
 * fields (which is why hiding the native cursor stays usable), and — like macOS —
 * blows up when you shake the pointer to find it.
 */

/**
 * The drop is a replacement for a cursor, so it runs exactly where there is one
 * to replace. `hover: hover` rules out the "coarse pointer that can still
 * hover" cases (some TV remotes / stylus modes) that `pointer: fine` alone lets
 * through.
 */
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/**
 * Filter-region size (px). Also the hard bound on how far the tail can lag.
 *
 * Cost here is **quadratic in this number** — every frame the pointer moves,
 * the whole region goes through the goo (blur + alpha ramp) plus the two halo
 * passes. It was 220 with the filter region padded to 140% (308² ≈ 95k px);
 * it is now 168 with the region at 104% (175² ≈ 31k px), a ~3× cut for a tail
 * that is ~50px instead of ~70px at speed. The arithmetic that keeps the drop
 * inside the region at every extreme (shake, swell, caret, touch) is in
 * {@link BLUR_PAD}'s clamp — see the `reach` computation in the loop.
 */
const BOX = 168;
const HALF = BOX / 2;
/**
 * Room reserved inside the box for the goo blur's spill, so nothing clips.
 * σ=4 spills ~3σ = 12px; 20 leaves margin and doubles as the lag bound.
 */
const BLUR_PAD = 20;
/** Id of this component's own goo filter (it does not share the shell's bank). */
const GOO_ID = 'rmh-pointer-goo';
/**
 * How far the filter's `feMorphology` dilates the fused alpha to draw the halo,
 * in px. Shared with {@link stillCursorValue} so the still image and the live
 * drop cannot end up with different rims.
 */
const RIM = 2;

/**
 * Blob diameters (px) and their convergence rate λ (per second). The lead blob
 * tracks the pointer closely; the trailing ones lag, so the goo fuses them into
 * a drop that stretches when you move fast and settles to a dot when you stop.
 * λ values are picked so the feel matches the old per-frame factors at 60Hz
 * (0.4 / 0.24 / 0.15) while staying identical at any other refresh rate.
 */
const BLOBS = [
  { d: 16, lambda: 34 },
  { d: 11, lambda: 20 },
  { d: 7, lambda: 12 },
];

/**
 * How much the drop grows over an interactive element / while shaking.
 *
 * The swell used to be 0.85, taking the 16px lead blob to ~30px — the drop was
 * at its LARGEST precisely when it was sitting on a control's label ("Play now"
 * read as "▷ ●now"). 0.375 caps the swollen lead at ~22px, which still reads as
 * a deliberate response without covering the thing it is pointing at. The fill
 * also thins as it swells (see --metaball-swell in radial.css), so what remains
 * over a label is closer to a rim than a blot.
 */
const SWELL_GAIN = 0.375;
const SHAKE_GAIN = 2.4;

const HOVER_SELECTOR =
  'a, button, [role="button"], [role="menuitem"], [role="tab"], [role="switch"], summary, label, select, [data-metaball]';
const TEXT_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="color"]):not([type="file"]), textarea, [contenteditable="true"], [contenteditable=""]';

/** Shake-to-find: a reversal counts only above this speed (px/s). */
const SHAKE_SPEED = 900;
/** Direction reversals needed inside SHAKE_WINDOW to trigger the blow-up. */
const SHAKE_REVERSALS = 4;
const SHAKE_WINDOW = 700;
/** How long the enlarged state holds after the last qualifying reversal. */
const SHAKE_HOLD = 900;

/**
 * The drop at rest, as a **native cursor image** — the value for a `cursor`
 * declaration, hotspot included.
 *
 * Used while a full-screen frosted overlay is up, where a page-painted pointer
 * costs the whole viewport's `backdrop-filter` every frame (see
 * `hooks/useFrostedOverlay`). Handing the same mark to the OS keeps the design's
 * "the drop IS the cursor" rule — the alternative is the bare arrow reappearing
 * every time a dialog opens — while the compositor draws it for free.
 *
 * The geometry is the live drop's own resting state: the lead blob, plus the
 * filter's dilated rim in the background colour. The colours are resolved
 * through a throwaway element rather than by reading the custom properties
 * directly, because a theme is free to author `--site-text` as a `color-mix()`
 * of other tokens — cascade resolution collapses that to one concrete colour,
 * which is what an SVG inside a `data:` URI needs (it cannot see this document's
 * variables). Verified in Chromium: `oklch()`, `color-mix()` and hex all paint.
 */
function stillCursorValue(): string {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0';
  document.body.appendChild(probe);
  probe.style.color = 'var(--site-text)';
  const ink = getComputedStyle(probe).color;
  probe.style.color = 'var(--site-bg)';
  const halo = getComputedStyle(probe).color;
  probe.remove();

  const r = BLOBS[0].d / 2;
  const rim = r + RIM;
  const size = Math.ceil(rim * 2) + 2; // 1px of margin so the rim can't clip
  const c = size / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${c}" cy="${c}" r="${rim}" fill="${halo}"/>` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="${ink}"/></svg>`;
  // `auto` is the mandatory keyword fallback — a cursor image the UA refuses
  // (too large, failed to decode) must not leave the page with no pointer.
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${c} ${c}, auto`;
}

export function MetaballCursor() {
  const reduced = useReducedMotion();
  const finePointer = useMediaQuery(FINE_POINTER);
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const blobRefs = useRef<HTMLSpanElement[]>([]);

  // The portal target only exists on the client.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // No cursor, no cursor replacement — phones and tablets never mount the
    // loop, the filter, or the listeners. `useMediaQuery` is live, so plugging a
    // mouse into a tablet turns the drop on without a reload.
    if (reduced || !finePointer || typeof window === 'undefined') {
      setEnabled(false);
      return;
    }
    const mm = window.matchMedia?.bind(window);
    // Forced-colors and reduce-transparency users get no blend layer at all —
    // both modes exist precisely to remove effects like this one.
    if (mm?.('(forced-colors: active)').matches) return;
    if (mm?.('(prefers-reduced-transparency: reduce)').matches) return;
    // Very low-memory devices skip it: a per-frame blend is the wrong thing to
    // spend their budget on. `deviceMemory` is Chromium-only; absent = allowed.
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof memory === 'number' && memory > 0 && memory < 4) return;
    setEnabled(true);
  }, [reduced, finePointer]);

  useEffect(() => {
    if (!enabled) return;
    const box = boxRef.current;
    const blobs = blobRefs.current;
    if (!box || blobs.length === 0) return;
    const root = document.documentElement;

    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    const pos = BLOBS.map(() => ({ x: cx, y: cy }));

    let visible = false;
    let swell = 0;
    let swellTarget = 0;
    let caret = 0;
    let caretTarget = 0;
    let shake = 0;
    let press = 0;
    let pressTarget = 0;
    /** True while a viewport-covering frosted layer is up — see `onFrostChange`. */
    let stoodDown = hasFrostedOverlay();

    // Shake detection state.
    let vx = 0;
    let vy = 0;
    let lastMoveAt = 0;
    let shakeUntil = 0;
    const reversals: number[] = [];

    let raf = 0;
    let last = 0;
    /** Last value written to `--metaball-swell`, so an unchanged frame skips it. */
    let swellWritten = -1;
    /** Last element `onOver` probed, so re-entering it skips the selector walks. */
    let overTarget: Element | null = null;

    /**
     * Who is drawing the pointer:
     *   `'on'`    the page is — the live drop, native cursor hidden;
     *   `'still'` the OS is — a still image of the drop (see `stillCursorValue`),
     *             which is what a full-screen frosted overlay demands;
     *   `null`    the OS is, with its own cursors (pointer has left, or the drop
     *             is torn down — the page must never be left without a pointer).
     */
    const setNativeCursor = (by: 'on' | 'still' | null) => {
      if (by === null) {
        root.removeAttribute('data-metaball-cursor');
        root.style.removeProperty('--metaball-still');
        return;
      }
      // Rebuilt per stand-down rather than cached: it costs two style reads at
      // the moment a menu opens, and a cache would have to be invalidated on
      // every theme, preset and contrast change to stay honest.
      if (by === 'still') root.style.setProperty('--metaball-still', stillCursorValue());
      root.setAttribute('data-metaball-cursor', by);
    };

    const tick = (now: number) => {
      raf = 0;
      // Clamp dt so a backgrounded tab (or a long GC pause) resumes smoothly
      // instead of teleporting every spring to its target in one frame.
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      /** Frame-rate independent convergence: the same curve at 60Hz and 240Hz. */
      const ease = (lambda: number) => 1 - Math.exp(-lambda * dt);

      const shakeTarget = now < shakeUntil ? 1 : 0;
      swell += (swellTarget - swell) * ease(9);
      caret += (caretTarget - caret) * ease(11);
      press += (pressTarget - press) * ease(16);
      // Grows fast, relaxes slowly — the macOS feel.
      shake += (shakeTarget - shake) * ease(shakeTarget > shake ? 16 : 5);

      box.style.transform = `translate3d(${(cx - HALF).toFixed(1)}px, ${(cy - HALF).toFixed(1)}px, 0)`;
      // Drives the fill's thinning while swollen — see .metaball__blob. This one
      // is a custom property feeding an inherited `calc()` on all three blobs, so
      // writing it recomputes their style; the drop is usually moving with a
      // settled swell, so only write it when it has actually moved.
      if (Math.abs(swell - swellWritten) > 0.002) {
        swellWritten = swell;
        box.style.setProperty('--metaball-swell', swell.toFixed(3));
      }

      const grow = (1 + swell * SWELL_GAIN + shake * SHAKE_GAIN) * (1 - press * 0.18);
      let moving = false;

      for (let i = 0; i < blobs.length; i++) {
        const { d, lambda } = BLOBS[i];
        const p = pos[i];
        const k = ease(lambda);
        p.x += (cx - p.x) * k;
        p.y += (cy - p.y) * k;

        // Trailing blobs collapse into the lead as it narrows to a caret.
        const tailFade = i === 0 ? 1 : 1 - caret;
        const sx = grow * (i === 0 ? 1 - 0.62 * caret : tailFade);
        const sy = grow * (i === 0 ? 1 + 1.25 * caret : tailFade);

        // Hard bound: clamp the lag so no blob (at its current size, plus the
        // blur's spill) can ever reach the edge of the filter region. Writing the
        // clamp back into `pos` also stops a fast flick from building up a lag
        // the spring then has to unwind.
        const reach = Math.max(0, HALF - (d * Math.max(sx, sy)) / 2 - BLUR_PAD);
        let ox = p.x - cx;
        let oy = p.y - cy;
        const dist = Math.hypot(ox, oy);
        if (dist > reach && dist > 0) {
          const scale = reach / dist;
          ox *= scale;
          oy *= scale;
          p.x = cx + ox;
          p.y = cy + oy;
        }
        if (dist > 0.3) moving = true;

        blobs[i].style.transform =
          `translate3d(${(HALF + ox - d / 2).toFixed(1)}px, ${(HALF + oy - d / 2).toFixed(1)}px, 0)` +
          ` scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
      }

      const settling =
        Math.abs(swellTarget - swell) > 0.005 ||
        Math.abs(caretTarget - caret) > 0.005 ||
        Math.abs(pressTarget - press) > 0.005 ||
        Math.abs(shakeTarget - shake) > 0.005;

      if (moving || settling) {
        raf = requestAnimationFrame(tick);
      } else {
        // Idle: drop the compositor layer hints so a parked cursor costs nothing.
        box.style.willChange = 'auto';
        for (const b of blobs) b.style.willChange = 'auto';
      }
    };

    const ensure = () => {
      if (raf || stoodDown) return;
      box.style.willChange = 'transform';
      for (const b of blobs) b.style.willChange = 'transform';
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const show = () => {
      if (visible) return;
      visible = true;
      box.style.opacity = '1';
      if (!stoodDown) setNativeCursor('on');
    };

    const hide = () => {
      visible = false;
      box.style.opacity = '0';
      setNativeCursor(stoodDown ? 'still' : null);
    };

    /**
     * A full-screen frosted layer went up or came down.
     *
     * Standing down is `display: none`, not a fade: a fade is 250ms of exactly
     * the moving-pixels-above-a-backdrop-filter that costs the whole viewport's
     * blur per frame, and it would land on the menu's opening transition — the
     * most expensive moment there is. The rAF loop stops, but `onMove` keeps
     * writing `cx`/`cy` (that part is free), so coming back the springs snap to
     * where the pointer actually is instead of gliding in from where the drop
     * was parked when the overlay went up.
     */
    const onFrostChange = () => {
      const next = hasFrostedOverlay();
      if (next === stoodDown) return;
      stoodDown = next;
      if (stoodDown) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        box.style.display = 'none';
        box.style.willChange = 'auto';
        for (const b of blobs) b.style.willChange = 'auto';
        setNativeCursor('still');
        return;
      }
      box.style.display = '';
      for (const p of pos) {
        p.x = cx;
        p.y = cy;
      }
      // The pointer may have crossed anything at all while the overlay was up.
      overTarget = null;
      reversals.length = 0;
      shakeUntil = 0;
      setNativeCursor(visible ? 'on' : null);
      ensure();
    };

    /** Feed the shake detector. Returns nothing; updates `shakeUntil`. */
    const trackShake = (x: number, y: number, now: number) => {
      const dt = (now - lastMoveAt) / 1000;
      lastMoveAt = now;
      if (dt <= 0 || dt > 0.12) {
        // First move, or a long pause — no meaningful velocity to compare to.
        vx = 0;
        vy = 0;
        return;
      }
      const nvx = (x - cx) / dt;
      const nvy = (y - cy) / dt;
      const speed = Math.hypot(nvx, nvy);
      const prevSpeed = Math.hypot(vx, vy);
      if (speed > SHAKE_SPEED && prevSpeed > SHAKE_SPEED && nvx * vx + nvy * vy < 0) {
        reversals.push(now);
      }
      // Light smoothing keeps hand tremor from registering as a reversal.
      vx = nvx * 0.7 + vx * 0.3;
      vy = nvy * 0.7 + vy * 0.3;

      while (reversals.length > 0 && now - reversals[0] > SHAKE_WINDOW) reversals.shift();
      if (reversals.length >= SHAKE_REVERSALS) shakeUntil = now + SHAKE_HOLD;
    };

    /**
     * A hybrid machine (touchscreen laptop, iPad with a trackpad) matches
     * {@link FINE_POINTER} and still delivers touch events. The drop belongs to
     * the mouse there — a tap must not teleport it to the finger.
     */
    const isTouch = (e: PointerEvent) => e.pointerType === 'touch';

    const onMove = (e: PointerEvent) => {
      if (isTouch(e)) return;
      trackShake(e.clientX, e.clientY, performance.now());
      cx = e.clientX;
      cy = e.clientY;
      show();
      ensure();
    };

    const onOver = (e: PointerEvent) => {
      if (isTouch(e)) return;
      const target = (e.target as Element | null) ?? null;
      // `pointerover` fires on every element boundary the pointer crosses, and
      // both selectors below are long lists walked up the whole ancestor chain.
      // Skip the walk when the target is the one already probed, and only kick
      // the loop when a target actually changed — moving across inert markup
      // (two plain <span>s in a paragraph) must not restart it just to re-run
      // the filter on a drop that is already at rest.
      if (target === overTarget) return;
      overTarget = target;
      const nextCaret = target?.closest?.(TEXT_SELECTOR) ? 1 : 0;
      const nextSwell = !nextCaret && target?.closest?.(HOVER_SELECTOR) ? 1 : 0;
      if (nextCaret === caretTarget && nextSwell === swellTarget) return;
      caretTarget = nextCaret;
      swellTarget = nextSwell;
      ensure();
    };

    const onDown = (e: PointerEvent) => {
      if (isTouch(e)) return;
      pressTarget = 1;
      ensure();
    };

    const onUp = (e: PointerEvent) => {
      if (isTouch(e)) return;
      pressTarget = 0;
      ensure();
    };

    const onLeave = (e: PointerEvent) => {
      // relatedTarget === null means the pointer actually left the window.
      if (e.relatedTarget) return;
      hide();
    };

    const onBlur = () => hide();
    const onVisibility = () => {
      if (document.hidden) hide();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    const unsubscribeFrost = subscribeFrostedOverlay(onFrostChange);
    // An overlay can already be up when the drop mounts (a route change under an
    // open dialog); `stoodDown` was seeded from it, so apply that state now.
    if (stoodDown) box.style.display = 'none';

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribeFrost();
      if (raf) cancelAnimationFrame(raf);
      // Never leave the page without a pointer.
      setNativeCursor(null);
    };
  }, [enabled]);

  if (!enabled || !mounted) return null;

  return createPortal(
    <>
      {/* The goo: blur, then a steep ramp on the ALPHA channel only, so nearby
          blobs fuse with a smooth neck and everything outside the silhouette
          stays fully transparent. Deliberately not `feBlend`-ed back over
          SourceGraphic — compositing the sharp originals on top would put hard
          blob edges inside the fused shape. */}
      <svg className="metaball-defs" width="0" height="0" aria-hidden focusable="false">
        <defs>
          {/* The region is the box plus a hair for the rim's dilation, NOT the
              default -10%/120% and not the 140% this once declared. The loop
              clamps every blob to `HALF − size/2 − BLUR_PAD`, so the fused
              silhouette plus the blur's spill provably fits inside the border
              box — padding the region just blurs empty pixels, and the region's
              area is the whole cost of this component. */}
          <filter
            id={GOO_ID}
            x="-4%"
            y="-4%"
            width="108%"
            height="108%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            {/* The halo, in ONE cheap pass. It used to be two CSS
                `drop-shadow()`s chained after this filter in `radial.css`, and
                that chain — not the goo — was what made the drop feel slow:
                measured with vsync off, `url(#goo)` alone runs at 0.4ms/frame,
                while adding the drop-shadows blew the frame budget so badly the
                harness could not finish 700 frames in 60s. Chaining a CSS filter
                function after a `url()` reference drops Chromium off its fast
                path; keeping the whole graph inside the one SVG filter does not.

                Same rim, no Gaussian: dilate the FUSED alpha (so the rim traces
                the merged silhouette, not each blob), flood it with the page
                background, and merge it UNDER the ink. Dilation is a hard edge,
                which reads as a more definite ring than two stacked blurs did. */}
            <feMorphology in="goo" operator="dilate" radius="2" result="rimAlpha" />
            <feFlood style={{ floodColor: 'var(--site-bg)' }} result="rimFill" />
            <feComposite in="rimFill" in2="rimAlpha" operator="in" result="rim" />
            <feMerge>
              <feMergeNode in="rim" />
              <feMergeNode in="goo" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <div className="metaball" ref={boxRef} aria-hidden style={{ width: BOX, height: BOX }}>
        {BLOBS.map((b, i) => (
          <span
            key={i}
            className="metaball__blob"
            ref={(el) => {
              if (el) blobRefs.current[i] = el;
            }}
            style={{ width: b.d, height: b.d }}
          />
        ))}
      </div>
    </>,
    document.body,
  );
}
