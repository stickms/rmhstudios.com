/**
 * A small admission gate for CPU-heavy native work (sharp encodes, resvg
 * rasterisation) — server-only.
 *
 * Both libraries run off the JS thread, which is why they do not show up as
 * event-loop blocks. They run on the **libuv threadpool**, though (4 threads by
 * default), and that pool is shared with `dns.lookup`, `fs.*` and `crypto`. Eight
 * concurrent AVIF encodes occupy every thread for 0.7-2.4 s, and every
 * `safeFetch`, object-storage read or password hash queues behind them: measured
 * on the seeded bench box as a `dns.lookup` + `fs.stat` pair taking 0.13 ms idle
 * and 1.4-2.4 s during the encodes (results/ws-6.md).
 *
 * The gate keeps at most `limit` jobs in flight (default: the pool size minus
 * one) and queues the rest in arrival order. It does not shed: a queued request
 * gets the same bytes it always did, just without starving the rest of the
 * process. The queue is bounded; past the bound `run` rejects with
 * {@link CpuGateFullError} and the route answers 429 + Retry-After (not 5xx:
 * saturation must not trip the post-deploy 5xx guard).
 *
 * Only the ENCODE runs in {@link cpuGate}. Source loading (network / object
 * store, unbounded in time) runs in the separate {@link loadGate}, which bounds
 * how many source buffers (up to 10 MB each) are alive, so a slow upstream can
 * never hold a CPU slot.
 */

export class CpuGateFullError extends Error {
  constructor() {
    super('CPU gate queue is full');
    this.name = 'CpuGateFullError';
  }
}

export interface CpuGate {
  run<T>(job: () => Promise<T>): Promise<T>;
  readonly stats: { active: number; queued: number };
}

export function createCpuGate(limit: number, maxQueue: number): CpuGate {
  let active = 0;
  const queue: Array<() => void> = [];

  const release = () => {
    const next = queue.shift();
    // Hand the slot straight to the head of the queue (active is unchanged), or
    // free it when nobody is waiting.
    if (next) next();
    else active--;
  };

  return {
    async run<T>(job: () => Promise<T>): Promise<T> {
      if (active >= limit) {
        if (queue.length >= maxQueue) throw new CpuGateFullError();
        // The slot is handed over by `release` (active stays counted), so a
        // newly arriving job can never jump the queue between release and wake.
        await new Promise<void>((resolve) => queue.push(resolve));
      } else {
        active++;
      }
      try {
        return await job();
      } finally {
        release();
      }
    },
    get stats() {
      return { active, queued: queue.length };
    },
  };
}

function threadpoolSize(): number {
  const n = Number.parseInt(process.env.UV_THREADPOOL_SIZE ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 4; // libuv's default
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * The process-wide gate. One shared instance, because the thing being protected
 * (the threadpool) is shared: OG rasterisation and image-variant encoding must
 * not each take half of the pool on top of each other.
 *
 * `RMH_CPU_GATE_LIMIT` (default: `UV_THREADPOOL_SIZE` - 1: 3 with libuv's
 * default pool of 4, but 15 where docker-compose sets UV_THREADPOOL_SIZE=16,
 * which is why compose also pins RMH_CPU_GATE_LIMIT explicitly) and
 * `RMH_CPU_GATE_QUEUE` (default 64) tune it. Measured with 8 concurrent AVIF
 * encodes: limit 3 keeps a `dns.lookup` + `fs.stat` pair at <= 5.5 ms (ungated:
 * up to 2.4 s) and finishes the burst 1.45x sooner than limit 2.
 */
export const cpuGate: CpuGate = createCpuGate(
  envInt('RMH_CPU_GATE_LIMIT', Math.max(1, threadpoolSize() - 1), 1, 16),
  envInt('RMH_CPU_GATE_QUEUE', 64, 1, 4096),
);

/**
 * Bounds concurrent source loads (and so source buffers alive). Not CPU work, so
 * deliberately separate from {@link cpuGate}: a dripping upstream holds a load
 * slot (for at most the loader's own deadline), never an encode slot.
 * `RMH_IMAGE_LOAD_LIMIT` (default 8) / `RMH_IMAGE_LOAD_QUEUE` (default 64).
 */
export const loadGate: CpuGate = createCpuGate(
  envInt('RMH_IMAGE_LOAD_LIMIT', 8, 1, 64),
  envInt('RMH_IMAGE_LOAD_QUEUE', 64, 1, 4096),
);
