'use client';

import { useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';

const TAP_THRESHOLD = 12; // px of pointer travel still counts as a tap, not a drag

/**
 * Returns pointer handlers that fire `onTap` only when the pointer didn't move
 * far between down and up — so taps interact with objects while drags rotate the
 * camera. Shared by every clickable thing in the 3D scene.
 */
export function useTap(onTap: (e: ThreeEvent<PointerEvent>) => void) {
  const down = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      down.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      const start = down.current;
      down.current = null;
      if (!start) return;
      if (Math.hypot(e.nativeEvent.clientX - start.x, e.nativeEvent.clientY - start.y) > TAP_THRESHOLD) return;
      e.stopPropagation();
      onTap(e);
    },
  };
}
