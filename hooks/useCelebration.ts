import { useCallback, useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

type CelebrationKind = 'confetti' | 'fireworks';

interface CelebrationOptions {
  kind?: CelebrationKind;
  /** Origin as fractions of the viewport (0–1). Defaults to just below center. */
  origin?: { x?: number; y?: number };
  /** Override particle colors. Defaults to the current theme accent + neutrals. */
  colors?: string[];
}

function themeColors(): string[] {
  if (typeof window === 'undefined') return ['#9b7ad8', '#ffffff'];
  try {
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--site-accent').trim() || '#9b7ad8';
    const success = styles.getPropertyValue('--site-success').trim() || '#7bc88a';
    return [accent, success, '#ffffff'];
  } catch {
    return ['#9b7ad8', '#ffffff'];
  }
}

/**
 * Returns a `celebrate()` function that fires a confetti/fireworks burst for
 * wins and milestones (achievement unlocks, streak milestones, level-ups).
 *
 * - No-ops when the user prefers reduced motion.
 * - Loads `canvas-confetti` lazily so it never weighs down the initial bundle.
 * - Defaults to theme-accent colors so it matches the active theme.
 */
export function useCelebration() {
  // The fireworks burst runs a short self-terminating frame loop; an unmount mid-burst cancels it (and a burst whose
  // chunk lands after unmount never starts).
  const life = useRef({ alive: true, frames: new Set<number>() });
  useEffect(() => {
    const l = life.current;
    l.alive = true;
    return () => {
      l.alive = false;
      for (const id of l.frames) cancelAnimationFrame(id);
      l.frames.clear();
    };
  }, []);

  return useCallback(async (options: CelebrationOptions = {}) => {
    if (prefersReducedMotion() || typeof window === 'undefined') return;
    const l = life.current;
    try {
      const confetti = (await import('canvas-confetti')).default;
      if (!l.alive) return;
      const colors = options.colors ?? themeColors();
      const origin = { x: options.origin?.x ?? 0.5, y: options.origin?.y ?? 0.6 };
      if (options.kind === 'fireworks') {
        const end = Date.now() + 800;
        let id = 0;
        const frame = () => {
          l.frames.delete(id);
          if (!l.alive) return;
          confetti({ particleCount: 40, spread: 70, startVelocity: 45, origin, colors });
          if (Date.now() < end) {
            id = requestAnimationFrame(frame);
            l.frames.add(id);
          }
        };
        frame();
        return;
      }

      confetti({ particleCount: 120, spread: 80, startVelocity: 42, origin, colors });
    } catch {
      /* confetti is pure delight — never let it break the calling flow */
    }
  }, []);
}
