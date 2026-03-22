/**
 * Hook to detect and manage Sahur Mode (3-4 AM time-gated features).
 * Polls the Sahur status endpoint every 30 seconds.
 */

import { useEffect, useCallback } from 'react';
import { useDoctrineStore } from '@/stores/doctrineStore';

export function useDoctrineSahur() {
  const {
    sahurActive, sahurConfig, sahurCountdown,
    setSahurActive, setSahurCountdown,
  } = useDoctrineStore();

  const checkSahur = useCallback(async () => {
    try {
      const res = await fetch('/api/doctrine/sahur/status');
      if (!res.ok) return;
      const data = await res.json();

      setSahurActive(data.status.active, data.config);
      setSahurCountdown(data.status.minutesRemaining);
    } catch {
      // Silent fail — non-critical
    }
  }, [setSahurActive, setSahurCountdown]);

  useEffect(() => {
    checkSahur();
    const interval = setInterval(checkSahur, 30_000);
    return () => clearInterval(interval);
  }, [checkSahur]);

  return { sahurActive, sahurConfig, sahurCountdown };
}
