import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleClicks } from './clicks';

function fakeContext() {
  const oscillators: {
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const ctx = {
    currentTime: 10,
    destination: {},
    createOscillator: vi.fn(() => {
      const osc = {
        frequency: param(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() })),
  };
  return { ctx: ctx as unknown as Parameters<typeof scheduleClicks>[0], oscillators };
}

const PLAN = { count: 8, beatS: 0.6, leadS: 1, clickS: 0.05 };

describe('scheduleClicks', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires a beat per click and then the end, and leaves no timer behind', () => {
    const { ctx } = fakeContext();
    const beats: number[] = [];
    const end = vi.fn();
    const run = scheduleClicks(ctx, PLAN, { beat: (i) => beats.push(i), end });
    expect(run.clicks).toHaveLength(8);
    vi.advanceTimersByTime(1000 + 8 * 600 + 10);
    expect(beats).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(end).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancel (Skip, unmount) clears every timer and silences every click still to come (finding f)', () => {
    const { ctx, oscillators } = fakeContext();
    const on = { beat: vi.fn(), end: vi.fn() };
    const run = scheduleClicks(ctx, PLAN, on);
    vi.advanceTimersByTime(1500);
    run.cancel();
    expect(vi.getTimerCount()).toBe(0);
    for (const osc of oscillators) {
      // Once when scheduled, once more (now) when cancelled.
      expect(osc.stop).toHaveBeenCalledTimes(2);
      expect(osc.disconnect).toHaveBeenCalled();
    }
    vi.advanceTimersByTime(10_000);
    expect(on.end).not.toHaveBeenCalled();
    run.cancel();
  });

  it('a click that already played is not stopped again', () => {
    const { ctx, oscillators } = fakeContext();
    const run = scheduleClicks(ctx, PLAN, { beat: () => {}, end: () => {} });
    oscillators[0].onended?.();
    run.cancel();
    expect(oscillators[0].stop).toHaveBeenCalledTimes(1);
    expect(oscillators[1].stop).toHaveBeenCalledTimes(2);
  });
});
