// The web container's process 1: a cluster primary that keeps its workers alive.
//
// WHY THIS EXISTS (2026-10-21): production builds with NITRO_PRESET=node-cluster,
// whose generated `.output/server/index.mjs` forks NITRO_CLUSTER_WORKERS workers
// ONCE and never replaces one that dies. Apache's error log showed the result:
// a worker dies (every connection it held resets in the same millisecond,
// AH01102), the site limps on at half capacity, the second one dies, nothing is
// listening (AH00957 "Connection refused"), the primary has nothing left to run
// and exits, and Docker restarts the container — 503 "Service Unavailable" for
// everyone until it has booted again. Whatever kills a worker, one dead worker
// must not take the site down. This primary:
//
//   - replaces a worker that exits, with a backoff when they keep dying at boot
//     (a crash loop must not spin the CPU), and logs HOW it died: `signal
//     SIGKILL` with no exit code is the kernel's OOM killer, the evidence we did
//     not have.
//   - forwards SIGTERM / SIGINT to the workers and waits for them, bounded, so
//     `docker stop` reaches them. Only PID 1 receives Docker's signal; under
//     Nitro's primary the workers never saw it, so server/nitro/drain.ts never
//     drained a buffer on a deploy.
//
// It runs the very same `.output/server/worker.mjs` Nitro's primary would, with
// the same WORKER_ID numbering. A build without the cluster preset has no
// worker.mjs; then this just runs the single-process server in place.
//
// Plain ESM, no dependencies: it is copied into the runtime image as-is.

import cluster from 'node:cluster';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const serverDir = resolve(process.env.WEB_SERVER_DIR || '.output/server');
const workerEntry = resolve(serverDir, 'worker.mjs');

/** A worker that dies sooner than this after starting counts as a failed boot. */
const EARLY_DEATH_MS = 10_000;
const BACKOFF_START_MS = 500;
const BACKOFF_MAX_MS = 30_000;
/** How long SIGTERM waits for the workers to drain before forcing the exit (Docker SIGKILLs at 10 s). */
const SHUTDOWN_GRACE_MS = 8_000;

const log = (msg) => console.log(`[web-cluster] ${msg}`);

if (!existsSync(workerEntry)) {
  // Not a node-cluster build: the server is single-process, nothing to supervise.
  await import(pathToFileURL(resolve(serverDir, 'index.mjs')).href);
} else if (cluster.isPrimary) {
  const count =
    Number.parseInt(process.env.NITRO_CLUSTER_WORKERS || '', 10) || Math.max(1, os.cpus().length);
  cluster.setupPrimary({ exec: workerEntry });

  /** WORKER_ID → { startedAt, failures } */
  const slots = new Map();
  let shuttingDown = false;

  const fork = (id) => {
    const worker = cluster.fork({ WORKER_ID: String(id) });
    const slot = slots.get(id) ?? { failures: 0, startedAt: 0, timer: null };
    slot.startedAt = Date.now();
    slot.worker = worker;
    slots.set(id, slot);
    worker.on('exit', (code, signal) => {
      if (shuttingDown) return;
      const lived = Date.now() - slot.startedAt;
      slot.failures = lived < EARLY_DEATH_MS ? slot.failures + 1 : 0;
      const delay =
        slot.failures === 0 ? 0 : Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** (slot.failures - 1));
      const how = signal ? `signal ${signal}${signal === 'SIGKILL' ? ' (likely the OOM killer)' : ''}` : `code ${code}`;
      log(
        `worker ${id} (pid ${worker.process.pid}) exited with ${how} after ${Math.round(lived / 1000)}s — ` +
          `replacing it${delay ? ` in ${delay}ms (failed boot #${slot.failures})` : ''}`,
      );
      slot.timer = setTimeout(() => {
        slot.timer = null;
        if (!shuttingDown) fork(id);
      }, delay);
    });
  };

  for (let i = 1; i <= count; i++) fork(i);
  log(`primary ${process.pid} supervising ${count} worker(s) from ${workerEntry}`);

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal}: stopping ${Object.keys(cluster.workers ?? {}).length} worker(s)`);
    for (const slot of slots.values()) if (slot.timer) clearTimeout(slot.timer);
    for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill(signal);
    const force = setTimeout(() => {
      log(`workers still running after ${SHUTDOWN_GRACE_MS}ms — exiting anyway`);
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
    force.unref();
    const check = () => {
      if (Object.keys(cluster.workers ?? {}).length === 0) process.exit(0);
    };
    cluster.on('exit', check);
    check();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
