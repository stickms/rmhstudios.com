'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// Blob diameters (px) and their "chase rate" — how fast each blob catches the
// pointer, expressed in **inverse seconds** so the motion is frame-rate
// independent (see the delta-time smoothing in `tick`). The lead blob is quick;
// the trailing ones lag, so the goo filter fuses them into a liquid shape that
// stretches when you move fast and settles to a single dot when you stop.
const BLOBS = [
  { d: 40, rate: 30 },
  { d: 30, rate: 16.5 },
  { d: 22, rate: 9.75 },
];
const SWELL_RATE = 7.7; // how fast the swell (over interactive elements) eases
const BOX = 340; // filter region size — kept small so the per-frame goo blur is cheap
const HALF = BOX / 2;
// A finger is far larger than a mouse pointer, so the touch blob rides a size
// bump — otherwise the goo drop would vanish under the thumb.
const TOUCH_SCALE = 1.55;
// Cap the per-frame delta so a background tab (or a long GC pause) can't teleport
// the blobs on the first frame back — smoothing over a huge dt looks like a jump.
const MAX_DT = 1 / 30;

/**
 * A gooey "metaball" pointer. A handful of blobs ride under an SVG goo filter and
 * `mix-blend-mode: difference`, so it reads as a liquid blob that merges with
 * itself as it moves and inverts whatever is beneath it (legible on any ground,
 * in either theme). Interactive elements (`a`, `button`, …) swell it — it
 * "morphs with" the UI.
 *
 * Works with **both** pointer kinds. On a mouse it trails the cursor and hides
 * when the pointer leaves the window. On touch it blooms under the thumb on
 * press, follows the drag, and fades on release — so phones get the same liquid
 * layer following the finger. Off under reduced-motion; `pointer-events:none`
 * throughout so it never intercepts input.
 *
 * The chase is integrated with **delta-time exponential smoothing** rather than a
 * fixed per-frame factor, so the trail feels identical at 60Hz, 120Hz and 144Hz
 * (a fixed factor over-chases on high-refresh displays and stutters on a dropped
 * frame — the old "laggy on a fast PC" feel).
 */
export function MetaballCursor() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const blobRefs = useRef<HTMLSpanElement[]>([]);

  // Mount for any pointer (mouse or touch); it stays invisible until the first
  // real input, so there is no idle cost. Never under reduced-motion.
  useEffect(() => {
    if (reduced) return;
    if (typeof window === 'undefined') return;
    setActive(true);
  }, [reduced]);

  useEffect(() => {
    if (!active) return;
    const box = boxRef.current;
    const blobs = blobRefs.current;
    if (!box || blobs.length === 0) return;

    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    const pos = BLOBS.map(() => ({ x: cx, y: cy }));
    let swell = 0; // eased 0→1 over interactive elements
    let swellTarget = 0;
    let sizeK = 1; // 1 for a mouse, TOUCH_SCALE while a finger drives it
    let raf = 0;
    let running = false;
    let visible = false;
    let lastT = 0;

    const tick = (now: number) => {
      // Delta-time smoothing: `1 - e^(-rate·dt)` is the fraction of the remaining
      // gap to close this frame. Because it is derived from elapsed time, the
      // blob covers the same ground per second no matter the refresh rate.
      const dt = lastT === 0 ? 1 / 60 : Math.min((now - lastT) / 1000, MAX_DT);
      lastT = now;

      box.style.transform = `translate3d(${(cx - HALF).toFixed(1)}px, ${(cy - HALF).toFixed(1)}px, 0)`;
      swell += (swellTarget - swell) * (1 - Math.exp(-SWELL_RATE * dt));
      let moving = false;
      for (let i = 0; i < blobs.length; i++) {
        const { d, rate } = BLOBS[i];
        const p = pos[i];
        const k = 1 - Math.exp(-rate * dt);
        p.x += (cx - p.x) * k;
        p.y += (cy - p.y) * k;
        const r = d / 2;
        const scale = (1 + swell * 0.9) * sizeK;
        // Blob position is relative to the box (which is centred on the pointer).
        const ox = HALF + (p.x - cx) - r;
        const oy = HALF + (p.y - cy) - r;
        blobs[i].style.transform =
          `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
        if (Math.abs(cx - p.x) > 0.3 || Math.abs(cy - p.y) > 0.3) moving = true;
      }
      if (moving || Math.abs(swellTarget - swell) > 0.01) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };
    const ensure = () => {
      if (!running) {
        running = true;
        lastT = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const show = () => {
      if (!visible) {
        visible = true;
        box.style.opacity = '1';
      }
    };
    const hide = () => {
      visible = false;
      box.style.opacity = '0';
    };

    const onMove = (e: PointerEvent) => {
      // On touch, `pointermove` only fires while a finger is down — exactly the
      // "follow the thumb" gesture. On a mouse it fires on hover.
      cx = e.clientX;
      cy = e.clientY;
      sizeK = e.pointerType === 'mouse' ? 1 : TOUCH_SCALE;
      show();
      ensure();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return; // mouse handled by hover/move
      // Bloom instantly at the touch point instead of racing in from the last spot.
      cx = e.clientX;
      cy = e.clientY;
      sizeK = TOUCH_SCALE;
      for (const p of pos) {
        p.x = cx;
        p.y = cy;
      }
      show();
      ensure();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') hide();
    };
    const onOver = (e: PointerEvent) => {
      const t = e.target as Element | null;
      swellTarget = t?.closest?.(
        'a, button, [role="button"], input, textarea, select, summary, label, [data-metaball]',
      )
        ? 1
        : 0;
      ensure();
    };
    const onWindowLeave = () => hide();

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerleave', onWindowLeave);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerleave', onWindowLeave);
      cancelAnimationFrame(raf);
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      <svg className="metaball-defs" width="0" height="0" aria-hidden focusable="false">
        <defs>
          <filter id="rmh-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
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
    </>
  );
}
