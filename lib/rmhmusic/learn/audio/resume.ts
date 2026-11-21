/**
 * Waking the shared AudioContext, with a bounded wait.
 *
 * Every engine starts a context `suspended` until a user gesture; `resume()` from that gesture
 * normally settles at once. But it can stay pending indefinitely: during an iOS audio
 * interruption (a phone call), with no audio output device, in headless Firefox. Awaiting it
 * bare left the microphone row on "Starting…" (every other choice disabled) and the timing
 * check stuck before its clicks. This asks once, synchronously (still inside the gesture that
 * called it), and gives up after {@link RESUME_TIMEOUT_MS}, so the caller can show its existing
 * "couldn't start" path instead.
 */

/** Long enough for any device that will resume at all; short enough not to feel hung. */
export const RESUME_TIMEOUT_MS = 3000;

/** The part of an AudioContext this needs. Older Safari's `resume()` returns undefined. */
export interface Resumable {
  readonly state: string;
  resume(): Promise<void> | undefined;
}

/** True once `ctx` is running; false if it is closed, refuses, or does not resume in time. */
export async function resumeAudio(ctx: Resumable, ms = RESUME_TIMEOUT_MS): Promise<boolean> {
  if (ctx.state === 'running') return true;
  if (ctx.state === 'closed') return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const asked = Promise.resolve(ctx.resume()).then(() => true);
    const late = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    });
    const answered = await Promise.race([asked, late]);
    return answered && ctx.state === 'running';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
