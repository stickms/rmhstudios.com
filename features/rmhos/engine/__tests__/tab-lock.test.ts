import { describe, expect, it } from 'vitest';
import { acquireHomeLock, holdHomeLock, type LockManagerLike } from '../tab-lock';

/** Grants a name to one holder at a time, like navigator.locks with ifAvailable. */
function fakeLocks(): LockManagerLike & {
  held: Set<string>;
} {
  const held = new Set<string>();
  return {
    held,
    async request(name, _o, cb) {
      if (held.has(name)) return cb(null);
      held.add(name);
      try {
        await cb({});
      } finally {
        held.delete(name);
      }
    },
  };
}

describe('acquireHomeLock', () => {
  it('grants the first holder and refuses the second for the same account', async () => {
    const locks = fakeLocks();
    const a = await acquireHomeLock('u1', {
      locks,
      retries: 0,
    });
    expect(a).not.toBeNull();
    expect(
      await acquireHomeLock('u1', {
        locks,
        retries: 0,
      }),
    ).toBeNull();
    expect(
      await acquireHomeLock('u2', {
        locks,
        retries: 0,
      }),
    ).not.toBeNull();
  });

  it('can be taken again after release', async () => {
    const locks = fakeLocks();
    const a = await acquireHomeLock('u1', {
      locks,
      retries: 0,
    });
    a!.release();
    await new Promise((r) => setTimeout(r, 0));
    expect(
      await acquireHomeLock('u1', {
        locks,
        retries: 0,
      }),
    ).not.toBeNull();
  });

  it('retries while the previous machine of this tab is releasing', async () => {
    const locks = fakeLocks();
    const a = await acquireHomeLock('u1', {
      locks,
      retries: 0,
    });
    setTimeout(() => a!.release(), 20);
    expect(
      await acquireHomeLock('u1', {
        locks,
        retries: 3,
        retryDelayMs: 30,
      }),
    ).not.toBeNull();
  });

  it('without Web Locks it grants a no-op lock', async () => {
    const l = await acquireHomeLock('u1', {
      locks: undefined,
    });
    expect(l).not.toBeNull();
    expect(() => l!.release()).not.toThrow();
  });
});

describe('holdHomeLock', () => {
  /** A lock manager that grants only after `delayMs`, like a busy main thread. */
  function slowLocks(delayMs: number) {
    const inner = fakeLocks();
    return {
      held: inner.held,
      request: (async (name, o, cb) => {
        await new Promise((r) => setTimeout(r, delayMs));
        return inner.request(name, o, cb);
      }) as LockManagerLike['request'],
    };
  }

  it('released before the request resolves: the lock is freed as soon as it is granted', async () => {
    const locks = slowLocks(30);
    const held = holdHomeLock('u1', {
      locks,
      retries: 0,
    });
    held.release(); // the page was torn down while the request was pending
    const lock = await held.ready;
    expect(lock).not.toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    expect(locks.held.size).toBe(0);
    // The next machine of this tab can take it straight away.
    expect(
      await acquireHomeLock('u1', {
        locks,
        retries: 0,
      }),
    ).not.toBeNull();
  });

  it('released after the request resolved: freed too', async () => {
    const locks = fakeLocks();
    const held = holdHomeLock('u1', {
      locks,
      retries: 0,
    });
    await held.ready;
    expect(locks.held.has('rmhos:u1')).toBe(true);
    held.release();
    await new Promise((r) => setTimeout(r, 0));
    expect(locks.held.size).toBe(0);
  });

  it('not released: another tab is refused', async () => {
    const locks = fakeLocks();
    const held = holdHomeLock('u1', {
      locks,
      retries: 0,
    });
    await held.ready;
    expect(
      await holdHomeLock('u1', {
        locks,
        retries: 0,
      }).ready,
    ).toBeNull();
  });
});
