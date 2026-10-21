// Nitro startup plugin — ask the cluster primary for a graceful worker recycle
// before V8 hits its heap limit.
//
// WHY: a worker that reaches `--max-old-space-size` dies with a FATAL OOM and
// resets every in-flight socket (Cloudflare 502s). Reproduced locally: the
// production cap (384 MB) is below the post-warm live heap of a worker
// (~400 MB: Prisma's query-compiler schema ~100 MB, the 739-route tree, Better
// Auth, caches), so workers died within ~40s of real traffic.
//
// This turns the hard crash into a drain: when heap-in-use stays above the
// threshold for two consecutive samples, the primary (server/nitro/
// cluster-primary.ts) starts a replacement worker first, then tells this one to
// stop accepting and finish its in-flight requests. No-op outside cluster mode.
import cluster from 'node:cluster';
import v8 from 'node:v8';

const INTERVAL_MS = 5_000;
const THRESHOLD = Number(process.env.HEAP_GUARD_THRESHOLD) || 0.9;
/** Don't recycle a freshly started worker (its own warm-up looks like growth). */
const MIN_UPTIME_S = Number(process.env.HEAP_GUARD_MIN_UPTIME_S) || 60;

export default function heapGuardPlugin() {
  if (!cluster.isWorker || typeof process.send !== 'function') return;
  let hot = 0;
  let sent = false;
  const timer = setInterval(() => {
    if (sent || process.uptime() < MIN_UPTIME_S) return;
    const { used_heap_size, heap_size_limit } = v8.getHeapStatistics();
    hot = used_heap_size / heap_size_limit > THRESHOLD ? hot + 1 : 0;
    if (hot >= 2) {
      sent = true;
      console.warn(
        `[heap-guard] heap ${(used_heap_size / 1e6).toFixed(0)}/${(heap_size_limit / 1e6).toFixed(0)} MB — requesting graceful recycle`,
      );
      process.send?.({ type: 'nitro:recycle' });
    }
  }, INTERVAL_MS);
  timer.unref();
}
