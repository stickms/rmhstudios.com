import { useEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { DURATION } from '@/lib/motion';

/**
 * The route-progress bar. Three phases, changed three times per navigation, not once per tick: `running` (the bar creeps
 * toward 90%), `done` (it jumps to 100% and the bar goes away) and `idle` (not in the box tree). The creep itself is a
 * single CSS transition (app/globals.css, "Route progress"); it used to be a `setInterval` that set React state every
 * 160ms for as long as the page was pending.
 *
 * Remains mounted across routes.
 */
type Phase = 'idle' | 'running' | 'done';

export function NavigationProgress() {
  const pending = useRouterState({ select: (s) => s.status === 'pending' });
  const [phase, setPhase] = useState<Phase>('idle');
  const shown = useRef(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (pending) {
      // Re-pending while the previous bar is still finishing keeps it up; otherwise the bar waits 90ms so a fast
      // navigation never flashes one.
      if (shown.current) setPhase('running');
      else
        timers.push(
          setTimeout(() => {
            shown.current = true;
            setPhase('running');
          }, 90),
        );
    } else if (shown.current) {
      setPhase('done');
      timers.push(
        setTimeout(() => {
          shown.current = false;
          setPhase('idle');
        }, DURATION.fast * 1000),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [pending]);

  return (
    // Out of the box tree while idle, not just transparent: iOS 26 Safari reads any fixed element at the top
    // edge (opacity or not) as the source of the status-bar tint, and this one is full width.
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[300] h-0.5 ${phase === 'idle' ? 'hidden' : 'block'}`}
    >
      <div data-nav-progress data-phase={phase} className="h-full origin-left bg-site-accent" />
    </div>
  );
}
