import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { deriveKpis } from '@/lib/perf/derive';
import type { PerfOverview } from '@/lib/perf/admin-types';
import { fmtBytes, fmtInt, fmtMs, fmtNum, fmtPct } from './format';
import { Kpi } from './Kpi';
import { Sparkline } from './Sparkline';

interface SparkCardProps {
  label: string;
  values: number[];
  format: (n: number) => string;
  inkClass: string;
}

function SparkCard({ label, values, format, inkClass }: SparkCardProps) {
  const { t } = useTranslation('f-perf');
  const latest = values.length ? values[values.length - 1] : null;
  return (
    <div className="glass-fill rounded-site p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-site-text-muted">{label}</p>
        <p className="text-sm font-semibold tabular-nums text-site-text">
          {latest === null ? '—' : format(latest)}
        </p>
      </div>
      <Sparkline
        values={values}
        className={inkClass}
        label={t('spark-label', {
          defaultValue: '{{label}}, last {{count}} minutes, latest {{latest}}',
          label,
          count: values.length,
          latest: latest === null ? '—' : format(latest),
        })}
      />
    </div>
  );
}

export function OverviewTab({ overview }: { overview: PerfOverview }) {
  const { t } = useTranslation('f-perf');
  const k = useMemo(() => deriveKpis(overview), [overview]);
  const series = overview.cluster.timeseries;
  const recentNote =
    k.windowMinutes > 0
      ? t('window-recent', { defaultValue: 'last {{count}} min', count: k.windowMinutes })
      : t('window-boot', { defaultValue: 'since boot' });

  return (
    <div className="space-y-6">
      <p className="text-sm text-site-text-muted">
        {t('overview-scope', {
          defaultValue:
            'Web tier: {{count}} worker(s) merged. Percentiles are recomputed from merged histograms, not averaged.',
          count: overview.cluster.processes,
        })}
      </p>

      <section className="space-y-3">
        <h2 className="site-section-label">{t('section-traffic', { defaultValue: 'Traffic' })}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Kpi
            label={t('kpi-req-min', { defaultValue: 'Requests / min' })}
            value={fmtInt(k.reqPerMin.value)}
            hint={t('kpi-req-min-hint', { defaultValue: 'last full minute' })}
          />
          <Kpi
            label={t('kpi-5xx', { defaultValue: '5xx rate' })}
            value={fmtPct(k.error5xxPct.value, 2)}
            tone={k.error5xxPct.tone}
            hint={recentNote}
          />
          <Kpi
            label={t('kpi-4xx', { defaultValue: '4xx rate' })}
            value={fmtPct(k.error4xxPct.value, 2)}
            hint={recentNote}
          />
          <Kpi
            label={t('kpi-429', { defaultValue: 'Rate-limited (429)' })}
            value={fmtInt(k.rate429.value)}
            hint={t('since-boot', { defaultValue: 'since boot' })}
          />
          <Kpi
            label={t('kpi-p50', { defaultValue: 'Latency p50' })}
            value={fmtMs(k.p50.value)}
            hint={recentNote}
          />
          <Kpi
            label={t('kpi-p95', { defaultValue: 'Latency p95' })}
            value={fmtMs(k.p95.value)}
            tone={k.p95.tone}
            hint={recentNote}
          />
          <Kpi
            label={t('kpi-p99', { defaultValue: 'Latency p99' })}
            value={fmtMs(k.p99.value)}
            hint={recentNote}
          />
          <Kpi
            label={t('kpi-cache', { defaultValue: 'Cache hit ratio' })}
            value={fmtPct(k.cacheHitPct.value)}
            hint={t('kpi-cache-hint', { defaultValue: 'L1 + L2 + stale-served' })}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="site-section-label">{t('section-runtime', { defaultValue: 'Runtime' })}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Kpi
            label={t('kpi-el-p99', { defaultValue: 'Event-loop delay p99' })}
            value={fmtMs(k.eventLoopP99.value)}
            tone={k.eventLoopP99.tone}
            hint={t('kpi-worst-process', { defaultValue: 'worst process' })}
          />
          <Kpi
            label={t('kpi-elu', { defaultValue: 'Event-loop utilization' })}
            value={fmtNum(k.elu.value, 2)}
            tone={k.elu.tone}
            hint={t('kpi-worst-process', { defaultValue: 'worst process' })}
          />
          <Kpi
            label={t('kpi-cpu', { defaultValue: 'CPU' })}
            value={fmtPct(k.cpu.value, 0)}
            tone={k.cpu.tone}
            hint={
              k.cpu.cores
                ? t('kpi-cpu-quota', {
                    defaultValue: 'of {{cores}} core quota',
                    cores: fmtNum(k.cpu.cores, 2),
                  })
                : t('kpi-cpu-sum', { defaultValue: 'sum across workers' })
            }
          />
          <Kpi
            label={t('kpi-throttled', { defaultValue: 'CPU throttled' })}
            value={fmtPct(k.throttled.value)}
            tone={k.throttled.tone}
            hint={t('kpi-throttled-hint', { defaultValue: 'cgroup periods, last minute' })}
          />
          <Kpi
            label={t('kpi-rss', { defaultValue: 'Memory (RSS)' })}
            value={fmtBytes(k.rss.value)}
            hint={t('kpi-rss-hint', { defaultValue: 'sum across workers' })}
          />
          <Kpi
            label={t('kpi-heap', { defaultValue: 'Heap used' })}
            value={fmtPct(k.heap.value, 0)}
            tone={k.heap.tone}
            hint={`${fmtBytes(k.heap.used)} / ${fmtBytes(k.heap.limit)}`}
          />
          <Kpi
            label={t('kpi-cgroup-mem', { defaultValue: 'Container memory' })}
            value={fmtPct(k.cgroupMem.value, 0)}
            tone={k.cgroupMem.tone}
            hint={
              k.cgroupMem.max === null
                ? t('no-limit', { defaultValue: 'no limit reported' })
                : `${fmtBytes(k.cgroupMem.current)} / ${fmtBytes(k.cgroupMem.max)}`
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="site-section-label">
          {t('section-database', { defaultValue: 'Database' })}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Kpi
            label={t('kpi-pool', { defaultValue: 'Pool in use' })}
            value={
              k.pool.inUse === null
                ? '—'
                : k.pool.max
                  ? `${fmtInt(k.pool.inUse)} / ${fmtInt(k.pool.max)}`
                  : fmtInt(k.pool.inUse)
            }
            hint={t('kpi-pool-hint', { defaultValue: 'summed across workers' })}
          />
          <Kpi
            label={t('kpi-pool-waiting', { defaultValue: 'Pool waiting' })}
            value={fmtInt(k.pool.waiting)}
            tone={k.pool.tone}
            hint={t('kpi-pool-waiting-hint', { defaultValue: 'queries queued for a connection' })}
          />
          <Kpi
            label={t('kpi-db-avg', { defaultValue: 'Avg query' })}
            value={fmtMs(k.dbAvgMs.value)}
            tone={k.dbAvgMs.tone}
            hint={recentNote}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="site-section-label">
          {t('section-trends', { defaultValue: 'Last 60 minutes' })}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <SparkCard
            label={t('spark-requests', { defaultValue: 'Requests / min' })}
            values={series.map((b) => b.requests)}
            format={fmtInt}
            inkClass="text-site-accent"
          />
          <SparkCard
            label={t('spark-5xx', { defaultValue: '5xx / min' })}
            values={series.map((b) => b.s5xx)}
            format={fmtInt}
            inkClass="text-site-danger"
          />
          <SparkCard
            label={t('spark-p95', { defaultValue: 'Latency p95' })}
            values={series.map((b) => b.p95)}
            format={fmtMs}
            inkClass="text-site-accent"
          />
          <SparkCard
            label={t('spark-el', { defaultValue: 'Event-loop delay p99' })}
            values={series.map((b) => b.eventLoopP99)}
            format={fmtMs}
            inkClass="text-site-warning"
          />
          <SparkCard
            label={t('spark-cpu', { defaultValue: 'CPU' })}
            values={series.map((b) => b.cpu)}
            format={(n) => fmtPct(n, 0)}
            inkClass="text-site-accent"
          />
          <SparkCard
            label={t('spark-heap', { defaultValue: 'Heap used' })}
            values={series.map((b) => b.heapUsed)}
            format={fmtBytes}
            inkClass="text-site-accent"
          />
        </div>
      </section>
    </div>
  );
}
