// lib/dream-rift/__tests__/pool.test.ts
import { describe, it, expect } from 'vitest';
import { ObjectPool } from '../pool';

interface TestObj { id: number; active: boolean; value: number; }

describe('ObjectPool', () => {
  it('creates a pool of the specified size', () => {
    const pool = new ObjectPool<TestObj>(100, (i) => ({ id: i, active: false, value: 0 }));
    expect(pool.capacity).toBe(100);
    expect(pool.activeCount).toBe(0);
  });

  it('acquires an inactive object and marks it active', () => {
    const pool = new ObjectPool<TestObj>(10, (i) => ({ id: i, active: false, value: 0 }));
    const obj = pool.acquire();
    expect(obj).not.toBeNull();
    expect(obj!.active).toBe(true);
    expect(pool.activeCount).toBe(1);
  });

  it('returns null when pool is exhausted', () => {
    const pool = new ObjectPool<TestObj>(2, (i) => ({ id: i, active: false, value: 0 }));
    pool.acquire();
    pool.acquire();
    expect(pool.acquire()).toBeNull();
  });

  it('releases objects back to pool', () => {
    const pool = new ObjectPool<TestObj>(2, (i) => ({ id: i, active: false, value: 0 }));
    const obj = pool.acquire()!;
    pool.release(obj);
    expect(obj.active).toBe(false);
    expect(pool.activeCount).toBe(0);
  });

  it('iterates only over active objects', () => {
    const pool = new ObjectPool<TestObj>(5, (i) => ({ id: i, active: false, value: 0 }));
    pool.acquire()!.value = 10;
    pool.acquire()!.value = 20;
    const values: number[] = [];
    pool.forEachActive((obj) => values.push(obj.value));
    expect(values).toEqual([10, 20]);
  });

  it('releaseAll deactivates everything', () => {
    const pool = new ObjectPool<TestObj>(5, (i) => ({ id: i, active: false, value: 0 }));
    pool.acquire(); pool.acquire(); pool.acquire();
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
  });
});
