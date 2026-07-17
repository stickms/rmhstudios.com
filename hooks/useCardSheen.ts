import { useCallback, useRef } from 'react';

/**
 * Cursor-tracking specular sheen for a card, with ZERO React re-renders.
 *
 * The previous implementation called setState on every `mousemove`, re-rendering
 * the hovered card 60-144×/second. This mirrors `hooks/useGlassLight`: an
 * rAF-throttled handler writes the pointer position (and hover opacity) as CSS
 * custom properties on the card element via a ref, and the sheen layer reads
 * them through `var()` — so the browser repaints only that one composited layer
 * and React never runs.
 *
 * The returned `sheenStyle` is a stable module constant; the sheen `<div>` must
 * be a descendant of `cardRef` so the `--sheen-*` custom properties inherit down
 * to it. The visual output is identical to the old radial-gradient sheen.
 */

const SHEEN_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 20,
  opacity: 'var(--sheen-opacity, 0)',
  background:
    'radial-gradient(350px circle at var(--sheen-x, 50%) var(--sheen-y, 50%), rgba(255,255,255,0.12), transparent 60%)',
  transition: 'opacity 0.3s',
};

export function useCardSheen() {
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    // Cache the latest pointer position; the rAF flush reads it once per frame.
    pointerRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--sheen-x', `${pointerRef.current.x - rect.left}px`);
      el.style.setProperty('--sheen-y', `${pointerRef.current.y - rect.top}px`);
    });
  }, []);

  const handleMouseEnter = useCallback(() => {
    cardRef.current?.style.setProperty('--sheen-opacity', '1');
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--sheen-opacity', '0');
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  return {
    cardRef,
    sheenStyle: SHEEN_STYLE,
    handlers: {
      onMouseMove: handleMouseMove,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    },
  };
}
