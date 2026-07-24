'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// Blob diameters (px). The lead blob tracks the pointer; the trailing ones lag,
// so the goo filter fuses them into a liquid shape that stretches when you move
// fast and settles to a single dot when you stop.
const BLOBS = [
  { d: 40, ease: 0.4 },
  { d: 30, ease: 0.24 },
  { d: 22, ease: 0.15 },
];
const BOX = 340; // filter region size — kept small so the per-frame goo blur is cheap
const HALF = BOX / 2;

/**
 * A gooey "metaball" cursor. A handful of blobs ride under an SVG goo filter and
 * `mix-blend-mode: difference`, so the cursor reads as a liquid blob that merges
 * with itself as it moves and inverts whatever is beneath it (legible on any
 * ground, in either theme). Interactive elements (`a`, `button`, …) swell it —
 * it "morphs with" the UI. Desktop-only (fine pointer), off under reduced-motion,
 * and pointer-events:none so it never intercepts input.
 */
export function MetaballCursor() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const blobRefs = useRef<HTMLSpanElement[]>([]);

  // Only light up for a real mouse, and never under reduced-motion.
  useEffect(() => {
    if (reduced) return;
    if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: fine)').matches) return;
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
    let raf = 0;
    let running = false;
    let visible = false;

    const tick = () => {
      box.style.transform = `translate3d(${(cx - HALF).toFixed(1)}px, ${(cy - HALF).toFixed(1)}px, 0)`;
      swell += (swellTarget - swell) * 0.12;
      let moving = false;
      for (let i = 0; i < blobs.length; i++) {
        const { d, ease } = BLOBS[i];
        const p = pos[i];
        p.x += (cx - p.x) * ease;
        p.y += (cy - p.y) * ease;
        const r = d / 2;
        const scale = 1 + swell * 0.9;
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
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: PointerEvent) => {
      cx = e.clientX;
      cy = e.clientY;
      if (!visible) {
        visible = true;
        box.style.opacity = '1';
      }
      ensure();
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
    const onLeave = () => {
      visible = false;
      box.style.opacity = '0';
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerleave', onLeave);
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
