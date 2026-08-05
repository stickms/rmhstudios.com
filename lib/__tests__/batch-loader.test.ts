import { describe, it, expect, vi } from 'vitest';
import { createBatcher, createRowBatcher } from '@/lib/db/batch.server';

/**
 * The whole value of `createBatcher` is the claim "N `load()` calls in one turn
 * become one fetch". That claim is invisible at the call site — the code reads
 * identically whether it batches or not — so it is asserted here by counting
 * fetches, which is the only thing a reviewer cannot check by eye.
 *
 * The negative case is tested just as deliberately: a sequential `for … await`
 * loop must NOT batch. That is not a limitation to work around, it is the
 * mechanism, and a future "improvement" that made the batcher wait longer to
 * catch sequential loops would introduce unbounded latency for one saved query.
 */

describe('createBatcher', () => {
  it('issues ONE fetch for N keys requested in the same microtask', async () => {
    const fetchMany = vi.fn(async (keys: number[]) => new Map(keys.map((k) => [k, k * 2])));
    const load = createBatcher(fetchMany);

    const values = await Promise.all([1, 2, 3, 4, 5].map((k) => load(k)));

    expect(fetchMany).toHaveBeenCalledTimes(1);
    expect(fetchMany).toHaveBeenCalledWith([1, 2, 3, 4, 5]);
    expect(values).toEqual([2, 4, 6, 8, 10]);
  });

  it('batches loads made from inside concurrent async callbacks', async () => {
    // The real call shape: an async `.map` body runs synchronously up to its
    // first await, so every load lands in the same turn.
    const fetchMany = vi.fn(async (keys: string[]) => new Map(keys.map((k) => [k, k.length])));
    const load = createBatcher(fetchMany);

    const rows = [{ id: 'aa' }, { id: 'bbb' }, { id: 'c' }];
    const out = await Promise.all(
      rows.map(async (row) => {
        const size = await load(row.id);
        return { id: row.id, size };
      }),
    );

    expect(fetchMany).toHaveBeenCalledTimes(1);
    expect(out).toEqual([
      { id: 'aa', size: 2 },
      { id: 'bbb', size: 3 },
      { id: 'c', size: 1 },
    ]);
  });

  it('deduplicates repeated keys within a batch', async () => {
    const fetchMany = vi.fn(async (keys: string[]) => new Map(keys.map((k) => [k, k])));
    const load = createBatcher(fetchMany);

    await Promise.all([load('a'), load('b'), load('a'), load('a')]);

    expect(fetchMany).toHaveBeenCalledTimes(1);
    expect(fetchMany).toHaveBeenCalledWith(['a', 'b']);
  });

  it('resolves a missing key to undefined rather than throwing', async () => {
    const load = createBatcher(async (_keys: string[]) => new Map<string, number>());
    expect(await load('nope')).toBeUndefined();
  });

  it('opens a new batch for the next turn', async () => {
    const fetchMany = vi.fn(async (keys: number[]) => new Map(keys.map((k) => [k, k])));
    const load = createBatcher(fetchMany);

    await Promise.all([load(1), load(2)]);
    await Promise.all([load(3), load(4)]);

    expect(fetchMany).toHaveBeenCalledTimes(2);
    expect(fetchMany).toHaveBeenNthCalledWith(1, [1, 2]);
    expect(fetchMany).toHaveBeenNthCalledWith(2, [3, 4]);
  });

  it('does NOT batch a sequential await loop — that is the mechanism, not a bug', async () => {
    const fetchMany = vi.fn(async (keys: number[]) => new Map(keys.map((k) => [k, k])));
    const load = createBatcher(fetchMany);

    for (const key of [1, 2, 3]) await load(key);

    expect(fetchMany).toHaveBeenCalledTimes(3);
  });

  it('splits an oversized batch instead of building one huge IN (…) list', async () => {
    // An unbounded `in` is planned badly by Postgres, so a 2000-key batch would
    // trade the N+1 for one query that falls over under load.
    const fetchMany = vi.fn(async (keys: number[]) => new Map(keys.map((k) => [k, k])));
    const load = createBatcher(fetchMany, { maxBatchSize: 2 });

    const keys = [1, 2, 3, 4, 5];
    expect(await Promise.all(keys.map((k) => load(k)))).toEqual(keys);
    expect(fetchMany).toHaveBeenCalledTimes(3);
    expect(fetchMany.mock.calls.map((c) => c[0])).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('rejects every waiter on a failed fetch, and stays usable afterwards', async () => {
    let fail = true;
    const fetchMany = vi.fn(async (keys: number[]) => {
      if (fail) throw new Error('db down');
      return new Map(keys.map((k) => [k, k]));
    });
    const load = createBatcher(fetchMany);

    await expect(Promise.all([load(1), load(2)])).rejects.toThrow('db down');

    // A poisoned pending list would make every subsequent batch fail too.
    fail = false;
    expect(await Promise.all([load(3), load(4)])).toEqual([3, 4]);
  });
});

describe('createRowBatcher', () => {
  it('keys rows by the supplied field in one fetch', async () => {
    const fetchRows = vi.fn(async (ids: string[]) => ids.map((id) => ({ id, name: `u-${id}` })));
    const load = createRowBatcher(fetchRows, (row) => row.id);

    const rows = await Promise.all(['a', 'b'].map((id) => load(id)));

    expect(fetchRows).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([
      { id: 'a', name: 'u-a' },
      { id: 'b', name: 'u-b' },
    ]);
  });

  it('leaves keys the fetch did not return as undefined', async () => {
    const load = createRowBatcher(
      async (ids: string[]) => ids.filter((id) => id !== 'gone').map((id) => ({ id })),
      (row) => row.id,
    );
    expect(await Promise.all([load('here'), load('gone')])).toEqual([{ id: 'here' }, undefined]);
  });
});
