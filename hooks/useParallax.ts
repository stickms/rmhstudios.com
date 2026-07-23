'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface UseParallaxOptions {
  distance?: number;
  direction?: 'up' | 'down';
}

/**
 * Scroll-driven vertical parallax. Returns a Framer Motion value for `y`.
 * Uses GPU-friendly `translateY` via framer-motion's useTransform.
 */
export function useScrollParallax(options: UseParallaxOptions = {}): MotionValue<number> | number {
  const { distance = 50, direction = 'up' } = options;
  const prefersReduced = useReducedMotion();
  const { scrollY } = useScroll();

  const factor = direction === 'up' ? -1 : 1;
  const yTransform = useTransform(scrollY, [0, 1000], [0, distance * factor]);

  if (prefersReduced) {
    return 0;
  }

  return yTransform;
}

interface PointerParallax {
  x: number;
  y: number;
}

/**
 * Returns RAF-throttled, normalized pointer offsets (-1 to 1) for cursor-driven
 * parallax depth. Uses requestAnimationFrame to avoid layout thrashing and keeps
 * state updates to max 60fps. Lerps for smooth organic movement.
 */
export function usePointerParallax(sensitivity = 15): PointerParallax {
  const prefersReduced = useReducedMotion();
  const [offset, setOffset] = useState<PointerParallax>({ x: 0, y: 0 });
  const target = useRef<PointerParallax>({ x: 0, y: 0 });
  const current = useRef<PointerParallax>({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);

  const lerp = useCallback((a: number, b: number, t: number) => a + (b - a) * t, []);

  useEffect(() => {
    if (prefersReduced || typeof window === 'undefined') return;

    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      target.current = {
        x: (e.clientX / innerWidth - 0.5) * sensitivity,
        y: (e.clientY / innerHeight - 0.5) * sensitivity,
      };
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(tick);
      }
    };

    function tick() {
      const { x: cx, y: cy } = current.current;
      const { x: tx, y: ty } = target.current;
      const deltaX = tx - cx;
      const deltaY = ty - cy;

      if (Math.abs(deltaX) <= 0.05 && Math.abs(deltaY) <= 0.05) {
        current.current = { x: tx, y: ty };
        setOffset({ x: tx, y: ty });
        rafId.current = null;
        return;
      }

      // Lerp factor 0.08 = smooth, organic lag
      const nx = lerp(cx, tx, 0.08);
      const ny = lerp(cy, ty, 0.08);

      current.current = { x: nx, y: ny };
      setOffset({ x: nx, y: ny });

      rafId.current = requestAnimationFrame(tick);
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [sensitivity, prefersReduced, lerp]);

  return prefersReduced ? { x: 0, y: 0 } : offset;
}
