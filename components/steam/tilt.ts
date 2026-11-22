import type { PointerEvent } from 'react';

/**
 * Pointer tilt for a game capsule. The handlers only write four CSS variables (tilt about each axis and where the
 * highlight sits); the 3D transform and the specular glare are drawn by the compositor from `steam.css`, so no
 * animation loop runs and a capsule at rest costs nothing. Mouse only: touch
 * has no hover to follow.
 */
const MAX_DEG = 11;

function apply(el: HTMLElement, e: { clientX: number; clientY: number }) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  el.style.setProperty('--tilt-x', `${((0.5 - y) * 2 * MAX_DEG).toFixed(2)}deg`);
  el.style.setProperty('--tilt-y', `${((x - 0.5) * 2 * MAX_DEG).toFixed(2)}deg`);
  el.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`);
  el.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`);
}

export const capsuleTilt = {
  onPointerMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'mouse') return;
    apply(e.currentTarget, e);
  },
  onPointerLeave(e: PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    for (const v of ['--tilt-x', '--tilt-y', '--glare-x', '--glare-y']) el.style.removeProperty(v);
  },
};
