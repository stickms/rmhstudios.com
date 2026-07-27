'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The pointer metaball — a gooey liquid drop that rides under the pointer on
 * desktop and under the finger on touch.
 *
 * Three things make it cheap enough to run on every page:
 *
 * 1. **CSS goo, not an SVG filter.** `filter: blur() contrast()` is a plain GPU
 *    shader; `filter: url(#goo)` is an SVG filter graph, which Chromium
 *    re-evaluates on the main thread every time the filtered region moves. The
 *    box's own background is `#000`, which is the identity element of
 *    `mix-blend-mode: difference` — so the black plate (and the soft black halo
 *    the blur spills past the box) composites to *exactly* the backdrop, while
 *    the white blobs invert it. No visible box, no second layer.
 * 2. **A small, bounded filter region.** Filter + blend cost scales with area,
 *    so the box is fixed at {@link BOX}px and every blob offset is clamped
 *    inside it — the tail can stretch but can never escape (or grow) the region.
 * 3. **Frame-rate independent easing.** Each spring converges at a fixed rate
 *    *per second* (`1 - e^(-λ·dt)`), not per frame. On a 144Hz screen the drop
 *    follows exactly the same curve it does at 60Hz instead of snapping to the
 *    pointer, and a dropped frame doesn't produce a visible jump.
 *
 * It is rendered into `document.body` (not the shell) on purpose: `.radial-shell`
 * sets `isolation: isolate`, and a `difference` blend inside an isolated group
 * composites against the group's own (transparent) backdrop rather than the page,
 * which paints the drop white-on-white over any un-surfaced area. Body is opaque
 * (`background: var(--site-bg)`), so blending there is always legible.
 *
 * Behaviours: swells over interactive elements, narrows into a caret over text
 * fields (which is why hiding the native cursor stays usable), and — like macOS —
 * blows up when you shake the pointer to find it.
 */

/** Filter-region size (px). Also the hard bound on how far the tail can lag. */
const BOX = 260;
const HALF = BOX / 2;
/** Room reserved inside the box for the goo blur's spill, so nothing clips. */
const BLUR_PAD = 20;

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

/** Fingers are bigger than pointers — the touch drop scales up to match. */
const TOUCH_MUL = 1.7;

/** How much the drop grows over an interactive element / while shaking. */
const SWELL_GAIN = 0.85;
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

export function MetaballCursor() {
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const blobRefs = useRef<HTMLSpanElement[]>([]);

  // The portal target only exists on the client.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (reduced || typeof window === 'undefined') {
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
  }, [reduced]);

  useEffect(() => {
    if (!enabled) return;
    const box = boxRef.current;
    const blobs = blobRefs.current;
    if (!box || blobs.length === 0) return;
    const root = document.documentElement;

    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    const pos = BLOBS.map(() => ({ x: cx, y: cy }));

    let mode: 'mouse' | 'touch' = 'mouse';
    let visible = false;
    let swell = 0;
    let swellTarget = 0;
    let caret = 0;
    let caretTarget = 0;
    let shake = 0;
    let press = 0;
    let pressTarget = 0;

    // Shake detection state (mouse only).
    let vx = 0;
    let vy = 0;
    let lastMoveAt = 0;
    let shakeUntil = 0;
    const reversals: number[] = [];

    let raf = 0;
    let last = 0;

    /** The native cursor is hidden only while the drop is actually driving. */
    const setNativeCursor = (hidden: boolean) => {
      if (hidden) root.setAttribute('data-metaball-cursor', 'on');
      else root.removeAttribute('data-metaball-cursor');
    };

    const tick = (now: number) => {
      raf = 0;
      // Clamp dt so a backgrounded tab (or a long GC pause) resumes smoothly
      // instead of teleporting every spring to its target in one frame.
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      /** Frame-rate independent convergence: the same curve at 60Hz and 240Hz. */
      const ease = (lambda: number) => 1 - Math.exp(-lambda * dt);

      const shakeTarget = mode === 'mouse' && now < shakeUntil ? 1 : 0;
      swell += (swellTarget - swell) * ease(9);
      caret += (caretTarget - caret) * ease(11);
      press += (pressTarget - press) * ease(16);
      // Grows fast, relaxes slowly — the macOS feel.
      shake += (shakeTarget - shake) * ease(shakeTarget > shake ? 16 : 5);

      box.style.transform = `translate3d(${(cx - HALF).toFixed(1)}px, ${(cy - HALF).toFixed(1)}px, 0)`;

      const mul = mode === 'touch' ? TOUCH_MUL : 1;
      const grow = (1 + swell * SWELL_GAIN + shake * SHAKE_GAIN) * (1 - press * 0.18) * mul;
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
      if (raf) return;
      box.style.willChange = 'transform';
      for (const b of blobs) b.style.willChange = 'transform';
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const show = () => {
      if (visible) return;
      visible = true;
      box.style.opacity = '1';
      if (mode === 'mouse') setNativeCursor(true);
    };

    const hide = () => {
      visible = false;
      box.style.opacity = '0';
      setNativeCursor(false);
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

    const onMove = (e: PointerEvent) => {
      const touch = e.pointerType !== 'mouse';
      // Touch only drives the drop while a finger is down; a hovering pen does
      // not steal the desktop cursor mode.
      if (touch && e.buttons === 0 && e.pointerType !== 'pen') return;
      if (touch !== (mode === 'touch')) {
        mode = touch ? 'touch' : 'mouse';
        setNativeCursor(!touch && visible);
        reversals.length = 0;
        shakeUntil = 0;
      }
      const now = performance.now();
      if (!touch) trackShake(e.clientX, e.clientY, now);
      cx = e.clientX;
      cy = e.clientY;
      show();
      ensure();
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const target = e.target as Element | null;
      caretTarget = target?.closest?.(TEXT_SELECTOR) ? 1 : 0;
      swellTarget = !caretTarget && target?.closest?.(HOVER_SELECTOR) ? 1 : 0;
      ensure();
    };

    const onDown = (e: PointerEvent) => {
      pressTarget = 1;
      if (e.pointerType !== 'mouse') {
        mode = 'touch';
        setNativeCursor(false);
        // Jump straight to the finger instead of gliding in from the last spot.
        cx = e.clientX;
        cy = e.clientY;
        for (const p of pos) {
          p.x = cx;
          p.y = cy;
        }
        swellTarget = 0;
        caretTarget = 0;
        show();
      }
      ensure();
    };

    const onUp = () => {
      pressTarget = 0;
      if (mode === 'touch') hide();
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

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      if (raf) cancelAnimationFrame(raf);
      // Never leave the page without a pointer.
      root.removeAttribute('data-metaball-cursor');
    };
  }, [enabled]);

  if (!enabled || !mounted) return null;

  return createPortal(
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
    </div>,
    document.body,
  );
}
