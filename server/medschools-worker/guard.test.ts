import { describe, expect, it } from 'vitest';
import { createGuard } from './guard';

function setup() {
  const logs: string[] = [];
  const errors: string[] = [];
  let stopping = false;
  let t = 0;
  const inFlight = new Set<Promise<void>>();
  const guarded = createGuard({
    log: { info: (l) => logs.push(l), error: (l) => errors.push(l) },
    isStopping: () => stopping,
    inFlight,
    now: () => t,
  });
  return {
    guarded,
    logs,
    errors,
    inFlight,
    advance: (ms: number) => (t += ms),
    stop: () => (stopping = true),
  };
}
const gate = () => {
  let release!: () => void;
  const p = new Promise<void>((res) => (release = res));
  return { p, release };
};

describe('createGuard', () => {
  it('skips a tick while the previous run is in flight, then runs again once it ends', async () => {
    const s = setup();
    const g = gate();
    let runs = 0;
    const tick = s.guarded('job', async () => {
      runs++;
      await g.p;
    });
    const first = tick();
    await tick();
    expect(runs).toBe(1);
    expect(s.logs.join('\n')).toContain('job tick skipped');
    g.release();
    await first;
    await tick();
    expect(runs).toBe(2);
    expect(s.inFlight.size).toBe(0);
  });

  it('a run hung past its max runtime is logged loudly, abandoned, and the next tick runs', async () => {
    const s = setup();
    const hung = gate(); // never released: a request that never settles
    let runs = 0;
    const tick = s.guarded(
      'interviews',
      async () => {
        runs++;
        if (runs === 1) await hung.p;
      },
      60_000,
    );
    void tick();
    s.advance(30_000);
    await tick();
    expect(runs).toBe(1); // still within its max runtime: skipped, not abandoned
    expect(s.errors).toEqual([]);
    s.advance(40_000);
    await tick();
    expect(runs).toBe(2);
    expect(s.errors.join('\n')).toMatch(
      /interviews run has been in flight for 1 min, over its max runtime of 1 min: treating it as hung/,
    );
    // the abandoned run does not hold shutdown
    expect(s.inFlight.size).toBe(0);
  });

  it('an abandoned run finishing late does not release a newer run', async () => {
    const s = setup();
    const old = gate();
    const fresh = gate();
    let runs = 0;
    const tick = s.guarded(
      'job',
      async () => {
        runs++;
        await (runs === 1 ? old.p : fresh.p);
      },
      1000,
    );
    const first = tick();
    s.advance(2000);
    const second = tick();
    old.release();
    await first;
    await tick(); // the newer run is still in flight: this tick must be skipped
    expect(runs).toBe(2);
    fresh.release();
    await second;
    await tick();
    expect(runs).toBe(3);
  });

  it('without a max runtime a long run is only skipped over, never abandoned', async () => {
    const s = setup();
    const g = gate();
    let runs = 0;
    const tick = s.guarded('job', async () => {
      runs++;
      await g.p;
    });
    void tick();
    s.advance(10 * 3_600_000);
    await tick();
    expect(runs).toBe(1);
    expect(s.errors).toEqual([]);
    g.release();
  });

  it('a throwing run is caught and logged, and does not wedge the guard', async () => {
    const s = setup();
    let runs = 0;
    const tick = s.guarded('job', async () => {
      runs++;
      throw new Error('boom');
    });
    await tick();
    await tick();
    expect(runs).toBe(2);
    expect(s.errors.join('\n')).toContain('job run failed: boom');
  });

  it('starts nothing once shutdown has begun', async () => {
    const s = setup();
    let runs = 0;
    const tick = s.guarded('job', async () => {
      runs++;
    });
    s.stop();
    await tick();
    expect(runs).toBe(0);
  });
});
