/**
 * Hub performance probe — event-loop delay, CPU and memory, readable over HTTP.
 *
 * Bench-only instrumentation for `scripts/perf/socket-bench.mjs`
 * (docs/server-perf-2026-10-21/01-method.md §1.6). It is OFF unless the process
 * is started with `RMH_PERF_HUB=1`: with the flag unset no histogram is created,
 * no timer runs, and `handlePerfProbeRequest` returns false without touching the
 * response, so the hub's normal 404 path is unchanged. Nothing here is reachable
 * in production unless an operator sets the flag.
 *
 * Endpoints (on the hub's own listener, which is loopback-only behind Apache):
 *   GET  /__perf          → snapshot since the last reset
 *   POST /__perf/reset    → snapshot, then reset the window
 */

import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface PerfSnapshot {
  /** Event-loop delay over the window, milliseconds above the sampling resolution. */
  eld: {
    min: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    samples: number;
  };
  /** CPU time consumed by the process over the window, milliseconds. */
  cpuMs: { user: number; system: number };
  windowMs: number;
  rssBytes: number;
  heapUsedBytes: number;
  uptimeS: number;
}

export function perfProbeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RMH_PERF_HUB === '1';
}

const NS_PER_MS = 1e6;

export class PerfProbe {
  private readonly histogram: ReturnType<typeof monitorEventLoopDelay>;
  private windowStart = performance.now();
  private cpuStart = process.cpuUsage();

  constructor(private readonly resolutionMs = 10) {
    this.histogram = monitorEventLoopDelay({ resolution: resolutionMs });
    this.histogram.enable();
  }

  snapshot(): PerfSnapshot {
    const h = this.histogram;
    // The histogram records the whole timer interval; the loop's own delay is
    // what exceeds the sampling resolution.
    const lag = (ns: number): number => Math.max(0, ns / NS_PER_MS - this.resolutionMs);
    const cpu = process.cpuUsage(this.cpuStart);
    const mem = process.memoryUsage();
    return {
      eld: {
        min: lag(h.min),
        mean: lag(h.mean),
        p50: lag(h.percentile(50)),
        p95: lag(h.percentile(95)),
        p99: lag(h.percentile(99)),
        max: lag(h.max),
        samples: h.count,
      },
      cpuMs: { user: cpu.user / 1000, system: cpu.system / 1000 },
      windowMs: performance.now() - this.windowStart,
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      uptimeS: process.uptime(),
    };
  }

  reset(): void {
    this.histogram.reset();
    this.windowStart = performance.now();
    this.cpuStart = process.cpuUsage();
  }

  stop(): void {
    this.histogram.disable();
  }
}

let probe: PerfProbe | null = null;

/** The process-wide probe, or null when `RMH_PERF_HUB` is not set to `1`. */
export function getPerfProbe(env: NodeJS.ProcessEnv = process.env): PerfProbe | null {
  if (!perfProbeEnabled(env)) return null;
  if (!probe) probe = new PerfProbe();
  return probe;
}

/**
 * Serve the probe endpoints. Returns true when the request was handled. With the
 * flag off this is a no-op that returns false.
 */
export function handlePerfProbeRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const p = getPerfProbe();
  if (!p) return false;
  const url = req.url ?? '';
  if (url === '/__perf' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(p.snapshot()));
    return true;
  }
  if (url === '/__perf/reset' && req.method === 'POST') {
    const snap = p.snapshot();
    p.reset();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(snap));
    return true;
  }
  return false;
}
