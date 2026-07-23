'use client';

import { useEffect, useState } from 'react';
import { useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface UseParallaxOptions {
  distance?: number;
  direction?: 'up' | 'down';
}

/**
 * Custom hook to calculate vertical parallax transforms based on page scroll.
 * Returns a Framer Motion value for `y` offset.
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
 * Returns smooth normalized pointer offsets (-1 to 1) for mouse/touch parallax depth.
 */
export function usePointerParallax(sensitivity = 15): PointerParallax {
  const prefersReduced = useReducedMotion();
  const [offset, setOffset] = useState<PointerParallax>({ x: 0, y: 0 });

  useEffect(() => {
    if (prefersReduced || typeof window === 'undefined') return;

    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      const x = ((e.clientX / innerWidth) - 0.5) * sensitivity;
      const y = ((e.clientY / innerHeight) - 0.5) * sensitivity;
      setOffset({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [sensitivity, prefersReduced]);

  return prefersReduced ? { x: 0, y: 0 } : offset;
}
