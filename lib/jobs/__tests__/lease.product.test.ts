import { describe, expect, it } from 'vitest';
import {
  MAX_COUNTED_RECLAIMS,
  NO_WORKER_AFTER_MS,
  attemptedSinceReclaim,
  failedForNoWorker,
  reclaimDecision,
  waitingForWorker,
  waitingSince,
} from '@/lib/jobs/lease';

const now = new Date('2026-11-29T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const base = { claimedAt: null, reclaimedAt: null, reclaims: 0, createdAt: ago(10 * MIN), now };

describe('reclaimDecision', () => {
  it('counts when a runner started and no reclaim has happened yet', () => {
    expect(reclaimDecision({ ...base, claimedAt: ago(5 * MIN) })).toBe('count');
  });

  it('counts when the claim is later than the last reclaim', () => {
    expect(reclaimDecision({ ...base, claimedAt: ago(2 * MIN), reclaimedAt: ago(5 * MIN), reclaims: 2 })).toBe('count');
  });

  it('requeues without counting when no runner started since the last reclaim', () => {
    expect(reclaimDecision({ ...base, claimedAt: ago(5 * MIN), reclaimedAt: ago(2 * MIN), reclaims: 1 })).toBe(
      'requeue',
    );
  });

  it('treats a claim at the very instant of the reclaim as no attempt', () => {
    const t = ago(MIN);
    expect(reclaimDecision({ ...base, claimedAt: t, reclaimedAt: t, reclaims: 1 })).toBe('requeue');
  });

  it('requeues a run no runner ever started', () => {
    expect(reclaimDecision(base)).toBe('requeue');
    expect(reclaimDecision({ ...base, reclaimedAt: ago(MIN) })).toBe('requeue');
  });

  it('fails when a real attempt dies after the allowed counted reclaims', () => {
    const input = { ...base, claimedAt: ago(MIN), reclaimedAt: ago(5 * MIN), reclaims: MAX_COUNTED_RECLAIMS };
    expect(reclaimDecision(input)).toBe('fail');
    expect(failedForNoWorker(input)).toBe(false);
  });

  it('still counts the last allowed reclaim', () => {
    expect(reclaimDecision({ ...base, claimedAt: ago(MIN), reclaims: MAX_COUNTED_RECLAIMS - 1 })).toBe('count');
  });

  it('honours a different ceiling', () => {
    expect(reclaimDecision({ ...base, claimedAt: ago(MIN), reclaims: 2, maxReclaims: 2 })).toBe('fail');
    expect(reclaimDecision({ ...base, claimedAt: ago(MIN), reclaims: 1, maxReclaims: 2 })).toBe('count');
  });

  it('never fails a run on requeues alone, however many minutes pass, until a day', () => {
    const input = { ...base, claimedAt: ago(NO_WORKER_AFTER_MS - MIN), reclaimedAt: ago(NO_WORKER_AFTER_MS - MIN) };
    expect(reclaimDecision(input)).toBe('requeue');
  });

  it('stops a run nobody picked up for a day', () => {
    const input = {
      ...base,
      createdAt: ago(NO_WORKER_AFTER_MS + 2 * MIN),
      claimedAt: ago(NO_WORKER_AFTER_MS + MIN),
      reclaimedAt: ago(NO_WORKER_AFTER_MS),
      reclaims: 1,
    };
    expect(reclaimDecision(input)).toBe('fail');
    expect(failedForNoWorker(input)).toBe(true);
  });

  it('stops a run that was queued a day ago and never started', () => {
    expect(reclaimDecision({ ...base, createdAt: ago(NO_WORKER_AFTER_MS) })).toBe('fail');
    expect(reclaimDecision({ ...base, createdAt: ago(NO_WORKER_AFTER_MS - MIN) })).toBe('requeue');
  });

  it('measures the day from the last sign of life, not from creation', () => {
    const input = {
      ...base,
      createdAt: ago(10 * NO_WORKER_AFTER_MS),
      heartbeatAt: ago(MIN),
      reclaimedAt: ago(30 * MIN),
    };
    expect(waitingSince(input)).toEqual(ago(MIN));
    expect(reclaimDecision(input)).toBe('count');
  });

  describe('rows from before the migration (claimedAt null)', () => {
    it('are judged as claimed at their heartbeat', () => {
      expect(reclaimDecision({ ...base, heartbeatAt: ago(5 * MIN) })).toBe('count');
      expect(attemptedSinceReclaim({ claimedAt: null, reclaimedAt: null, heartbeatAt: ago(MIN) })).toBe(true);
    });

    it('requeue once a reclaim has counted after that heartbeat', () => {
      expect(reclaimDecision({ ...base, heartbeatAt: ago(5 * MIN), reclaimedAt: ago(MIN), reclaims: 1 })).toBe(
        'requeue',
      );
    });

    it('fail at the ceiling like any attempt', () => {
      expect(reclaimDecision({ ...base, heartbeatAt: ago(5 * MIN), reclaims: MAX_COUNTED_RECLAIMS })).toBe('fail');
    });

    it('with no heartbeat either are a run nobody started', () => {
      expect(reclaimDecision({ ...base, heartbeatAt: null })).toBe('requeue');
    });
  });

  describe('skip', () => {
    it('leaves a live lease alone when the caller passes the lease', () => {
      expect(reclaimDecision({ ...base, claimedAt: ago(MIN), heartbeatAt: ago(30_000), leaseMs: 2 * MIN })).toBe(
        'skip',
      );
    });

    it('does not skip an expired lease', () => {
      expect(reclaimDecision({ ...base, claimedAt: ago(5 * MIN), heartbeatAt: ago(3 * MIN), leaseMs: 2 * MIN })).toBe(
        'count',
      );
    });

    it('does not skip without a lease length', () => {
      expect(reclaimDecision({ ...base, claimedAt: ago(MIN), heartbeatAt: ago(1000) })).toBe('count');
    });
  });

  it('ten passes in a row with no runner never reach count after the first', () => {
    let reclaimedAt: Date | null = null;
    let reclaims = 0;
    const claimedAt = ago(30 * MIN);
    for (let i = 0; i < 10; i++) {
      const at = new Date(now.getTime() + i * MIN);
      const v = reclaimDecision({ ...base, claimedAt, reclaimedAt, reclaims, now: at });
      if (v === 'count') {
        reclaims += 1;
        reclaimedAt = at;
      }
    }
    expect(reclaims).toBe(1);
  });
});

describe('waitingForWorker', () => {
  it('is true for a re-queued run no runner has claimed since', () => {
    expect(waitingForWorker({ claimedAt: ago(5 * MIN), reclaimedAt: ago(MIN), heartbeatAt: ago(4 * MIN) })).toBe(true);
    expect(waitingForWorker({ claimedAt: null, reclaimedAt: null, heartbeatAt: null })).toBe(true);
  });

  it('is false for a run a runner claimed since the last reclaim, or a pre-migration run in flight', () => {
    expect(waitingForWorker({ claimedAt: ago(MIN), reclaimedAt: ago(5 * MIN), heartbeatAt: ago(30_000) })).toBe(false);
    expect(waitingForWorker({ claimedAt: null, reclaimedAt: null, heartbeatAt: ago(30_000) })).toBe(false);
  });
});
