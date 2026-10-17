/**
 * The render-side state machine, independent of where it runs (spec §3.2, §3.3,
 * §7.7). OWNER: T25. Client-only.
 *
 * ## Why a core, separate from the worker and the host
 *
 * The spec runs the SAME renderer and loop in a dedicated worker where
 * `OffscreenCanvas` + WebGL2 + worker frame scheduling all exist, and on the
 * main thread where they do not, with "identical behaviour". The way to make
 * that true rather than hoped-for is to have one implementation. This is it:
 * it handles {@link ToWorker}, owns the renderer, the timeline and the frame
 * loop, and emits {@link FromWorker}; it knows nothing of `self.onmessage` or
 * `postMessage`. `worker.ts` wires it to a worker scope, `host.ts` wires the
 * same core to the main thread, and a test can wire it to a fake scheduler.
 *
 * The frame scheduler is INJECTED ({@link CoreEnv.scheduler}) so the one place
 * a frame callback is actually requested is in `worker.ts` and `host.ts` — the
 * two files the rAF allowlist sanctions ("bounded by the navigation") — and
 * nothing in this file schedules a frame by name.
 *
 * ## Behaviour to implement
 *
 * - `init`: create the renderer on the canvas; reply `ready`. A second `init`
 *   (a fresh canvas) disposes the previous context first.
 * - `prime`: bake the LUT if `lut` is `null` (`projection-lut.ts`); compute
 *   `R`, `θ_align`, `M_after` (`orientation.ts`); build the `Timeline`; prime the
 *   renderer. No frame is drawn.
 * - `texture`: upload to the renderer. An `after` bitmap triggers
 *   `timeline.afterReady` once uploaded; closes the bitmap afterwards.
 * - `start`: `timeline.start(t0)`, start the loop, emit `need-after-by`. Post
 *   `cover` after the frame AFTER the first draw has been presented.
 * - Each frame: `timeline.tick(now)` → `renderer.draw(snapshot)` → emit `stage`
 *   for each new timeline event (and `unwrap-done`); feed the governor
 *   (`governor-tiers.ts`).
 * - `fast-forward` / `after-failed` / `resize` / `reveal` / `abort`: forward to
 *   the timeline (resize also to the renderer).
 * - `done`: stop the loop, emit `done` with the frame stats, `release()` the
 *   renderer; programs stay compiled.
 * - Context loss: stop the loop, emit `context-lost`.
 * - Hidden tab: pause the loop; resume on return (the timeline's `dt` clamp
 *   does the rest).
 * - `debug`: execute the {@link DebugCommand} and reply `debug-result`.
 *
 * **No loop runs at rest** — between `done` and the next `start`, and before the
 * first `start`, no frame is scheduled and no GPU work is issued.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T25 replaces every body, and this line with them */
import { notImplemented } from '../not-implemented';
import type { CoreEnv, EversionCore } from '../types';

/** Create the render-side core over `env`. */
export function createEversionCore(env: CoreEnv): EversionCore {
  return notImplemented('createEversionCore', 'T25');
}
