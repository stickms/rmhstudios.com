import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BeforeCaptureScheduler,
  type BeforeCaptureOptions,
  type IdleScheduler,
} from '../before-capture';
import { BEFORE_GRACE_MS, BEFORE_STALE_MS } from '../constants';
import { CaptureError, type CaptureApi, type CaptureOptions, type CaptureResult } from '../types';

const MOTION = 500;

interface FakeBitmap {
  close: ReturnType<typeof vi.fn>;
}

/** A capture API whose captures take `delayMs` of fake time and can be made to fail. */
function makeCapture(opts: { delayMs?: number; fail?: () => Error | null } = {}) {
  const bitmaps: FakeBitmap[] = [];
  const calls: { at: number; options: CaptureOptions }[] = [];
  const api = {
    createSession: vi.fn(async () => {}),
    captureViewport: vi.fn(async (options: CaptureOptions): Promise<CaptureResult> => {
      calls.push({ at: Date.now(), options });
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const err = opts.fail?.();
      if (err) throw err;
      const bitmap: FakeBitmap = { close: vi.fn() };
      bitmaps.push(bitmap);
      return {
        bitmap: bitmap as unknown as ImageBitmap,
        width: 1,
        height: 1,
        scale: 1,
        durationMs: 42,
      };
    }),
    dispose: vi.fn(),
  };
  return { api: api as unknown as CaptureApi & typeof api, bitmaps, calls };
}

/** An idle scheduler that fires after 20 fake ms, like a quiet main thread. */
const fakeIdle: IdleScheduler = (cb) => {
  const h = setTimeout(cb, 20);
  return () => clearTimeout(h);
};

function make(
  capture = makeCapture(),
  extra: Partial<BeforeCaptureOptions> = {},
): { scheduler: BeforeCaptureScheduler; capture: ReturnType<typeof makeCapture> } {
  const scheduler = new BeforeCaptureScheduler({
    createCapture: () => capture.api,
    motionMs: MOTION,
    scheduleIdle: fakeIdle,
    ...extra,
  });
  return { scheduler, capture };
}

describe('BeforeCaptureScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it('never captures before MOTION_MS has passed, and not before an idle period', async () => {
    const { scheduler, capture } = make();
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION - 1);
    expect(capture.api.captureViewport).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    // MOTION elapsed, idle not yet.
    expect(capture.api.captureViewport).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(capture.api.captureViewport).toHaveBeenCalledTimes(1);
    expect(capture.calls[0].at).toBeGreaterThanOrEqual(MOTION);
    expect(capture.calls[0].options.phase).toBe('before');
    expect(capture.calls[0].options.exclude).toContain('.radial-hub');
    expect(scheduler.state().lastStartedAfterOpenMs).toBeGreaterThanOrEqual(MOTION);
  });

  it('does not capture at all when the hub closes during the morph', async () => {
    const { scheduler, capture } = make();
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(300);
    scheduler.hubClosed();
    await vi.advanceTimersByTimeAsync(5000);
    expect(capture.api.captureViewport).not.toHaveBeenCalled();
    expect(scheduler.state().pending).toBe(false);
  });

  it('skips the capture when shouldCapture says no (flag off / reduced motion)', async () => {
    const { scheduler, capture } = make(makeCapture(), { shouldCapture: () => false });
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    expect(capture.api.captureViewport).not.toHaveBeenCalled();
  });

  it('closing the hub frees the held bitmap', async () => {
    const { scheduler, capture } = make();
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    expect(scheduler.state().held).toBe(true);
    scheduler.hubClosed();
    expect(capture.bitmaps[0].close).toHaveBeenCalledTimes(1);
    expect(scheduler.state().held).toBe(false);
    expect(await scheduler.awaitBefore(BEFORE_GRACE_MS)).toBeNull();
  });

  it('closes a capture that finishes after the hub closed, and aborts its signal', async () => {
    const { scheduler, capture } = make(makeCapture({ delayMs: 200 }));
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 50);
    expect(scheduler.state().pending).toBe(true);
    scheduler.hubClosed();
    expect(capture.calls[0].options.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(capture.bitmaps[0].close).toHaveBeenCalledTimes(1);
    expect(scheduler.state().held).toBe(false);
  });

  it('hands the bitmap to the caller without closing it', async () => {
    const { scheduler, capture } = make();
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    const bitmap = await scheduler.awaitBefore(BEFORE_GRACE_MS);
    expect(bitmap).toBe(capture.bitmaps[0]);
    expect(capture.bitmaps[0].close).not.toHaveBeenCalled();
    // Ownership moved: closing the hub must not close it, nor can it be taken twice.
    scheduler.hubClosed();
    expect(capture.bitmaps[0].close).not.toHaveBeenCalled();
    scheduler.hubOpened();
    expect(await scheduler.awaitBefore(BEFORE_GRACE_MS)).toBeNull();
  });

  it('awaitBefore waits for an in-flight capture within the grace window', async () => {
    const { scheduler, capture } = make(makeCapture({ delayMs: 100 }));
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 30);
    const pending = scheduler.awaitBefore(BEFORE_GRACE_MS);
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toBe(capture.bitmaps[0]);
  });

  it('awaitBefore returns null on a grace miss and keeps the late bitmap until close', async () => {
    const { scheduler, capture } = make(makeCapture({ delayMs: 600 }));
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 30);
    const pending = scheduler.awaitBefore(BEFORE_GRACE_MS);
    await vi.advanceTimersByTimeAsync(BEFORE_GRACE_MS);
    expect(await pending).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(scheduler.state().held).toBe(true);
    scheduler.hubClosed();
    expect(capture.bitmaps[0].close).toHaveBeenCalledTimes(1);
  });

  it('awaitBefore is null immediately when nothing is held or running', async () => {
    const { scheduler } = make();
    expect(await scheduler.awaitBefore(BEFORE_GRACE_MS)).toBeNull();
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(100); // still inside the morph: no capture started
    expect(await scheduler.awaitBefore(BEFORE_GRACE_MS)).toBeNull();
  });

  it('retakes a stale bitmap on the next idle and closes the old one', async () => {
    const { scheduler, capture } = make();
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    expect(capture.api.captureViewport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(BEFORE_STALE_MS + 100);
    expect(capture.api.captureViewport).toHaveBeenCalledTimes(2);
    expect(capture.bitmaps[0].close).toHaveBeenCalledTimes(1);
    expect(capture.bitmaps[1].close).not.toHaveBeenCalled();
    expect(scheduler.state().ageMs).toBeLessThan(1000);
    expect(await scheduler.awaitBefore(BEFORE_GRACE_MS)).toBe(capture.bitmaps[1]);
  });

  it('does not hand out a bitmap past stale', async () => {
    const { scheduler } = make();
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    // Jump the clock without firing the stale timer.
    vi.setSystemTime(Date.now() + BEFORE_STALE_MS + 1);
    expect(await scheduler.awaitBefore(BEFORE_GRACE_MS)).toBeNull();
  });

  it('turns capture errors into null and never throws', async () => {
    const failures = [new CaptureError('timeout'), new CaptureError('failed'), new Error('boom')];
    for (const err of failures) {
      const { scheduler, capture } = make(makeCapture({ fail: () => err }));
      scheduler.hubOpened();
      await vi.advanceTimersByTimeAsync(MOTION + 100);
      await expect(scheduler.awaitBefore(BEFORE_GRACE_MS)).resolves.toBeNull();
      expect(scheduler.state().lastError).toBe(err.message);
      expect(scheduler.state().held).toBe(false);
      // No retry loop within the same open.
      await vi.advanceTimersByTimeAsync(BEFORE_STALE_MS * 2);
      expect(capture.api.captureViewport).toHaveBeenCalledTimes(1);
    }
  });

  it('survives session creation throwing', async () => {
    const capture = makeCapture();
    capture.api.createSession.mockRejectedValueOnce(new Error('no session'));
    const { scheduler } = make(capture);
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    await expect(scheduler.awaitBefore(BEFORE_GRACE_MS)).resolves.toBeNull();
    expect(scheduler.state().lastError).toBe('no session');
  });

  it('survives the capture factory throwing (module not implemented yet)', async () => {
    const scheduler = new BeforeCaptureScheduler({
      createCapture: () => {
        throw new Error('eversion: createCapture not implemented (T17)');
      },
      motionMs: MOTION,
      scheduleIdle: fakeIdle,
    });
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    await expect(scheduler.awaitBefore(BEFORE_GRACE_MS)).resolves.toBeNull();
    expect(scheduler.state().lastError).toMatch(/not implemented/);
  });

  it('captures again on the next open', async () => {
    const { scheduler, capture } = make();
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    scheduler.hubClosed();
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    expect(capture.api.captureViewport).toHaveBeenCalledTimes(2);
  });

  it('dispose frees the bitmap and the session', async () => {
    const { scheduler, capture } = make();
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    scheduler.dispose();
    expect(capture.bitmaps[0].close).toHaveBeenCalledTimes(1);
    expect(capture.api.dispose).toHaveBeenCalledTimes(1);
    scheduler.hubOpened(); // inert after dispose
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    expect(capture.api.captureViewport).toHaveBeenCalledTimes(1);
  });

  it('with no requestIdleCallback the default scheduler falls back to a timer', async () => {
    const capture = makeCapture();
    const scheduler = new BeforeCaptureScheduler({
      createCapture: () => capture.api,
      motionMs: MOTION,
    });
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    expect(capture.api.captureViewport).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('queues the capture of a re-open behind a capture still in flight from the previous open', async () => {
    const capture = makeCapture({ delayMs: 400 });
    const { scheduler } = make(capture);
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100); // capture #1 is now running
    expect(capture.api.captureViewport).toHaveBeenCalledTimes(1);
    scheduler.hubClosed();
    scheduler.hubOpened();
    // The new open's idle fires while #1 (400 ms) is still in flight: it must wait, not vanish.
    await vi.advanceTimersByTimeAsync(MOTION + 50);
    await vi.advanceTimersByTimeAsync(2000);
    expect(capture.api.captureViewport).toHaveBeenCalledTimes(2);
    await expect(scheduler.awaitBefore(BEFORE_GRACE_MS)).resolves.not.toBeNull();
  });

  it('scales the capture ceiling by tier (spec 6.2), defaulting to the largest', async () => {
    for (const [tier, cap] of [
      ['low', 1],
      ['mid', 1.25],
      ['high', 1.5],
    ] as const) {
      const capture = makeCapture();
      const { scheduler } = make(capture, { tier });
      scheduler.hubOpened();
      await vi.advanceTimersByTimeAsync(MOTION + 100);
      expect(capture.calls[0].options.scaleCap).toBe(cap);
      scheduler.dispose();
    }
    const late = makeCapture();
    const known: { tier: 'low' | undefined } = { tier: undefined };
    const { scheduler } = make(late, { tier: () => known.tier });
    known.tier = 'low'; // resolved after the scheduler was built
    scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    expect(late.calls[0].options.scaleCap).toBe(1);
    scheduler.dispose();
    const none = makeCapture();
    const m = make(none);
    m.scheduler.hubOpened();
    await vi.advanceTimersByTimeAsync(MOTION + 100);
    expect(none.calls[0].options.scaleCap).toBe(1.5);
    m.scheduler.dispose();
  });
});
