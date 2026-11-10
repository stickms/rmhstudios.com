/**
 * Countdown hook for time-sensitive events (puzzle reset, Sahur window).
 */

import { useState, useEffect, useCallback } from 'react';

interface CountdownResult {
  hours: number;
  minutes: number;
  seconds: number;
  total: number; // total seconds remaining
  expired: boolean;
}

export function useDoctrineCountdown(targetDate: Date | null): CountdownResult {
  const calculate = useCallback((): CountdownResult => {
    if (!targetDate) return { hours: 0, minutes: 0, seconds: 0, total: 0, expired: true };

    const diff = targetDate.getTime() - Date.now();
    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, total: 0, expired: true };

    const total = Math.floor(diff / 1000);
    return {
      hours: Math.floor(total / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
      total,
      expired: false,
    };
  }, [targetDate]);

  const [countdown, setCountdown] = useState(calculate);

  useEffect(() => {
    setCountdown(calculate());
    const interval = setInterval(() => setCountdown(calculate()), 1000);
    return () => clearInterval(interval);
  }, [calculate]);

  return countdown;
}
