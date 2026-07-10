'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface AdminReviewCounts {
  reports: number;
  total: number;
}

const EMPTY: AdminReviewCounts = { reports: 0, total: 0 };

/**
 * Polls the count of items needing admin review (open reports, …) so the Admin
 * nav entry can show a badge. Mirrors `useNotificationCount`: refreshes on an
 * interval and when the tab regains focus/visibility. No-ops for non-admins.
 */
export function useAdminReviewCount(isAdmin: boolean, intervalMs = 60_000) {
  const [counts, setCounts] = useState<AdminReviewCounts>(EMPTY);
  const cancelled = useRef(false);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/review-counts', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!cancelled.current && typeof data.total === 'number') {
        setCounts({ reports: data.reports ?? 0, total: data.total });
      }
    } catch {
      // Network hiccup — keep the last known value.
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    if (!isAdmin) {
      setCounts(EMPTY);
      return;
    }

    fetchCounts();
    const interval = setInterval(fetchCounts, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchCounts();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchCounts);

    return () => {
      cancelled.current = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchCounts);
    };
  }, [isAdmin, intervalMs, fetchCounts]);

  return { counts, refresh: fetchCounts };
}
