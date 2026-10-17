/**
 * The main-thread facade over the render side (spec §3.2). OWNER: T25.
 * Client-only.
 *
 * The rest of the page talks to the effect through ONE object, an
 * {@link EversionHost}, and never learns whether the frames are being drawn in a
 * dedicated worker or on this thread.
 *
 * - **Detection** (once, cached for the session): `OffscreenCanvas`, a WebGL2
 *   context on it inside a worker, and a frame scheduler in the worker. Where
 *   any is missing — Safari's worker-scheduler status is spec §14 item 1, which
 *   T25 resolves and records in the spec — the host runs the SAME
 *   {@link createEversionCore} on the main thread with the page's own frame
 *   scheduler. Behaviour is identical; the only difference is that it shares a
 *   thread with the route render (mitigated by §8.4).
 * - **One worker per page**, constructed at prefetch (spec §8.1), terminated on
 *   `pagehide` after losing the context.
 * - **The canvas.** A canvas element's control can be transferred to an
 *   `OffscreenCanvas` exactly once, and a context belongs to its canvas — so
 *   "programs stay compiled for the next navigation" (spec §3.2) holds only if
 *   the overlay's canvas element outlives a single navigation. The host
 *   contract therefore allows `init` to be sent again with a NEW canvas (the core
 *   disposes the old context and recompiles), and T31 decides whether to keep one
 *   canvas element mounted-but-hidden between runs or to pay the recompile. See
 *   the report's open question.
 *
 * This file is on the frame-loop allowlist as "bounded by the navigation: the
 * loop starts at `start` and stops at `done`/`abort`/`context-lost`; no loop
 * runs at rest" — for the in-thread scheduler only.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T25 replaces every body, and this line with them */
import { notImplemented } from '../not-implemented';
import type { EversionHost, HostMode } from '../types';

/**
 * Which mode this browser gets. Cached after the first call. `force` is for
 * the e2e fallback-parity test (spec §11.2 test 36) and applies to the next
 * host created.
 */
export function detectHostMode(force?: HostMode): HostMode {
  return notImplemented('detectHostMode', 'T25');
}

/**
 * The page's single host, created on first call. Does NOT start a loop; the
 * first frame is requested at the `start` message.
 */
export function getEversionHost(): EversionHost {
  return notImplemented('getEversionHost', 'T25');
}
