'use client';

import { useCallback, useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { BeforeCaptureScheduler } from '@/lib/eversion/before-capture';
import { createCapture } from '@/lib/eversion/capture';
import { registerDebug } from '@/lib/eversion/debug';
import { evaluateEligibility, shouldCaptureBefore } from '@/lib/eversion/eligibility';
import type { EligibilityInputs } from '@/lib/eversion/eligibility';
import { isEversionEnabled } from '@/lib/eversion/flags';
import { detectHostMode } from '@/lib/eversion/gl/host';
import { isEversionReady } from '@/lib/eversion/prefetch';
import type { CaptureApi, FallbackReason } from '@/lib/eversion/types';

/**
 * Read the live eligibility inputs. Each reader is individually guarded: a
 * reader that throws (T25's detection before it lands, a sandboxed frame) is an
 * UNKNOWN, and unknown is ineligible (see `eligibility.ts`).
 *
 * Reduced motion uses the non-hook reader so this can be called from event
 * handlers and timers; it consults BOTH sources `useReducedMotion` does (the OS
 * media query and the account toggle in the theme store).
 */
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
    reducedMotion: prefersReducedMotion(),
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
}: {
  open: boolean;
  motionMs: number;
}): UseBeforeCapture {
  const schedulerRef = useRef<BeforeCaptureScheduler | null>(null);

  // Declared before the open effect so the scheduler exists when it runs, and
  // created in an effect (not render) so StrictMode's mount/unmount/mount pair
  // disposes one instance and builds a fresh one.
  useEffect(() => {
    const scheduler = new BeforeCaptureScheduler({
      createCapture,
      motionMs,
      shouldCapture: () => shouldCaptureBefore(readEligibilityInputs()),
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

  const awaitBefore = useCallback(
    (graceMs: number) => schedulerRef.current?.awaitBefore(graceMs) ?? Promise.resolve(null),
    [],
  );
  const getCapture = useCallback(() => schedulerRef.current?.getCapture() ?? null, []);

  return { awaitBefore, isEligible, ineligibleReason, getCapture };
}
