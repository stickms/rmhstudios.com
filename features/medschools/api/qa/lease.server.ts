/**
 * Running model work under a reservation (the Q&A question and the tracker import both do): one deadline for the whole
 * piece of work, plus the request's own signal; the caller stops waiting at the deadline (`AI_UNAVAILABLE`), and the
 * in-flight lease ends when the work really ends, not when the caller stopped waiting.
 */
import { AppError } from '@/lib/errors/codes';

class Deadline extends Error {}

/** Throws the deadline's error when the signal has fired; work checks it between its steps. */
export function assertLive(signal: AbortSignal): void {
  if (signal.aborted) throw new Deadline();
}

export async function runUnderLease<T>(
  gate: { release(): Promise<void> },
  deadlineMs: number,
  requestSignal: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const deadline = AbortSignal.timeout(deadlineMs);
  const signal = requestSignal ? AbortSignal.any([requestSignal, deadline]) : deadline;
  const running = work(signal);
  // The lease ends when the work really ends, not when the caller stopped waiting.
  const done = running
    .then(
      () => undefined,
      () => undefined,
    )
    .then(() => gate.release());
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Deadline());
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  aborted.catch(() => undefined);
  try {
    return await Promise.race([running, aborted]);
  } catch (e) {
    if (e instanceof Deadline) throw new AppError('AI_UNAVAILABLE');
    throw e;
  } finally {
    signal.removeEventListener('abort', onAbort);
    // When the work ended on its own, the lease is gone before the member can send the next question; when the caller
    // stopped waiting first, it is released as soon as the work really stops.
    if (!signal.aborted) await done;
  }
}
