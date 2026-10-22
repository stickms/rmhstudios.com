// Writes the one-minute rollups (metrics-rollup.ts) to `ops_metric_minute`, and
// reads them back for /admin/alarms. Runs in the jobs worker — one process, so
// one writer — independent of on-call being configured: history starts the
// moment this deploys.

import { collectPerfOverview } from '../perf/admin.server';
import { prisma } from '../prisma.server';
import { newRollupMemory, rollup, type MetricRow } from './metrics-rollup';

export const ROLLUP_INTERVAL_MS = 60_000;
export const RETENTION_DAYS = 30;
const PRUNE_EVERY_MS = 60 * 60_000;

export async function writeRows(rows: MetricRow[]): Promise<number> {
  if (!rows.length) return 0;
  // skipDuplicates: a restarted jobs worker re-running the same minute is a no-op.
  const res = await prisma.opsMetricMinute.createMany({ data: rows, skipDuplicates: true });
  return res.count;
}

export async function pruneOldRows(now = Date.now()): Promise<number> {
  const res = await prisma.opsMetricMinute.deleteMany({
    where: { at: { lt: new Date(now - RETENTION_DAYS * 24 * 60 * 60_000) } },
  });
  return res.count;
}

/** Rows for one metric (optionally one dim) since `since`, oldest first. */
export async function readSeries(metric: string, since: Date, dim?: string) {
  return prisma.opsMetricMinute.findMany({
    where: { metric, at: { gte: since }, ...(dim === undefined ? {} : { dim }) },
    orderBy: { at: 'asc' },
    select: {
      at: true,
      dim: true,
      count: true,
      p50: true,
      p95: true,
      p99: true,
      max: true,
      value: true,
    },
  });
}

/** Start the once-a-minute rollup loop. Returns a stop function. */
export function startMetricsRollup(): () => void {
  const memory = newRollupMemory();
  let running = false;
  let lastPrune = 0;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const o = await collectPerfOverview();
      const hubs = o.hubs.filter((h): h is (typeof o.processes)[number] => !('error' in h));
      await writeRows(rollup([...o.processes, ...hubs], o.cluster.gauges, now, memory));
      if (now - lastPrune > PRUNE_EVERY_MS) {
        lastPrune = now;
        await pruneOldRows(now);
      }
    } catch (err) {
      console.error('[ops-metrics] rollup failed:', (err as Error)?.message ?? err);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), ROLLUP_INTERVAL_MS);
  void tick(); // first run = baseline (no rows yet, by design)
  return () => clearInterval(timer);
}
