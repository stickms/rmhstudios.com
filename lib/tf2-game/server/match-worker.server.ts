/**
 * The match worker — a `worker_threads` entry that hosts one or more TF2
 * matches off the hub's event loop.
 *
 * The games hub runs ~18 games in one Node process, and its rule is that it
 * never simulates on its own event loop (server/socket-server/handlers/bums-rush.ts).
 * A TF2 match is a 66.67 Hz authoritative simulation, so it runs here: the hub's
 * pool (`./pool.server.ts`) spawns this file as a thread, forwards players,
 * inputs and commands as messages, and relays the packets it posts back.
 *
 * Bundled as its own esbuild entry (package.json `build`, Dockerfile
 * `server-builder`) to `dist-server/lib/tf2-game/server/match-worker.server.cjs`.
 * Named `.server.ts` because it imports `node:*` (lib/CLAUDE.md); nothing in a
 * browser bundle imports it.
 *
 * All the logic is in `MatchRunner`; this file only connects it to the port,
 * gives it a high-resolution clock, and picks the game: `createTf2Match`.
 */

import { parentPort } from 'node:worker_threads';

import { createTf2Match } from './create-match';
import { MatchRunner } from './match-runner';
import type { FromWorker, ToWorker } from './worker-protocol';

const port = parentPort;
if (!port) {
  throw new Error('match-worker.server must be started as a worker thread');
}

const origin = process.hrtime.bigint();
/** Monotonic ms with sub-microsecond resolution. */
const now = (): number => Number(process.hrtime.bigint() - origin) / 1e6;

const runner = new MatchRunner({
  factory: createTf2Match,
  now,
  post: (message: FromWorker, transfer: ArrayBuffer[]) => port.postMessage(message, transfer),
});

port.on('message', (message: ToWorker) => {
  runner.handle(message);
  if (message.t === 'shutdown') port.close();
});

port.postMessage({ t: 'ready' } satisfies FromWorker);
