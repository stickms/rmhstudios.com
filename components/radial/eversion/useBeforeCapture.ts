'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { BeforeCaptureScheduler } from '@/lib/eversion/before-capture';
import { BEFORE_STALE_MS } from '@/lib/eversion/constants';
import { createCapture } from '@/lib/eversion/capture';
import { registerDebug } from '@/lib/eversion/debug';
import { evaluateEligibility, shouldCaptureBefore } from '@/lib/eversion/eligibility';
import type { EligibilityInputs } from '@/lib/eversion/eligibility';
import { isEversionEnabled } from '@/lib/eversion/flags';
import { detectHostMode } from '@/lib/eversion/gl/host';
import { isEversionReady } from '@/lib/eversion/prefetch';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import type { CaptureApi, FallbackReason } from '@/lib/eversion/types';
import { detectTier } from './detect-tier';
import { overlayStore } from './overlay-store';
import { whenQuiet } from '../quiet';

/** How long the page must be still (and no pointer held) before the BEFORE capture runs. */
const CAPTURE_QUIET_MS = 150;
/**
 * With the hub closed: how long the page must be still before a capture is taken AHEAD of the next open, and the
 * least time between two of them (a guard against anything that keeps invalidating it).
 */
const AHEAD_QUIET_MS = 1200;
const AHEAD_MIN_GAP_MS = 5000;

/**
 * Read the live eligibility inputs. Each reader is individually guarded: a
 * reader that throws (T25's detection before it lands, a sandboxed frame) is an
 * UNKNOWN, and unknown is ineligible (see `eligibility.ts`).
 *
 * System and account motion preferences both disable the effect.
 */
/** Imperative motion eligibility for capture and navigation. */
export function siteReducedMotion(): boolean {
  try {
    return prefersReducedMotion();
  } catch {
    return false;
  }
}

export function readEligibilityInputs(): EligibilityInputs {
  const guard = <T>(read: () => T, unknown: T): T => {
    try {
      return read();
    } catch {
      return unknown;
    }
  };
  return {
    flagEnabled: isEversionEnabled(),
    reducedMotion: siteReducedMotion(),
    // Any mode ('worker' or 'main') means WebGL2 is there; the host throws when
    // it cannot say.
    webgl2: guard<boolean | null>(() => detectHostMode() != null, null),
    chunkReady: guard(() => isEversionReady(), false),
  };
}

/** Why the effect cannot run right now (`null` when it can). Usable outside React. */
export function ineligibleReason(): FallbackReason | null {
  return evaluateEligibility(readEligibilityInputs());
}

/** Flag on, motion allowed, WebGL2 available, chunk loaded (spec §1.1). */
export function isEligible(): boolean {
  return ineligibleReason() === null;
}

export interface UseBeforeCapture {
  /**
   * The BEFORE bitmap, or `null` after waiting at most `graceMs` (the caller
   * passes `BEFORE_GRACE_MS`). Ownership of the bitmap passes to the caller.
   * Never rejects.
   */
  awaitBefore(graceMs: number): Promise<ImageBitmap | null>;
  isEligible(): boolean;
  ineligibleReason(): FallbackReason | null;
  /** The capture session the scheduler uses; the controller reuses it for AFTER. */
  getCapture(): CaptureApi | null;
}

/**
 * Take the BEFORE capture while the hub is open (spec §6.2, T30). Thin React
 * binding over {@link BeforeCaptureScheduler}, which holds all the logic and is
 * unit-tested without a DOM.
 *
 * `open` is true while the hub is fully open (RadialHub's `phase === 'open'`);
 * the scheduler holds off `motionMs` (the hub's MOTION_MS) so the capture can
 * never land inside the open morph.
 *
 * With the rollout flag off the hook does nothing at all — no timers, no
 * capture module touched — so the hub behaves exactly as it did before.
 */
export function useBeforeCapture({
  open,
  motionMs,
  ahead = true,
}: {
  open: boolean;
  motionMs: number;
  /** Take the capture ahead of the next navigation while the page is still (see below). */
  ahead?: boolean;
}): UseBeforeCapture {
  const schedulerRef = useRef<BeforeCaptureScheduler | null>(null);

  // Declared before the open effect so the scheduler exists when it runs, and
  // created in an effect (not render) so StrictMode's mount/unmount/mount pair
  // disposes one instance and builds a fresh one.
  useEffect(() => {
    const scheduler = new BeforeCaptureScheduler({
      createCapture,
      motionMs,
      tier: () => {
        try {
          return detectTier();
        } catch {
          return undefined;
        }
      },
      shouldCapture: () => shouldCaptureBefore(readEligibilityInputs()),
      // The capture clones the page on the main thread (~100-300 ms on a desktop,
      // more on a phone). An idle callback's timeout would fire it in the middle of
      // a drag on the globe (a drag fires no new press): wait for a still page and
      // no pointer held instead (`../quiet.ts`). A release before then takes one on
      // demand, inside its own budget.
      scheduleIdle: (cb, timeoutMs) =>
        whenQuiet(cb, { quietMs: CAPTURE_QUIET_MS, idleTimeoutMs: timeoutMs }),
    });
    schedulerRef.current = scheduler;
    const unregister = registerDebug('beforeCapture', { state: () => scheduler.state() });
    return () => {
      unregister();
      scheduler.dispose();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
    };
  }, [motionMs]);

  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler || !open || !isEversionEnabled()) return;
    scheduler.hubOpened();
    return () => scheduler.hubClosed();
  }, [open, motionMs]);

  // Ahead of the open (before-capture.ts): with the hub closed and the page still, take the capture now, so the
  // hub's opening - on WebKit drawn on the same thread, with the globe drifting - never pays for one. Anything that
  // can change what the page looks like drops it: a scroll (of the page or anything in it), a resize, a theme
  // change on <html>, a route change (this effect re-runs on `pathname`).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler || open || !isEversionEnabled()) return;
    scheduler.invalidate();
    // Off the shell nothing is taken ahead, but the page's last picture is still dropped above: it is the page
    // that was left.
    if (!ahead) return;
    let lastAt = -Infinity;
    let cancel: () => void = () => {};
    let gap: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      cancel();
      if (gap) clearTimeout(gap);
      gap = null;
      cancel = whenQuiet(
        () => {
          if (document.hidden) return;
          const wait = lastAt + AHEAD_MIN_GAP_MS - performance.now();
          if (wait > 0) {
            gap = setTimeout(arm, wait);
            return;
          }
          lastAt = performance.now();
          scheduler.prepareAhead();
        },
        // A run started without the hub (Preview) is on screen: not a still page.
        { quietMs: AHEAD_QUIET_MS, busy: () => overlayStore.getSnapshot().mounted },
      );
    };
    const changed = () => {
      scheduler.invalidate();
      arm();
    };
    const vv = window.visualViewport;
    window.addEventListener('scroll', changed, { capture: true, passive: true });
    window.addEventListener('resize', changed);
    vv?.addEventListener('resize', changed);
    document.addEventListener('visibilitychange', arm);
    // A run coming or going (Preview runs without opening the hub) changes the page.
    const offOverlay = overlayStore.subscribe(changed);
    const theme = new MutationObserver(changed);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // Still on the page past the staleness limit: retake at the next still moment.
    const refresh = setInterval(arm, BEFORE_STALE_MS);
    arm();
    return () => {
      cancel();
      if (gap) clearTimeout(gap);
      clearInterval(refresh);
      window.removeEventListener('scroll', changed, { capture: true });
      window.removeEventListener('resize', changed);
      vv?.removeEventListener('resize', changed);
      document.removeEventListener('visibilitychange', arm);
      theme.disconnect();
      offOverlay();
    };
  }, [open, ahead, pathname]);

  const awaitBefore = useCallback(
    (graceMs: number) => schedulerRef.current?.awaitBefore(graceMs) ?? Promise.resolve(null),
    [],
  );
  const getCapture = useCallback(() => schedulerRef.current?.getCapture() ?? null, []);

  return { awaitBefore, isEligible, ineligibleReason, getCapture };
}
