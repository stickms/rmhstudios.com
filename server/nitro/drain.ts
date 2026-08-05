// Nitro startup plugin — drain in-process write buffers on shutdown.
//
// WHY THIS EXISTS: `lib/activity/emit.server.ts` batches activity events in
// memory and flushes them on a 2s timer, because writing a row per scroll-past
// view would be catastrophic against a synchronous insert. The cost of that
// choice is a window: whatever is in the buffer when the process ends is lost.
//
// Normally that window is invisible. During a blue/green hotswap it is not —
// `deploy/hotswap-web.sh` stops the old container on every deploy, so without
// this every deploy silently drops up to two seconds of activity from every
// worker at once, and the resume rail and recommendation inputs quietly lose
// data in proportion to how often we ship.
//
// SAFETY: SIGTERM already has a container-level grace period, so there is time
// to finish one `createMany`. Everything here is best-effort and bounded — a
// drain that hangs must not stop the process from exiting, or a deploy stalls
// until Docker sends SIGKILL.
//
// Imports are RELATIVE, not `@/` aliased: Nitro plugin modules don't reliably
// resolve the tsconfig path aliases, and they still resolve to the same
// absolute files as the request handlers, so the buffer drained here is the one
// the handlers filled.

/** Longest we will hold up shutdown waiting for buffers to flush. */
const DRAIN_TIMEOUT_MS = 2_000;

export default function drainPlugin() {
  let draining = false;

  const drain = async (signal: string) => {
    // Signals can arrive more than once (SIGTERM then SIGINT from an impatient
    // operator); draining twice would double-write the second buffer.
    if (draining) return;
    draining = true;

    try {
      await Promise.race([
        (async () => {
          const { flushActivity } = await import('../../lib/activity/emit.server');
          await flushActivity();
        })(),
        new Promise((resolve) => setTimeout(resolve, DRAIN_TIMEOUT_MS)),
      ]);
    } catch {
      // Losing the buffer is the pre-existing behaviour; blocking the exit is
      // worse than losing it.
    }

    // Re-raise with the default handler so Nitro's own shutdown still runs.
    process.removeListener(signal, handlers[signal]!);
    process.kill(process.pid, signal as NodeJS.Signals);
  };

  const handlers: Record<string, () => void> = {
    SIGTERM: () => void drain('SIGTERM'),
    SIGINT: () => void drain('SIGINT'),
  };

  for (const [signal, handler] of Object.entries(handlers)) {
    process.on(signal as NodeJS.Signals, handler);
  }
}
