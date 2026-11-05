import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../../world';
import { PUMP_INTERVAL_MS, PUMP_MAX_TICKS, createBackgroundPump } from '../background';

function rig() {
  const clock = { now: 1000 };
  const timers = new Set<() => void>();
  const advanced: number[] = [];
  const pump = createBackgroundPump({
    advance: (dt) => advanced.push(dt),
    now: () => clock.now,
    every: (_ms, fn) => {
      timers.add(fn);
      return () => timers.delete(fn);
    },
  });
  const wake = (afterMs: number) => {
    clock.now += afterMs;
    for (const fn of [...timers]) fn();
  };
  return { pump, wake, advanced, timers };
}

describe('the background pump (a hosted world keeps running in a hidden tab)', () => {
  it('steps the elapsed time in whole ticks and carries the remainder', () => {
    const { pump, wake, advanced } = rig();
    pump.start();
    wake(1000);
    expect(advanced).toHaveLength(1000 / TICK_MS);
    expect(advanced.every((d) => d === TICK_MS)).toBe(true);
    advanced.length = 0;
    wake(PUMP_INTERVAL_MS + 20); // 520 ms: ten ticks and 20 ms owed
    expect(advanced).toHaveLength(10);
    advanced.length = 0;
    wake(30); // 20 + 30 = one more tick
    expect(advanced).toHaveLength(1);
  });

  it('does not spin through an hour of sleep: catch-up is capped', () => {
    const { pump, wake, advanced } = rig();
    pump.start();
    wake(3_600_000);
    expect(advanced).toHaveLength(PUMP_MAX_TICKS);
    advanced.length = 0;
    wake(TICK_MS);
    expect(advanced).toHaveLength(1);
  });

  it('is idempotent to start, and stopping stops the timer (the frame loop owns time while visible)', () => {
    const { pump, wake, advanced, timers } = rig();
    pump.start();
    pump.start();
    expect(timers.size).toBe(1);
    expect(pump.running).toBe(true);
    pump.stop();
    pump.stop();
    expect(pump.running).toBe(false);
    wake(5000);
    expect(advanced).toEqual([]);
    // Starting again does not owe the time it was off.
    pump.start();
    wake(TICK_MS);
    expect(advanced).toHaveLength(1);
  });
});
