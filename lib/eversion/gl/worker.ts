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
 * scheduler. All behaviour is in `core.ts`. The bottom of this file calls
 * `bootWorker(self)` when it is running as a worker script, so loading it as a
 * worker starts it; importing it as a module (the contracts test) does nothing.
 *
 * The worker is long-lived but idle: created when the chunk is prefetched
 * (spec §8.1), runs no loop until `start`, stops its loop on `done`. This file
 * is on the frame-loop allowlist (`raf-loop-allowlist.test.ts`) as "bounded by
 * the navigation: the loop starts at `start` and stops at `done`/`abort`/
 * `context-lost`; no loop runs at rest".
 *
 * ## Bundling
 *
 * `host.ts` constructs this file with
 * `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`,
 * the form Vite recognises statically: it emits the worker as its own chunk
 * (with the modules it imports inlined) and rewrites the URL, in dev and in the
 * build. Nothing in `vite.config.ts` needs to change — `worker.format` defaults
 * to `iife`, which is fine for a worker whose imports are all static — and the
 * chunk stays off the critical path because only `host.ts`, itself behind the
 * prefetch `import()`, names it.
 */

import type { CoreEnv, FromWorker, ToWorker } from '../types';
import { createEversionCore } from './core';
import type { CoreDeps } from './core';

/** The slice of a `DedicatedWorkerGlobalScope` the boot needs (and a test can fake). */
export interface WorkerScopeLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
  /** The worker's own frame scheduler. Absent where the browser has none (spec §14 item 1). */
  requestAnimationFrame?: (callback: (now: number) => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
}

/**
 * Connect `scope` to a new core; returns the function that tears it down.
 * `deps` is for tests and the e2e fixture; production passes nothing.
 */
export function bootWorker(scope: WorkerScopeLike, deps?: CoreDeps): () => void {
  const env: CoreEnv = {
    mode: 'worker',
    emit: (message: FromWorker, transfer?: Transferable[]) => scope.postMessage(message, transfer),
    scheduler: {
      // Probed, not assumed: the core answers `probe` / `init` with "no" so the host runs in-thread instead.
      available: typeof scope.requestAnimationFrame === 'function',
      request(callback) {
        if (!scope.requestAnimationFrame) {
          throw new Error('eversion: requestAnimationFrame is not available in this worker');
        }
        return scope.requestAnimationFrame(callback);
      },
      cancel(handle) {
        scope.cancelAnimationFrame?.(handle);
      },
    },
    now: () => performance.now(),
    timeOrigin: () => performance.timeOrigin,
  };
  const core = createEversionCore(env, deps);
  scope.onmessage = (event: MessageEvent) => core.handle(event.data as ToWorker);
  return () => {
    scope.onmessage = null;
    core.dispose();
  };
}

// Started as a worker script: boot. Imported as a module anywhere else: do nothing.
const maybeScope = globalThis as unknown as { WorkerGlobalScope?: new () => object };
if (
  typeof maybeScope.WorkerGlobalScope === 'function' &&
  globalThis instanceof maybeScope.WorkerGlobalScope
) {
  bootWorker(globalThis as unknown as WorkerScopeLike);
}
