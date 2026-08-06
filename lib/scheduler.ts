/**
 * Main-thread yielding (OPT-34).
 *
 * INP measures the **longest** task between an input and the next paint. A
 * handler that does several things in a row — flip the UI optimistically, fire
 * the request, write a cache, raise a toast — is one long task, and the user
 * waits for all of it before seeing the one part they asked for. Yielding
 * between the steps lets the browser paint the acknowledgement first and run
 * the bookkeeping in a later task.
 */

interface SchedulerYieldHost {
  scheduler?: { yield?: () => Promise<void> };
}

/**
 * Give the browser a turn — paint, process pending input — then continue where
 * we left off.
 *
 * Prefers `scheduler.yield()`, which resumes the continuation at the **front**
 * of the task queue: the yield costs a rendering opportunity and nothing else,
 * so splitting a handler in two cannot let unrelated work overtake the half the
 * user is waiting for. `setTimeout(0)` is the fallback and is strictly worse —
 * it posts the continuation to the **back** of the queue, behind every task
 * already scheduled (other timers, message-channel work, a competing
 * component's callbacks), so the tail of the handler can be starved by work it
 * has nothing to do with. That difference is the entire reason
 * `scheduler.yield()` exists; the fallback is only here because the API is
 * Chromium-only (129+) and the alternative on every other engine is not
 * yielding at all.
 *
 * Three rules for call sites, each one a way to make things worse:
 *
 *  1. **Read layout before yielding, write after.** A `getBoundingClientRect()`
 *     after a yield reads a tree the browser has since laid out, so the write
 *     that follows forces a second layout in the same interaction.
 *  2. **Never yield in a handler that still has to `preventDefault()`.** The
 *     event stops being cancelable once the handler returns to the event loop,
 *     so `preventDefault()` after a yield is a silent no-op. The same applies to
 *     anything needing transient user activation (`navigator.share`, clipboard
 *     writes, `requestFullscreen`, audio unlock) — the activation does not
 *     survive the yield.
 *  3. **More yields is not better.** Each one is a task boundary with its own
 *     scheduling overhead. Split a handler where the user-visible result ends
 *     and the bookkeeping begins — usually once.
 */
export function yieldToMain(): Promise<void> {
  const host = globalThis as SchedulerYieldHost;
  const scheduler = host.scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
