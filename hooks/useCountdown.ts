'use client';

/**
 * A countdown to a fixed instant, broken into whole days / hours / minutes /
 * seconds.
 *
 * `useDoctrineCountdown` already exists and does almost this, but it reports
 * *total* hours and has no `days` field — `components/doctrine/countdown-timer`
 * renders `hours:minutes:seconds` and depends on that meaning. Adding `days`
 * there would have silently changed what `hours` means for Doctrine, so this is
 * a second hook rather than a widened one.
 */

import { useCallback, useEffect, useState } from 'react';

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Total seconds remaining, 0 once the target has passed. */
  total: number;
  expired: boolean;
  /**
   * `false` until the first client tick. Everything that renders a digit must
   * gate on this: the server renders one second and the client hydrates on a
   * different one, and React logs a mismatch for every box on the page.
   */
  ready: boolean;
}

const ZERO: Countdown = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  total: 0,
  expired: false,
  ready: false,
};

export function useCountdown(target: Date | number | null): Countdown {
  const targetMs = target === null ? null : target instanceof Date ? target.getTime() : target;

  const calculate = useCallback((): Countdown => {
    if (targetMs === null) return { ...ZERO, expired: true, ready: true };

    const diff = targetMs - Date.now();
    if (diff <= 0) return { ...ZERO, expired: true, ready: true };

    const total = Math.floor(diff / 1000);
    return {
      days: Math.floor(total / 86_400),
      hours: Math.floor((total % 86_400) / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
      total,
      expired: false,
      ready: true,
    };
  }, [targetMs]);

  // Deliberately NOT seeded from `calculate()` — the initial state is what SSR
  // renders and what the client hydrates against, so it has to be a constant.
  const [countdown, setCountdown] = useState<Countdown>(ZERO);

  useEffect(() => {
    setCountdown(calculate());
    const interval = setInterval(() => setCountdown(calculate()), 1000);
    return () => clearInterval(interval);
  }, [calculate]);

  return countdown;
}
