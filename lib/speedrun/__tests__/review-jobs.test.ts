import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/speedrun/speedrun.server', () => ({ reverifyPending: vi.fn() }));

const { runSpeedrunReverify, SPEEDRUN_REVERIFY_BATCH, SPEEDRUN_REVERIFY_CAP, SPEEDRUN_REVERIFY_CRON } =
  await import('@/lib/speedrun/review-jobs.server');

const cursor = (n: number) => ({ createdAt: new Date(n), id: `e${n}` });

describe('the nightly speedrun pass', () => {
  it('runs at 04:23 UTC', () => {
    expect(SPEEDRUN_REVERIFY_CRON).toBe('23 4 * * *');
  });

  it('batches of 200 and stops at 2,000 runs', async () => {
    let n = 0;
    const pass = vi.fn(async (limit: number) => {
      n += limit;
      return { checked: limit, verified: 1, rejected: 0, stillPending: limit - 1, last: cursor(n) };
    });
    const total = await runSpeedrunReverify(pass);
    expect(pass).toHaveBeenCalledTimes(SPEEDRUN_REVERIFY_CAP / SPEEDRUN_REVERIFY_BATCH);
    expect(total.checked).toBe(SPEEDRUN_REVERIFY_CAP);
    expect(total.verified).toBe(10);
  });

  it('walks past the previous batch instead of re-reading it', async () => {
    const pass = vi.fn(async (limit: number, after?: { id: string }) => {
      return after
        ? { checked: 5, verified: 0, rejected: 0, stillPending: 5, last: cursor(2) }
        : { checked: limit, verified: 0, rejected: 0, stillPending: limit, last: cursor(1) };
    });
    await runSpeedrunReverify(pass);
    expect(pass.mock.calls[1]?.[1]).toEqual(cursor(1));
  });

  it('stops when the queue is drained (a short batch)', async () => {
    const pass = vi.fn(async () => ({ checked: 37, verified: 30, rejected: 7, stillPending: 0, last: cursor(1) }));
    const total = await runSpeedrunReverify(pass);
    expect(pass).toHaveBeenCalledTimes(1);
    expect(total).toEqual({ checked: 37, verified: 30, rejected: 7, stillPending: 0 });
  });

  it('an empty queue is one cheap pass', async () => {
    const pass = vi.fn(async () => ({ checked: 0, verified: 0, rejected: 0, stillPending: 0, last: null }));
    expect((await runSpeedrunReverify(pass)).checked).toBe(0);
    expect(pass).toHaveBeenCalledTimes(1);
  });
});
