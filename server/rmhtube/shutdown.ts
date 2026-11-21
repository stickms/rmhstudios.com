/** Shutdown helpers, kept free of the hub's import-time side effects so they can be unit-tested. */

/**
 * Settle `work` (never rejects) or give up after `ms`, so a hung database write cannot hold
 * shutdown past its own bound. The timer is unref'd and cleared once `work` settles.
 */
export function boundedFlush(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    work.then(done, done);
  });
}
