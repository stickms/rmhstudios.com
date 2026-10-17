/**
 * The dedicated render worker (spec §3.2). OWNER: T25. A worker entry module.
 *
 * ## Why a worker
 *
 * The destination route mounts, fetches and hydrates on the main thread WHILE
 * the eversion plays. A main-thread frame loop would drop frames at exactly
 * those moments — a 120 ms route render is seven missed frames in the middle of
 * the effect. A worker-owned `OffscreenCanvas` with the worker's own frame
 * scheduler keeps presenting while the main thread is busy, and costs the main
 * thread nothing per frame: no uniforms, no `postMessage` per frame.
 *
 * ## What lives here
 *
 * Only the wiring: {@link bootWorker} connects a worker scope's `onmessage` /
 * `postMessage` to {@link createEversionCore} and supplies the worker's frame
 * scheduler. All behaviour is in `core.ts`. T25 calls `bootWorker(self)` at the
 * bottom of this file so that importing it as a worker script starts it;
 * importing it as a module (the contracts test) does nothing.
 *
 * The worker is long-lived but idle: created when the chunk is prefetched
 * (spec §8.1), runs no loop until `start`, stops its loop on `done`. This file
 * is on the frame-loop allowlist (`raf-loop-allowlist.test.ts`) as "bounded by
 * the navigation: the loop starts at `start` and stops at `done`/`abort`/
 * `context-lost`; no loop runs at rest".
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T25 replaces every body, and this line with them */
import { notImplemented } from '../not-implemented';

/** The slice of a `DedicatedWorkerGlobalScope` the boot needs (and a test can fake). */
export interface WorkerScopeLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

/** Connect `scope` to a new core; returns the function that tears it down. */
export function bootWorker(scope: WorkerScopeLike): () => void {
  return notImplemented('bootWorker', 'T25');
}
