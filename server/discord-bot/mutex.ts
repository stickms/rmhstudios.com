/**
 * Async mutual exclusion — the Go bot's `sync.Mutex`es, for a single-threaded runtime where the
 * hazard is interleaving at `await`s rather than parallel threads.
 *
 * The global pet's load → decay → mutate → save cycle and the tracker's read-modify-write of open
 * session rows both span several database round trips, and two gateway events (or an event and a
 * cron tick) can interleave between them. Like `sync.Mutex`, these are NOT reentrant: a holder that
 * calls into another method taking the same lock deadlocks, so the Go call graph (which methods
 * assume the lock is already held) is kept exactly.
 */
export class Mutex {
  private tail: Promise<void> =
    Promise.resolve();

  /** Wait for the lock; resolves to the release function. */
  lock(): Promise<
    () => void
  > {
    let release!: () => void;
    const next =
      new Promise<void>(
        (
          resolve,
        ) => {
          release =
            resolve;
        },
      );
    const prev =
      this
        .tail;
    this.tail =
      prev.then(
        () =>
          next,
      );
    return prev.then(
      () => {
        let released = false;
        return () => {
          if (
            !released
          ) {
            released = true;
            release();
          }
        };
      },
    );
  }

  /** Run `fn` holding the lock. */
  async run<
    T,
  >(
    fn: () => Promise<T>,
  ): Promise<T> {
    const release =
      await this.lock();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/** One mutex per key, created on first use (Go's lockGuild). */
export class KeyedMutex {
  private readonly locks =
    new Map<
      string,
      Mutex
    >();

  get(
    key: string,
  ): Mutex {
    let m =
      this.locks.get(
        key,
      );
    if (
      !m
    ) {
      m =
        new Mutex();
      this.locks.set(
        key,
        m,
      );
    }
    return m;
  }
}
