import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The activity emitter's contract (C7) is entirely about what it does NOT do:
 * it does not write on emit, it does not write the same view twice, and it does
 * not throw into whatever request happened to be holding it.
 *
 * The buffer is the whole feature — a VIEWED per scrolled card against a
 * synchronous insert is dozens of round trips on the request path — so these
 * tests assert the buffering itself, not just that rows eventually arrive.
 * Prisma is mocked; nothing here needs (or is allowed) a live database.
 */

const prismaMock = vi.hoisted(() => ({
  activity: { createMany: vi.fn() },
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import {
  emitActivity,
  flushActivity,
  bufferedActivityCount,
  __resetActivityBuffer,
} from '@/lib/activity/emit.server';
import { activityKey } from '@/lib/activity/types';

/** The rows handed to Postgres across every `createMany` so far. */
function writtenRows(): Array<Record<string, unknown>> {
  return prismaMock.activity.createMany.mock.calls.flatMap(
    (call) => (call[0] as { data: Array<Record<string, unknown>> }).data,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetActivityBuffer();
  prismaMock.activity.createMany.mockReset().mockResolvedValue({ count: 0 });
});

afterEach(() => {
  __resetActivityBuffer();
  vi.useRealTimers();
});

describe('emitActivity — buffering', () => {
  it('writes nothing on emit', async () => {
    emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    // Give any accidental promise chain a chance to run before asserting.
    await Promise.resolve();
    expect(prismaMock.activity.createMany).not.toHaveBeenCalled();
    expect(bufferedActivityCount()).toBe(1);
  });

  it('flushes on the timer, as ONE createMany for the whole window', async () => {
    emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p2' });
    emitActivity({ userId: 'u2', verb: 'PLAYED', kind: 'game', entityId: 'isleworks' });

    await vi.advanceTimersByTimeAsync(2_500);

    expect(prismaMock.activity.createMany).toHaveBeenCalledTimes(1);
    expect(writtenRows()).toHaveLength(3);
    expect(bufferedActivityCount()).toBe(0);
  });

  it('returns synchronously — a caller never awaits a row', () => {
    const returned = emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    expect(returned).toBeUndefined();
  });
});

describe('emitActivity — de-duplication inside one window', () => {
  it('collapses repeats of the same (user, verb, kind, entity)', async () => {
    for (let i = 0; i < 5; i++) {
      emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    }
    expect(bufferedActivityCount()).toBe(1);

    await flushActivity();
    expect(writtenRows()).toHaveLength(1);
  });

  it('keeps events that differ in any one field apart', async () => {
    emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    emitActivity({ userId: 'u2', verb: 'VIEWED', kind: 'post', entityId: 'p1' }); // user
    emitActivity({ userId: 'u1', verb: 'SAVED', kind: 'post', entityId: 'p1' }); // verb
    emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'game', entityId: 'p1' }); // kind
    emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p2' }); // entity

    expect(bufferedActivityCount()).toBe(5);
  });

  it('keeps the latest timestamp and merges meta, later keys winning', async () => {
    const first = new Date('2026-08-05T10:00:00.000Z');
    const second = new Date('2026-08-05T10:00:01.000Z');
    emitActivity({
      userId: 'u1',
      verb: 'PLAYED',
      kind: 'game',
      entityId: 'isleworks',
      meta: { level: 7, mode: 'story' },
      at: first,
    });
    emitActivity({
      userId: 'u1',
      verb: 'PLAYED',
      kind: 'game',
      entityId: 'isleworks',
      meta: { level: 8 },
      at: second,
    });

    await flushActivity();
    const rows = writtenRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].at).toEqual(second);
    expect(rows[0].meta).toEqual({ level: 8, mode: 'story' });
  });

  it('starts a fresh window after a flush — a later view is a new row', async () => {
    emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    await flushActivity();
    emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    await flushActivity();

    expect(prismaMock.activity.createMany).toHaveBeenCalledTimes(2);
    expect(writtenRows()).toHaveLength(2);
  });
});

describe('emitActivity — flush threshold', () => {
  it('flushes early once the buffer fills, without waiting for the timer', async () => {
    for (let i = 0; i < 200; i++) {
      emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: `p${i}` });
    }
    // No timer advance: the 200th emit is what triggers this.
    await vi.advanceTimersByTimeAsync(0);

    expect(prismaMock.activity.createMany).toHaveBeenCalledTimes(1);
    expect(writtenRows()).toHaveLength(200);
    expect(bufferedActivityCount()).toBe(0);
  });

  it('counts DISTINCT rows toward the threshold, not emits', async () => {
    for (let i = 0; i < 400; i++) {
      emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    }
    await vi.advanceTimersByTimeAsync(0);

    expect(prismaMock.activity.createMany).not.toHaveBeenCalled();
    expect(bufferedActivityCount()).toBe(1);
  });
});

describe('emitActivity — never throws into the caller', () => {
  it('drops events that could not be written', () => {
    expect(() => {
      emitActivity({ userId: '', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
      emitActivity({ userId: 'u1', verb: 'VIEWED', kind: '', entityId: 'p1' });
      emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: '' });
      // `kind` is VarChar(24): one over-long value fails the WHOLE createMany,
      // so it is rejected at the door rather than at flush time.
      emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'k'.repeat(25), entityId: 'p1' });
    }).not.toThrow();
    expect(bufferedActivityCount()).toBe(0);
  });

  it('swallows a failed flush and does not re-queue the batch', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    prismaMock.activity.createMany.mockRejectedValueOnce(new Error('connection refused'));

    emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    await expect(flushActivity()).resolves.toBe(1);

    // Dropped, not retried: re-queueing a batch that failed because the database
    // is down is how a bounded buffer becomes an unbounded one.
    expect(bufferedActivityCount()).toBe(0);
    await flushActivity();
    expect(prismaMock.activity.createMany).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

describe('flushActivity', () => {
  it('is a no-op on an empty buffer', async () => {
    await expect(flushActivity()).resolves.toBe(0);
    expect(prismaMock.activity.createMany).not.toHaveBeenCalled();
  });

  it('drains everything buffered — the shutdown path', async () => {
    emitActivity({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    emitActivity({ userId: 'u1', verb: 'SAVED', kind: 'post', entityId: 'p1' });

    await expect(flushActivity()).resolves.toBe(2);
    expect(bufferedActivityCount()).toBe(0);
    // …and the disarmed timer does not fire a second, empty write.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(prismaMock.activity.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('activityKey', () => {
  it('cannot be collided by a field that contains the separator', () => {
    const a = activityKey({ userId: 'u1', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    const b = activityKey({ userId: 'u1:VIEWED', verb: 'VIEWED', kind: 'post', entityId: 'p1' });
    expect(a).not.toBe(b);
  });
});
