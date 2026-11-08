/**
 * A celebration discharges the jelly at its origin. The arc runtime is installed lazily (on a press, removed 10 s
 * after the last one: lib/jelly/arc-lazy.ts), so a celebration that is not preceded by a click must install it first
 * (`ensureClickArcs`), or `dischargeAt` is a silent no-op. Suite runs in `node`; React's hooks are stubbed to run the
 * callback directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];

vi.mock('react', () => ({
  useCallback: <T>(fn: T) => fn,
  useEffect: () => {},
  useRef: <T>(v: T) => ({ current: v }),
}));
vi.mock('@/hooks/useReducedMotion', () => ({ prefersReducedMotion: () => false }));
vi.mock('canvas-confetti', () => ({ default: () => order.push('confetti') }));
vi.mock('@/lib/jelly/arc-lazy', () => ({
  ensureClickArcs: async () => {
    await Promise.resolve();
    order.push('ensure');
  },
}));
vi.mock('@/lib/jelly/arcs', () => ({
  dischargeAt: (x: number, y: number) => {
    order.push(`discharge:${x},${y}`);
    return true;
  },
}));

describe('useCelebration', () => {
  beforeEach(() => {
    order.length = 0;
    (globalThis as { window?: unknown }).window = { innerWidth: 1000, innerHeight: 800 };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('installs the click-arc runtime before discharging at the burst origin', async () => {
    const { useCelebration } = await import('../useCelebration');
    const celebrate = useCelebration();
    await celebrate({ origin: { x: 0.5, y: 0.5 } });
    await vi.waitFor(() => expect(order.some((o) => o.startsWith('discharge'))).toBe(true));
    expect(order.indexOf('ensure')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('ensure')).toBeLessThan(order.indexOf('discharge:500,400'));
  });
});
