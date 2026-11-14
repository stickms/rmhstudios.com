import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { api } from '@/lib/contract/client';
import { getAdminReviewCountsApi } from '@/lib/admin/admin-ops.contract';

export interface AdminReviewCounts {
  reports: number;
  /** Strike appeals awaiting a decision. */
  appeals: number;
  /** Emoji & sticker packs awaiting moderation. */
  emojiPacks: number;
  /** Marketplace listings held for price review. */
  market: number;
  total: number;
}

const EMPTY: AdminReviewCounts =
  {
    reports: 0,
    appeals: 0,
    emojiPacks: 0,
    market: 0,
    total: 0,
  };

/**
 * Polls the count of items needing admin review (open reports, …) so the Admin
 * nav entry can show a badge. Mirrors `useNotificationCount`: refreshes on an
 * interval and when the tab regains focus/visibility. No-ops for non-admins.
 */
export function useAdminReviewCount(
  isAdmin: boolean,
  intervalMs = 60_000,
) {
  const [
    counts,
    setCounts,
  ] =
    useState<AdminReviewCounts>(
      EMPTY,
    );
  const cancelled =
    useRef(
      false,
    );

  const fetchCounts =
    useCallback(async () => {
      try {
        const data =
          await api(
            getAdminReviewCountsApi,
            {
              retries: 0,
            },
          );
        if (
          !cancelled.current &&
          typeof data.total ===
            'number'
        ) {
          setCounts(
            {
              reports:
                data.reports ??
                0,
              appeals:
                data.appeals ??
                0,
              emojiPacks:
                data.emojiPacks ??
                0,
              market:
                data.market ??
                0,
              total:
                data.total,
            },
          );
        }
      } catch {
        // Network hiccup — keep the last known value.
      }
    }, []);

  useEffect(() => {
    cancelled.current = false;
    if (
      !isAdmin
    ) {
      setCounts(
        EMPTY,
      );
      return;
    }

    fetchCounts();
    const interval =
      setInterval(
        fetchCounts,
        intervalMs,
      );
    const onVisible =
      () => {
        if (
          document.visibilityState ===
          'visible'
        )
          fetchCounts();
      };
    document.addEventListener(
      'visibilitychange',
      onVisible,
    );
    window.addEventListener(
      'focus',
      fetchCounts,
    );

    return () => {
      cancelled.current = true;
      clearInterval(
        interval,
      );
      document.removeEventListener(
        'visibilitychange',
        onVisible,
      );
      window.removeEventListener(
        'focus',
        fetchCounts,
      );
    };
  }, [
    isAdmin,
    intervalMs,
    fetchCounts,
  ]);

  return {
    counts,
    refresh:
      fetchCounts,
  };
}
