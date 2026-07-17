/**
 * Hook to detect and manage Sahur Mode (3-4 AM time-gated features).
 * Polls the Sahur status endpoint every 30 seconds.
 *
 * The poll is a ref-counted module singleton (mirrors lib/useNotificationCount):
 * several consumers (the Sahur overlay + the strategies pages) previously each
 * ran their own 30s interval, so a page holding two of them issued duplicate
 * `/api/doctrine/sahur/status` fetches. Now ONE interval feeds the shared store;
 * consumers read it through individual selectors instead of subscribing to the
 * whole store (which re-rendered on every unrelated doctrine-store change).
 */

import { useEffect } from 'react';
import { useDoctrineStore } from '@/stores/doctrineStore';

let interval: ReturnType<typeof setInterval> | null = null;
let refCount = 0;

async function checkSahur() {
  try {
    const res = await fetch('/api/doctrine/sahur/status');
    if (!res.ok) return;
    const data = await res.json();
    const store = useDoctrineStore.getState();
    store.setSahurActive(data.status.active, data.config);
    store.setSahurCountdown(data.status.minutesRemaining);
  } catch {
    // Silent fail — non-critical
  }
}

function start() {
  refCount += 1;
  if (refCount === 1) {
    checkSahur();
    interval = setInterval(checkSahur, 30_000);
  }
}

function stop() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && interval) {
    clearInterval(interval);
    interval = null;
  }
}

export function useDoctrineSahur() {
  // Per-field selectors so an unrelated doctrine-store update (incident count,
  // theme) doesn't re-render every consumer of this hook.
  const sahurActive = useDoctrineStore((s) => s.sahurActive);
  const sahurConfig = useDoctrineStore((s) => s.sahurConfig);
  const sahurCountdown = useDoctrineStore((s) => s.sahurCountdown);

  useEffect(() => {
    start();
    return () => stop();
  }, []);

  return { sahurActive, sahurConfig, sahurCountdown };
}
