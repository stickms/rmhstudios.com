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
 * The gate keeps at most `limit` jobs in flight (default 2 of the 4 threads) and
 * queues the rest in arrival order. It does not shed: a queued request gets the
 * same bytes it always did, just without starving the rest of the process. The
 * queue is bounded so a flood of distinct cache keys cannot pin an unbounded
 * number of source buffers in memory; past the bound `run` rejects with
 * {@link CpuGateFullError} and the route answers 503 + Retry-After.
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

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * The process-wide gate. One shared instance, because the thing being protected
 * (the threadpool) is shared: OG rasterisation and image-variant encoding must
 * not each take half of the pool on top of each other.
 *
 * `RMH_CPU_GATE_LIMIT` (default 2) and `RMH_CPU_GATE_QUEUE` (default 64) tune it;
 * the defaults are safe on the 4-thread default pool.
 */
export const cpuGate: CpuGate = createCpuGate(
  envInt('RMH_CPU_GATE_LIMIT', 2, 1, 16),
  envInt('RMH_CPU_GATE_QUEUE', 64, 1, 4096),
);
