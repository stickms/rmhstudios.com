'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface StreakState {
  current: number;
  longest: number;
  totalCheckIns: number;
  checkedInToday: boolean;
  reward: number;
  freezeTokens?: number;
  freezeUsed?: number;
}

const LAST_CHECKIN_KEY = 'rmh-streak-last-checkin';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetches the streak and performs one auto check-in per day.
 *
 * Ref-counted module singleton: the site layout mounts the left sidebar twice
 * (desktop rail + mobile drawer), and both call this. Without sharing, both
 * copies raced the localStorage guard and could each POST the check-in AND fire
 * the reward toast — so the user saw the streak toast twice. Now one shared
 * check-in runs regardless of how many consumers mount, and the result is fanned
 * out to all of them.
 */

let current: StreakState | null = null;
const subscribers = new Set<(s: StreakState | null) => void>();
let inFlight = false;

function broadcast(s: StreakState | null) {
  current = s;
  for (const sub of subscribers) sub(s);
}

async function runCheckIn() {
  // Guard so only the first mounted consumer performs the check-in — this is what
  // prevents the double POST / double toast when both sidebars mount together.
  if (inFlight) return;
  inFlight = true;

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
      if (res.ok) broadcast(await res.json());
      return;
    }
    const res = await fetch('/api/streak', { method: 'POST', credentials: 'include' });
    if (!res.ok) return;
    const data: StreakState = await res.json();
    broadcast(data);
    try {
      localStorage.setItem(LAST_CHECKIN_KEY, todayKey());
    } catch {
      // ignore
    }
    if (data.freezeUsed && data.freezeUsed > 0) {
      toast.success(`🧊 Streak freeze used — your ${data.current}-day streak survived!`);
    }
    if (data.reward > 0) {
      toast.success(`🔥 ${data.current}-day streak! +${data.reward} coins`);
    }
  } catch {
    // ignore network errors
  }
}

export function useStreak(isLoggedIn: boolean) {
  const [streak, setStreak] = useState<StreakState | null>(current);

  useEffect(() => {
    if (!isLoggedIn) {
      setStreak(null);
      return;
    }
    subscribers.add(setStreak);
    setStreak(current);
    void runCheckIn();
    return () => {
      subscribers.delete(setStreak);
      // Reset when the last consumer leaves (e.g. sign-out) so a later sign-in
      // re-checks in.
      if (subscribers.size === 0) {
        inFlight = false;
        current = null;
      }
    };
  }, [isLoggedIn]);

  return isLoggedIn ? streak : null;
}
