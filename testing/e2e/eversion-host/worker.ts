/**
 * The worker entry for `testing/e2e/eversion-host.mjs` (T25): `bootWorker` with
 * the fixture collaborators, plus a spy on the worker's own
 * `requestAnimationFrame` so the e2e can assert "no rAF is scheduled after
 * `done`" with a count taken OUTSIDE the code under test. The spy is read with
 * a `{ __spy: true }` message that bypasses the core (which also hands back, and
 * clears, the absolute time of each frame callback).
 */

import { bootWorker } from '../../../lib/eversion/gl/worker';
import type { WorkerScopeLike } from '../../../lib/eversion/gl/worker';
import { fixtureDeps } from './deps';

const scope = self as unknown as WorkerScopeLike;

let rafCalls = 0;
/** Absolute (page-clock) time at which every frame callback RAN (not its vsync stamp: a callback queued behind a busy loop carries a stamp from before it), so the page can ask what ran during its busy loop. */
let frameTimes: number[] = [];
const realRaf = scope.requestAnimationFrame!.bind(self);
scope.requestAnimationFrame = (callback) => {
  rafCalls++;
  return realRaf((now) => {
    frameTimes.push(performance.timeOrigin + performance.now());
    callback(now);
  });
};

bootWorker(scope, fixtureDeps());

const core = scope.onmessage!;
scope.onmessage = (event: MessageEvent) => {
  if ((event.data as { __spy?: boolean } | null)?.__spy) {
    scope.postMessage({ __spy: rafCalls, times: frameTimes });
    frameTimes = [];
  } else {
    core(event);
  }
};
