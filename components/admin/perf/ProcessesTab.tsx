import { OctagonAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { THRESHOLDS, toneFor } from '@/lib/perf/derive';
import type { PerfOverview } from '@/lib/perf/admin-types';
import type { ProcessSnapshot } from '@/lib/perf/process-metrics';
import { fmtBytes, fmtInt, fmtMs, fmtNum, fmtPct, fmtUptime } from './format';
import { Meter } from './Meter';
import { toneClass } from './Kpi';

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'danger' | 'none';
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-site-text-muted">{label}</dt>
      <dd className={`truncate text-sm font-semibold tabular-nums ${toneClass(tone ?? 'none')}`}>
        {value}
      </dd>
    </div>
  );
}

function ProcessCard({ p }: { p: ProcessSnapshot }) {
  const { t } = useTranslation('f-perf');
  const cg = p.cgroup;
  const heapPct = p.memory.heapLimit ? (p.memory.heapUsed / p.memory.heapLimit) * 100 : 0;
  const handles = Object.entries(p.handles).sort((a, b) => b[1] - a[1]);
  const gauges = Object.entries(p.gauges).filter(([, v]) => v !== null);
  const counters = Object.entries(p.counters)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  return (
    <article className="glass-fill space-y-4 rounded-site p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-site-text">{p.service}</h3>
        <Badge variant="default" size="sm">
          {t('proc-pid', { defaultValue: 'pid {{pid}}', pid: p.pid })}
        </Badge>
        {p.clusterWorkerId !== null && (
          <Badge variant="default" size="sm">
            {t('proc-worker', { defaultValue: 'worker {{id}}', id: String(p.clusterWorkerId) })}
          </Badge>
        )}
        <span className="text-xs text-site-text-dim">{p.hostname}</span>
        <span className="ml-auto text-xs text-site-text-muted">
          {t('proc-uptime', { defaultValue: 'up {{uptime}}', uptime: fmtUptime(p.uptimeSec) })}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('proc-cpu', { defaultValue: 'CPU' })} value={fmtPct(p.cpu.percent)} />
        <Stat
          label={t('proc-elu', { defaultValue: 'Event-loop util.' })}
          value={fmtNum(p.eventLoop.eluRecent, 2)}
          tone={toneFor(p.eventLoop.eluRecent, THRESHOLDS.elu)}
        />
        <Stat
          label={t('proc-el-p99', { defaultValue: 'Loop delay p99' })}
          value={fmtMs(p.eventLoop.current.p99)}
          tone={toneFor(p.eventLoop.current.p99, THRESHOLDS.eventLoopP99Ms)}
        />
        <Stat
          label={t('proc-el-max', { defaultValue: 'Loop delay max' })}
          value={fmtMs(p.eventLoop.current.max)}
        />
        <Stat
          label={t('proc-requests', { defaultValue: 'Requests' })}
          value={fmtInt(p.requests.count)}
        />
        <Stat
          label={t('proc-5xx', { defaultValue: '5xx' })}
          value={fmtInt(p.requests.s5xx)}
          tone={p.requests.s5xx > 0 ? 'warn' : 'ok'}
        />
        <Stat
          label={t('proc-p95', { defaultValue: 'p95' })}
          value={fmtMs(p.requests.p95)}
          tone={toneFor(p.requests.p95, THRESHOLDS.p95Ms)}
        />
        <Stat
          label={t('proc-gc', { defaultValue: 'GC pause (total)' })}
          value={`${fmtMs(p.gc.total.pauseMs)} / ${fmtInt(p.gc.total.count)}`}
        />
      </dl>

      <div className="space-y-3">
        <Meter
          label={t('proc-heap', { defaultValue: 'Heap used' })}
          value={p.memory.heapUsed}
          max={p.memory.heapLimit}
          text={`${fmtBytes(p.memory.heapUsed)} / ${fmtBytes(p.memory.heapLimit)}`}
          tone={toneFor(heapPct, THRESHOLDS.heapPct)}
        />
        <Meter
          label={t('proc-rss', { defaultValue: 'RSS vs container limit' })}
          value={p.memory.rss}
          max={cg?.memoryMax ?? null}
          text={
            cg?.memoryMax
              ? `${fmtBytes(p.memory.rss)} / ${fmtBytes(cg.memoryMax)}`
              : fmtBytes(p.memory.rss)
          }
          tone={
            cg?.memoryMax
              ? toneFor((p.memory.rss / cg.memoryMax) * 100, THRESHOLDS.cgroupMemPct)
              : 'none'
          }
        />
      </div>

      {(gauges.length > 0 || counters.length > 0 || handles.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {gauges.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-site-text-muted">
                {t('proc-gauges', { defaultValue: 'Gauges' })}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {gauges.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="font-mono text-site-text-dim break-all">{k}</span>
                    <span className="tabular-nums text-site-text">{fmtInt(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {counters.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-site-text-muted">
                {t('proc-counters', { defaultValue: 'Counters' })}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {counters.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="font-mono text-site-text-dim break-all">{k}</span>
                    <span className="tabular-nums text-site-text">{fmtInt(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {handles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-site-text-muted">
                {t('proc-handles', { defaultValue: 'Active handles' })}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {handles.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="font-mono text-site-text-dim break-all">{k}</span>
                    <span className="tabular-nums text-site-text">{fmtInt(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function ProcessesTab({ overview }: { overview: PerfOverview }) {
  const { t } = useTranslation('f-perf');
  const down = overview.hubs.filter(
    (h): h is { service: string; error: 'unreachable' } => 'error' in h,
  );
  const up = overview.hubs.filter((h): h is ProcessSnapshot => !('error' in h));
  const all = [...overview.processes, ...up];

  return (
    <div className="space-y-4">
      {down.length > 0 && (
        <div className="space-y-2">
          {down.map((h) => (
            <div
              key={h.service}
              className="glass-fill flex items-center gap-2 rounded-site p-4 text-sm text-site-danger"
            >
              <OctagonAlert className="size-4 shrink-0" aria-hidden />
              <span>
                {t('hub-unreachable', {
                  defaultValue: '{{service}} hub is unreachable (no metrics within 1.5 s).',
                  service: h.service,
                })}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {all.map((p) => (
          <ProcessCard key={`${p.service}:${p.hostname}:${p.pid}`} p={p} />
        ))}
      </div>
    </div>
  );
}
