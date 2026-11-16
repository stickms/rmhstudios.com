/**
 * Chrome pointer: one delegated, passive `pointermove` listener on a microsite's
 * root that tells the `[data-chrome-live]` surface under the pointer where the
 * pointer is, as a custom property running from -1 (its left edge) to 1 (its
 * right edge). The CSS eases the value and moves the reflection with it.
 *
 * There is no frame loop: the browser delivers `pointermove` at most once a
 * frame. Fine pointers only (hover: hover), so touch never pays for it.
 *
 * Shared by RMH Capital (`--rc-mx`, the default) and RMH PMC (`--rp-mx`).
 */
import { useEffect } from 'react';

export function useChromePointer(
  root: React.RefObject<HTMLDivElement | null>,
  prop: `--${string}` = '--rc-mx',
) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let last: HTMLElement | null = null;
    const settle = () => {
      last?.style.setProperty(prop, '0');
      last = null;
    };
    const onMove = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const surface = target?.closest<HTMLElement>('[data-chrome-live]') ?? null;
      if (surface !== last) settle();
      if (!surface) return;
      last = surface;
      const box = surface.getBoundingClientRect();
      if (box.width === 0) return;
      const x = ((e.clientX - box.left) / box.width) * 2 - 1;
      surface.style.setProperty(prop, x.toFixed(3));
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', settle);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', settle);
      settle();
    };
  }, [root, prop]);
}
