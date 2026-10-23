'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { DURATION } from '@/lib/motion';

/** Remains mounted across routes. Finish, fade, then reset while invisible. */
export function NavigationProgress() {
  const pending = useRouterState({ select: (s) => s.status === 'pending' });
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let trickle: ReturnType<typeof setInterval> | undefined;
    if (pending) {
      if (!shown.current) setProgress(8);
      else setVisible(true);
      timers.push(
        setTimeout(() => {
          shown.current = true;
          setVisible(true);
          trickle = setInterval(
            () => setProgress((p) => (p < 90 ? p + (90 - p) * 0.18 : p)),
            DURATION.base * 1000,
          );
        }, 90),
      );
    } else if (shown.current) {
      setProgress(100);
      timers.push(
        setTimeout(() => {
          setVisible(false);
          timers.push(
            setTimeout(() => {
              shown.current = false;
              setProgress(0);
            }, DURATION.base * 1000),
          );
        }, DURATION.fast * 1000),
      );
    }
    return () => {
      timers.forEach(clearTimeout);
      if (trickle) clearInterval(trickle);
    };
  }, [pending]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[300] h-0.5 transition-opacity duration-site ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div
        className="h-full origin-left bg-site-accent transition-transform duration-site-fast ease-out"
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  );
}
