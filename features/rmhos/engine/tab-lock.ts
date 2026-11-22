/**
 * One rmhOS machine per account per browser. The home folder lives in one IndexedDB entry; two
 * tabs of the same account would each save over the other. A Web Lock named for the account is
 * held for the life of the machine: a second tab is refused instead of booted. Where Web Locks
 * do not exist the lock is a no-op and HomeSync's changed-elsewhere check is the backstop.
 */

export interface LockManagerLike {
  request(
    name: string,
    options: {
      ifAvailable: true;
    },
    cb: (lock: object | null) => Promise<void> | void,
  ): Promise<unknown>;
}

export interface HomeLock {
  release(): void;
}

export interface AcquireOptions {
  locks?: LockManagerLike | undefined;
  /** Extra tries after the first, for a lock the previous machine of this tab is still releasing. */
  retries?: number;
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function tryOnce(locks: LockManagerLike, name: string): Promise<HomeLock | null> {
  return new Promise<HomeLock | null>((resolve, reject) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    locks
      .request(
        name,
        {
          ifAvailable: true,
        },
        (lock) => {
          if (!lock) {
            resolve(null);
            return;
          }
          resolve({
            release,
          });
          return held; // the lock lives until release()
        },
      )
      .catch(reject);
  });
}

/** Resolves to the held lock, or null when another tab holds it. */
export async function acquireHomeLock(userId: string, opts: AcquireOptions = {}): Promise<HomeLock | null> {
  const locks =
    'locks' in opts
      ? opts.locks
      : (
          globalThis.navigator as
            | {
                locks?: LockManagerLike;
              }
            | undefined
        )?.locks;
  if (!locks)
    return {
      release: () => {},
    };
  const name = `rmhos:${userId}`;
  const retries = opts.retries ?? 3;
  for (let i = 0; ; i++) {
    const got = await tryOnce(locks, name);
    if (got || i >= retries) return got;
    await sleep(opts.retryDelayMs ?? 150);
  }
}

export interface HeldLock {
  /** Resolves to the lock, or null when another tab holds it. */
  ready: Promise<HomeLock | null>;
  /**
   * Gives the lock up now, or as soon as it is granted if the request is still pending. A page
   * that is torn down while `acquireHomeLock` is still waiting would otherwise keep the lock for
   * good, and the account would read as "already open in another tab" until a reload.
   */
  release(): void;
}

export function holdHomeLock(userId: string, opts: AcquireOptions = {}): HeldLock {
  let released = false;
  let got: HomeLock | null = null;
  const ready = acquireHomeLock(userId, opts).then((lock) => {
    got = lock;
    if (released) lock?.release();
    return lock;
  });
  return {
    ready,
    release() {
      released = true;
      got?.release();
    },
  };
}
