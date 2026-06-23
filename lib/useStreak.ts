'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface StreakState {
  current: number;
  longest: number;
  totalCheckIns: number;
  checkedInToday: boolean;
  reward: number;
}

const LAST_CHECKIN_KEY = 'rmh-streak-last-checkin';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetches the streak and performs one auto check-in per day. The localStorage
 * guard avoids hammering the endpoint on every navigation; the server is
 * idempotent regardless.
 */
export function useStreak(isLoggedIn: boolean) {
  const [streak, setStreak] = useState<StreakState | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setStreak(null);
      return;
    }
    let active = true;

    (async () => {
      const already = (() => {
        try {
          return localStorage.getItem(LAST_CHECKIN_KEY) === todayKey();
        } catch {
          return false;
        }
      })();

      try {
        if (already) {
          const res = await fetch('/api/streak', { credentials: 'include' });
          if (res.ok && active) setStreak(await res.json());
          return;
        }
        const res = await fetch('/api/streak', { method: 'POST', credentials: 'include' });
        if (!res.ok) return;
        const data: StreakState = await res.json();
        if (!active) return;
        setStreak(data);
        try {
          localStorage.setItem(LAST_CHECKIN_KEY, todayKey());
        } catch {
          // ignore
        }
        if (data.reward > 0) {
          toast.success(`🔥 ${data.current}-day streak! +${data.reward} coins`);
        }
      } catch {
        // ignore network errors
      }
    })();

    return () => {
      active = false;
    };
  }, [isLoggedIn]);

  return streak;
}
