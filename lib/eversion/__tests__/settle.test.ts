// @vitest-environment node
/**
 * The AFTER readiness gate's decision logic (spec amendment 2026-10-18 §6.4a), against a scripted
 * probe and a simulated clock. The DOM half (`createDomProbe`) is exercised for real by
 * `testing/e2e/eversion-late-content.mjs`, which is what failed before the gate existed.
 */

import { describe, expect, it } from 'vitest';
import {
  AFTER_CAPTURE_RESERVE_MS,
  AFTER_QUIET_CAP_MS,
  AFTER_QUIET_MS,
  AFTER_RENDER_GRACE_MS,
  AFTER_STABLE_FRAMES,
  PLACEHOLDER_XFADE_MS,
  STRETCH_CAP_MS,
} from '../constants';
import { afterSettleDeadlines, waitForSettled } from '../settle';
import type { SettleReading, SettleRequest } from '../settle';

const FRAME = 16;
const CALM: SettleReading = {
  fetching: 0,
  images: 0,
  fontsLoading: false,
  placeholders: 0,
  lastChangeAt: -Infinity,
};

/** A page whose reading is a function of the simulated time; `nextFrame` advances 16 ms. */
function sim(page: (t: number) => Partial<SettleReading>, opts: Partial<SettleRequest> = {}) {
  let t = 0;
  let reads = 0;
  const env = {
    now: () => t,
    nextFrame: async () => {
      t += FRAME;
    },
  };
  const probe = {
    read: () => {
      reads++;
      return { ...CALM, ...page(t) };
    },
    dispose() {},
  };
  const req: SettleRequest = {
    soft: () => 3000,
    hard: () => 5500,
    cancelled: () => false,
    hurried: () => false,
    ...opts,
  };
  return { run: () => waitForSettled(probe, env, req), at: () => t, reads: () => reads };
}

describe('afterSettleDeadlines', () => {
  it('works back from the timeline cap: the crossfade and the capture must still fit', () => {
    const d = afterSettleDeadlines(6300);
    expect(d.hard).toBe(6300 - PLACEHOLDER_XFADE_MS - AFTER_CAPTURE_RESERVE_MS);
    // Soft is where the eversion would START to wait: a stretch cap earlier than hard.
    expect(d.soft).toBe(d.hard - STRETCH_CAP_MS);
    expect(d.soft).toBeLessThan(d.hard);
  });
});

describe('waitForSettled', () => {
  it('adds no latency when the page is already settled: returns on the second frame, like the two nextFrames it replaces', async () => {
    const s = sim(() => ({}));
    const r = await s.run();
    expect(r).toMatchObject({ settled: true, reason: 'settled' });
    // AFTER_STABLE_FRAMES readings, one frame apart.
    expect(s.reads()).toBe(AFTER_STABLE_FRAMES);
    expect(r.waitedMs).toBe((AFTER_STABLE_FRAMES - 1) * FRAME);
  });

  it('waits out skeletons: a column of placeholders is not a page', async () => {
    // Content arrives 900 ms in (the late-content e2e's delay).
    const s = sim((t) => ({
      placeholders: t < 900 ? 6 : 0,
      lastChangeAt: t < 900 ? -Infinity : 900,
    }));
    const r = await s.run();
    expect(r.reason).toBe('settled');
    expect(r.waitedMs).toBeGreaterThanOrEqual(900);
    // ...and then lets the render land: the DOM must have been quiet AFTER_QUIET_MS.
    expect(r.waitedMs).toBeGreaterThanOrEqual(900 + AFTER_QUIET_MS - FRAME);
  });

  it('waits for a query that has not loaded its first data, even with nothing drawn yet to see', async () => {
    const s = sim((t) => ({ fetching: t < 600 ? 1 : 0 }));
    const r = await s.run();
    expect(r.reason).toBe('settled');
    expect(r.waitedMs).toBeGreaterThanOrEqual(600);
  });

  it('waits for images in the viewport and for fonts', async () => {
    const img = await sim((t) => ({ images: t < 400 ? 2 : 0 })).run();
    expect(img.waitedMs).toBeGreaterThanOrEqual(400);
    const font = await sim((t) => ({ fontsLoading: t < 300 })).run();
    expect(font.waitedMs).toBeGreaterThanOrEqual(300);
  });

  it('waits for the layout to stop moving (a shift or a swapped node within the quiet window)', async () => {
    // Something changes every 40 ms until 500 ms.
    const s = sim((t) => ({ lastChangeAt: t < 500 ? t - (t % 40) : 480 }));
    const r = await s.run();
    expect(r.reason).toBe('settled');
    expect(r.waitedMs).toBeGreaterThanOrEqual(500);
  });

  it('a page that never stops mutating (a ticker) is waited for only AFTER_QUIET_CAP_MS once everything else is in order', async () => {
    const s = sim((t) => ({ lastChangeAt: t })); // changed this very instant, always
    const r = await s.run();
    expect(r.reason).toBe('settled');
    expect(r.waitedMs).toBeGreaterThanOrEqual(AFTER_QUIET_CAP_MS);
    expect(r.waitedMs).toBeLessThan(AFTER_QUIET_CAP_MS + 4 * FRAME);
  });

  it('past the soft deadline a skeleton with nothing loading behind it is a page at rest, not a reason to wait', async () => {
    const s = sim(() => ({ placeholders: 3 })); // a permanent shimmer
    const r = await s.run();
    expect(r.reason).toBe('rested');
    expect(r.settled).toBe(false);
    // It waited the free window out (the eversion was still turning), and not a frame past soft + the grace.
    expect(r.waitedMs).toBeGreaterThanOrEqual(3000);
    expect(r.waitedMs).toBeLessThanOrEqual(3000 + AFTER_RENDER_GRACE_MS + 2 * FRAME);
  });

  it('past the soft deadline ACTIVITY still holds the capture, up to the hard deadline, and then it goes anyway', async () => {
    const s = sim(() => ({ fetching: 1, placeholders: 4 })); // never arrives
    const r = await s.run();
    expect(r.reason).toBe('hard-deadline');
    expect(r.waitedMs).toBeGreaterThanOrEqual(5500);
    expect(r.waitedMs).toBeLessThanOrEqual(5500 + FRAME);
  });

  it('content that arrives between soft and hard is waited for', async () => {
    const s = sim((t) => ({ fetching: t < 4200 ? 1 : 0, placeholders: t < 4250 ? 4 : 0 }));
    const r = await s.run();
    expect(r.reason).toBe('settled');
    expect(r.waitedMs).toBeGreaterThanOrEqual(4250);
    expect(r.waitedMs).toBeLessThan(5500);
    expect(r.last?.placeholders).toBe(0);
  });

  it('past soft, the fetch that finishes is given AFTER_RENDER_GRACE_MS for its result to render (placeholders still up)', async () => {
    const s = sim((t) => ({ fetching: t < 4200 ? 1 : 0, placeholders: 4 }));
    const r = await s.run();
    expect(r.reason).toBe('rested');
    expect(r.waitedMs).toBeGreaterThanOrEqual(4200 + AFTER_RENDER_GRACE_MS - FRAME);
    expect(r.waitedMs).toBeLessThan(4200 + AFTER_RENDER_GRACE_MS + 3 * FRAME);
  });

  it('a hurried run (fast-forward) captures at once; a cancelled one (ended, UNWRAP started) stops', async () => {
    const hurried = await sim(() => ({ fetching: 1 }), { hurried: () => true }).run();
    expect(hurried.reason).toBe('hurried');
    expect(hurried.waitedMs).toBe(0);
    const s = sim(() => ({ fetching: 1 }), { cancelled: () => true });
    const cancelled = await s.run();
    expect(cancelled.reason).toBe('cancelled');
    expect(s.reads()).toBe(0);
  });

  it('re-reads the deadlines every frame: a fast-forward that pulls them in ends the wait', async () => {
    let hard = 5500;
    let t = 0;
    const r = await waitForSettled(
      { read: () => ({ ...CALM, fetching: 1 }), dispose() {} },
      {
        now: () => t,
        nextFrame: async () => {
          t += FRAME;
          if (t >= 1000) hard = 1000;
        },
      },
      { soft: () => 0, hard: () => hard, cancelled: () => false, hurried: () => false },
    );
    expect(r.reason).toBe('hard-deadline');
    expect(r.waitedMs).toBeLessThan(1100);
  });
});
