import { describe, expect, it } from 'vitest';
import { acquireHomeLock, type LockManagerLike } from '../tab-lock';

/** Grants a name to one holder at a time, like navigator.locks with ifAvailable. */
function fakeLocks(): LockManagerLike & { held: Set<string> } {
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
    const a = await acquireHomeLock('u1', { locks, retries: 0 });
    expect(a).not.toBeNull();
    expect(await acquireHomeLock('u1', { locks, retries: 0 })).toBeNull();
    expect(await acquireHomeLock('u2', { locks, retries: 0 })).not.toBeNull();
  });

  it('can be taken again after release', async () => {
    const locks = fakeLocks();
    const a = await acquireHomeLock('u1', { locks, retries: 0 });
    a!.release();
    await new Promise((r) => setTimeout(r, 0));
    expect(await acquireHomeLock('u1', { locks, retries: 0 })).not.toBeNull();
  });

  it('retries while the previous machine of this tab is releasing', async () => {
    const locks = fakeLocks();
    const a = await acquireHomeLock('u1', { locks, retries: 0 });
    setTimeout(() => a!.release(), 20);
    expect(await acquireHomeLock('u1', { locks, retries: 3, retryDelayMs: 30 })).not.toBeNull();
  });

  it('without Web Locks it grants a no-op lock', async () => {
    const l = await acquireHomeLock('u1', { locks: undefined });
    expect(l).not.toBeNull();
    expect(() => l!.release()).not.toThrow();
  });
});
