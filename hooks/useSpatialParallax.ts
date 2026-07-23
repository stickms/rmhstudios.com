import { useEffect } from 'react';

/**
 * Drives the restrained background parallax used by the spatial-minimal shell.
 * The listener is shared at the provider level, writes only two composited CSS
 * variables, and stands down for reduced-motion users and coarse pointers.
 */
export function useSpatialParallax() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');
    let frame = 0;

    const reset = () => {
      root.style.removeProperty('--spatial-parallax-x');
      root.style.removeProperty('--spatial-parallax-y');
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduced.matches || !finePointer.matches) {
        reset();
        return;
      }
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 18;
        const y = (event.clientY / window.innerHeight - 0.5) * 18;
        root.style.setProperty('--spatial-parallax-x', `${x.toFixed(2)}px`);
        root.style.setProperty('--spatial-parallax-y', `${y.toFixed(2)}px`);
        frame = 0;
      });
    };

    const onPreferenceChange = () => {
      if (reduced.matches || !finePointer.matches) reset();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    reduced.addEventListener('change', onPreferenceChange);
    finePointer.addEventListener('change', onPreferenceChange);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
      reduced.removeEventListener('change', onPreferenceChange);
      finePointer.removeEventListener('change', onPreferenceChange);
      reset();
    };
  }, []);
}
