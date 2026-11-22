/**
 * The reading clock (sprint 07 18): measures reading time from reading activity
 * events only, and flushes it from event handlers. Nothing here is scheduled:
 * no interval, no timeout, no requestAnimationFrame, no observer (Steel R5/B3).
 *
 * With tracking off — or signed out — no listener is attached and no request is
 * sent; the only network call is the one prefs read that says whether tracking is
 * on (it also carries this document's total for the "You've read this" line).
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiQuery } from '@/lib/contract/client';
import { getReadingTimePrefsApi, recordReadingTimeApi } from '@/lib/reading/time.contract';
import type { ReadingDocKind } from '@/lib/reading/schema';
import {
  drain,
  initialClock,
  LISTEN_EVENT,
  onActivity,
  onHidden,
  onListenEnd,
  onListenStart,
  shouldFlush,
  type ClockState,
} from '@/lib/reading/time';

/** Reading activity inside the document: scroll, keys, pointer, wheel and touch. */
const ACTIVITY_EVENTS = ['scroll', 'keydown', 'pointerdown', 'wheel', 'touchmove'] as const;

function memberTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export interface ReadingClock {
  /** Tracking is on for this member. */
  tracking: boolean;
  /** Seconds read of this document across all days, as last fetched. */
  docSeconds: number | null;
  /** Record one reading activity (a page turn the reader handles itself). */
  touch: () => void;
}

export function useReadingClock({
  kind,
  docKey,
  enabled,
}: {
  kind: ReadingDocKind;
  docKey: string;
  /** Signed in and the document is on screen. */
  enabled: boolean;
}): ReadingClock {
  const queryClient = useQueryClient();
  const prefsQuery = apiQuery(getReadingTimePrefsApi, {
    query: {
      kind,
      key: docKey,
    },
  });
  const prefs = useQuery({
    ...prefsQuery,
    enabled,
    staleTime: 60_000,
  });
  const tracking = enabled && prefs.data?.trackTime === true;
  const clock = useRef<ClockState>(initialClock);
  const touchRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!tracking) {
      touchRef.current = () => {};
      return;
    }
    const tz = memberTimeZone();
    clock.current = initialClock;

    const flush = () => {
      for (let i = 0; i < 4; i++) {
        const out = drain(clock.current, Date.now());
        clock.current = out.state;
        if (out.seconds < 1) return;
        void api(recordReadingTimeApi, {
          body: {
            kind,
            key: docKey,
            seconds: out.seconds,
            ...(tz
              ? {
                  tz,
                }
              : {}),
          },
          keepalive: true,
        })
          .then(() =>
            queryClient.invalidateQueries({
              queryKey: [getReadingTimePrefsApi.path],
            }),
          )
          .catch(() => {});
      }
    };
    const activity = () => {
      if (document.visibilityState === 'hidden') return;
      clock.current = onActivity(clock.current, Date.now());
      if (shouldFlush(clock.current, Date.now())) flush();
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        clock.current = onHidden(clock.current, Date.now());
        flush();
      } else {
        clock.current = onActivity(clock.current, Date.now());
      }
    };
    const pagehide = () => {
      clock.current = onHidden(clock.current, Date.now());
      flush();
    };
    const listen = (e: Event) => {
      const speaking =
        (
          e as CustomEvent<{
            speaking?: boolean;
          }>
        ).detail?.speaking === true;
      clock.current = speaking ? onListenStart(clock.current, Date.now()) : onListenEnd(clock.current, Date.now());
      if (!speaking) flush();
    };

    touchRef.current = activity;
    if (document.visibilityState === 'visible') clock.current = onActivity(clock.current, Date.now());
    for (const ev of ACTIVITY_EVENTS) {
      document.addEventListener(ev, activity, {
        passive: true,
        capture: true,
      });
    }
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener(LISTEN_EVENT, listen);
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        document.removeEventListener(ev, activity, {
          capture: true,
        });
      }
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener(LISTEN_EVENT, listen);
      touchRef.current = () => {};
      // Leaving the document (or switching tracking off) sends what was counted.
      clock.current = onHidden(onListenEnd(clock.current, Date.now()), Date.now());
      flush();
    };
  }, [tracking, kind, docKey, queryClient]);

  const touch = useCallback(() => touchRef.current(), []);
  return {
    tracking,
    docSeconds: prefs.data?.docSeconds ?? null,
    touch,
  };
}
