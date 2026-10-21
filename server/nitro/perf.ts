// Nitro startup plugin — starts the per-process performance collector for the web
// tier and publishes its snapshot to Redis.
//
// WHY A PLUGIN OF ITS OWN: the request/error recording lives in otel.ts (that is
// where the request scope and query budget are), but SAMPLING — event-loop delay,
// GC, CPU, the minute roller, the Redis publisher — has to start once per worker
// at boot, independent of any request. Same reasoning as warmup.ts.
//
// PER WORKER: production runs NITRO_PRESET=node-cluster with NITRO_CLUSTER_WORKERS
// workers, each with its own heap and its own copy of the collector. Each one
// publishes `perf:proc:web:<hostname>:<pid>` (10 s, 30 s TTL) so the admin
// endpoint can show every worker, not just the one that answered it.
//
// SAFETY: nothing here is awaited and everything is swallowed. If Redis or the
// database is not configured the collector still runs and the page falls back to
// the live snapshot of the worker serving the request. Imports are RELATIVE, not
// `@/` aliased — Nitro plugin modules don't reliably resolve the tsconfig path
// aliases (same reason as warmup.ts / otel.ts), and lib/prisma.server is loaded
// lazily because it throws at import when DATABASE_URL is unset.

import { startProcessMetrics } from '../../lib/perf/process-metrics';
import { registerPrismaPoolGauges, startPerfPublisher } from '../../lib/perf/publish.server';

export default function perfPlugin(): void {
  try {
    startProcessMetrics({ service: 'web' });
    registerPrismaPoolGauges();
    startPerfPublisher('web');
  } catch {
    // Telemetry must never stop a worker from booting.
  }
}
