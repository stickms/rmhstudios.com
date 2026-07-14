'use client';

import { useEffect } from 'react';

/**
 * The signature "reactive" glass behaviour: a soft radial specular highlight
 * that follows the cursor across any element marked `[data-glass-light]`
 * (usually paired with the `.glass-interactive` class, which draws the light).
 *
 * One document-level, rAF-throttled `pointermove` listener finds the hovered
 * `[data-glass-light]` element and writes the pointer's position as CSS custom
 * properties (`--glass-px` / `--glass-py`, percent coords within the element)
 * onto that element only — no React re-renders, repaint confined to that one
 * composited layer (§5.1, §6.2).
 *
 * Gated to fine pointers with hover (touch devices never pay for it) and off
 * under `html.perf-lite`. Mounted once in `components/Providers.tsx`.
 */
export function useGlassLight(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (document.documentElement.classList.contains('perf-lite')) return;

    let raf = 0;
    let last: HTMLElement | null = null;

    const clear = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--glass-px');
      el.style.removeProperty('--glass-py');
    };

    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el =
          (e.target as Element | null)?.closest<HTMLElement>('[data-glass-light]') ?? null;
        if (last && last !== el) clear(last);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            el.style.setProperty('--glass-px', `${((e.clientX - r.left) / r.width) * 100}%`);
            el.style.setProperty('--glass-py', `${((e.clientY - r.top) / r.height) * 100}%`);
          }
        }
        last = el;
      });
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
      clear(last);
    };
  }, []);
}
