import type { Rect } from './types';

import {
  clamp,
  lerp,
} from '@/lib/core/math';

export {
  clamp,
  lerp,
};

// Move `value` toward `target` by at most `maxDelta`.
export function approach(
  value: number,
  target: number,
  maxDelta: number,
): number {
  if (
    value <
    target
  )
    return Math.min(
      value +
        maxDelta,
      target,
    );
  if (
    value >
    target
  )
    return Math.max(
      value -
        maxDelta,
      target,
    );
  return target;
}

export function rectIntersect(
  a: Rect,
  b: Rect,
): boolean {
  return (
    a.x <
      b.x +
        b.w &&
    a.x +
      a.w >
      b.x &&
    a.y <
      b.y +
        b.h &&
    a.y +
      a.h >
      b.y
  );
}

export function rectCenter(
  r: Rect,
): {
  x: number;
  y: number;
} {
  return {
    x:
      r.x +
      r.w /
        2,
    y:
      r.y +
      r.h /
        2,
  };
}
