import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { HeapReport, PerfOverview, RedisPlaneReport } from '@/lib/perf/admin-types';
import { allSnapshots } from '@/lib/perf/derive';
import { useLazyJson } from './api';
import { fmtBytes, fmtInt, fmtMs, fmtNum, fmtPct, fmtUptime } from './format';

function Pairs({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-t border-site-border py-1.5">
          <dt className="text-site-text-muted">{k}</dt>
          <dd className="text-right font-mono text-xs break-all tabular-nums text-site-text">
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RedisCard({ title, report }: { title: string; report: RedisPlaneReport | null }) {
  const { t } = useTranslation('f-perf');
  const i = report?.info;
  const get = (k: string) => i?.[k];
  const hits = Number(get('keyspace_hits') ?? 0);
  const misses = Number(get('keyspace_misses') ?? 0);
  return (
    <article className="glass-fill space-y-3 rounded-site p-4">
      <h3 className="text-base font-bold text-site-text">{title}</h3>
      {!report || !i ? (
        <p className="text-sm text-site-text-muted">
          {t('redis-unreachable', { defaultValue: 'Redis is not configured or did not answer.' })}
        </p>
      ) : (
        <Pairs
          rows={[
            [
              t('redis-ping', { defaultValue: 'Ping' }),
              report.ping === null ? '—' : fmtMs(report.ping),
            ],
            [t('redis-version', { defaultValue: 'Version' }), String(get('redis_version') ?? '—')],
            [
              t('redis-uptime', { defaultValue: 'Uptime' }),
              fmtUptime(Number(get('uptime_in_seconds'))),
            ],
            [
              t('redis-memory', { defaultValue: 'Memory' }),
              `${String(get('used_memory_human') ?? '—')} / ${Number(get('maxmemory')) ? String(get('maxmemory_human')) : t('redis-no-max', { defaultValue: 'no max' })}`,
            ],
            [
              t('redis-policy', { defaultValue: 'Eviction policy' }),
              String(get('maxmemory_policy') ?? '—'),
            ],
            [
              t('redis-evicted', { defaultValue: 'Evicted keys' }),
              fmtInt(Number(get('evicted_keys'))),
            ],
            [t('redis-keys', { defaultValue: 'Keys' }), fmtInt(Number(get('keys')))],
            [
              t('redis-clients', { defaultValue: 'Clients' }),
              fmtInt(Number(get('connected_clients'))),
            ],
            [
              t('redis-ops', { defaultValue: 'Ops / sec' }),
              fmtInt(Number(get('instantaneous_ops_per_sec'))),
            ],
            [
              t('redis-commands', { defaultValue: 'Commands processed' }),
              fmtInt(Number(get('total_commands_processed'))),
            ],
            [
              t('redis-hit', { defaultValue: 'Keyspace hit ratio' }),
              hits + misses ? fmtPct((hits / (hits + misses)) * 100) : '—',
            ],
            [
              t('redis-rejected', { defaultValue: 'Rejected connections' }),
              fmtInt(Number(get('rejected_connections'))),
            ],
          ]}
        />
      )}
    </article>
  );
}

function HeapSection() {
  const { t } = useTranslation('f-perf');
  const { data, loading, failed, reload } = useLazyJson<HeapReport>('/api/admin/perf/heap');
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="site-section-label">
          {t('heap-title', { defaultValue: 'V8 heap spaces' })}
        </h2>
        <Button size="xs" variant="outline" onClick={() => void reload()} disabled={loading}>
          <RefreshCw aria-hidden />
          {t('diag-reload', { defaultValue: 'Reload' })}
        </Button>
      </div>
      {loading && !data ? (
        <Spinner />
      ) : failed || !data ? (
        <p className="glass-fill rounded-site p-4 text-sm text-site-text-muted">
          {t('heap-failed', { defaultValue: 'Could not load heap statistics.' })}
        </p>
      ) : (
        <>
          <p className="text-xs text-site-text-dim">
            {t('heap-scope', {
              defaultValue:
                'Worker pid {{pid}} (the one that answered). Detached contexts: {{detached}}.',
              pid: data.pid,
              detached: fmtInt(data.heap.number_of_detached_contexts),
            })}
          </p>
          <div className="glass-fill overflow-x-auto rounded-site">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-semibold text-site-text-muted"
                  >
                    {t('col-space', { defaultValue: 'Space' })}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right text-xs font-semibold text-site-text-muted"
                  >
                    {t('col-used', { defaultValue: 'Used' })}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right text-xs font-semibold text-site-text-muted"
                  >
                    {t('col-size', { defaultValue: 'Size' })}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right text-xs font-semibold text-site-text-muted"
                  >
                    {t('col-available', { defaultValue: 'Available' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.spaces.map((s) => (
                  <tr key={s.space_name} className="border-t border-site-border">
                    <td className="px-3 py-2 font-mono text-xs text-site-text">{s.space_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-site-text">
                      {fmtBytes(s.space_used_size)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-site-text">
                      {fmtBytes(s.space_size)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-site-text">
                      {fmtBytes(s.space_available_size)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function RuntimeTab({ overview }: { overview: PerfOverview }) {
  const { t } = useTranslation('f-perf');
  const snaps = allSnapshots(overview);
  const withCgroup = snaps.filter((s) => s.cgroup);
  // Every process in one container reads the same cgroup; show one per service.
  const seen = new Set<string>();
  const cgroups = withCgroup.filter((s) =>
    seen.has(s.service) ? false : (seen.add(s.service), true),
  );
  const os = overview.processes[0]?.os ?? snaps[0]?.os;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="site-section-label">{t('redis-title', { defaultValue: 'Redis' })}</h2>
        {!overview.redis.enabled ? (
          <p className="glass-fill rounded-site p-4 text-sm text-site-text-muted">
            {t('redis-off', {
              defaultValue:
                'Redis is not configured (REDIS_URL unset); caches and rate limits are per-process.',
            })}
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <RedisCard
              title={
                overview.redis.distinct
                  ? t('redis-cache-plane', { defaultValue: 'Cache plane' })
                  : t('redis-single', { defaultValue: 'Cache + state (one instance)' })
              }
              report={overview.redis.cache}
            />
            {overview.redis.distinct && (
              <RedisCard
                title={t('redis-state-plane', { defaultValue: 'State plane' })}
                report={overview.redis.state}
              />
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="site-section-label">
          {t('cgroup-title', { defaultValue: 'Container limits (cgroup)' })}
        </h2>
        {cgroups.length === 0 ? (
          <p className="glass-fill rounded-site p-4 text-sm text-site-text-muted">
            {t('cgroup-none', {
              defaultValue: 'No cgroup information (not running in a Linux container).',
            })}
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {cgroups.map((s) => {
              const c = s.cgroup!;
              return (
                <article key={s.service} className="glass-fill space-y-3 rounded-site p-4">
                  <h3 className="text-base font-bold text-site-text">
                    {s.service} · cgroup v{c.version}
                  </h3>
                  <Pairs
                    rows={[
                      [
                        t('cg-mem', { defaultValue: 'Memory' }),
                        `${fmtBytes(c.memoryCurrent)} / ${c.memoryMax ? fmtBytes(c.memoryMax) : t('no-limit-short', { defaultValue: 'no limit' })}`,
                      ],
                      [
                        t('cg-anon', { defaultValue: 'Anon / file' }),
                        `${fmtBytes(c.memoryAnon)} / ${fmtBytes(c.memoryFile)}`,
                      ],
                      [
                        t('cg-oom', { defaultValue: 'OOM events / kills' }),
                        `${fmtInt(c.oom)} / ${fmtInt(c.oomKill)}`,
                      ],
                      [
                        t('cg-cpu-quota', { defaultValue: 'CPU quota' }),
                        c.cpuCores
                          ? t('cg-cores', { defaultValue: '{{count}} cores', count: c.cpuCores })
                          : t('no-limit-short', { defaultValue: 'no limit' }),
                      ],
                      [
                        t('cg-cpu-used', { defaultValue: 'CPU used (last minute)' }),
                        c.cpuCoresUsedLastMinute === null
                          ? '—'
                          : t('cg-cores', {
                              defaultValue: '{{count}} cores',
                              count: c.cpuCoresUsedLastMinute,
                            }),
                      ],
                      [
                        t('cg-periods', { defaultValue: 'Throttled periods' }),
                        `${fmtInt(c.nrThrottled)} / ${fmtInt(c.nrPeriods)}`,
                      ],
                      [
                        t('cg-throttled-pct', { defaultValue: 'Throttled (last minute)' }),
                        fmtPct(c.throttledPctLastMinute),
                      ],
                      [
                        t('cg-throttled-time', { defaultValue: 'Throttled time' }),
                        c.throttledUsec === null ? '—' : fmtMs(c.throttledUsec / 1000),
                      ],
                    ]}
                  />
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="site-section-label">
          {t('gc-title', { defaultValue: 'Garbage collection' })}
        </h2>
        <div className="glass-fill overflow-x-auto rounded-site">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr>
                {[
                  t('col-process', { defaultValue: 'Process' }),
                  t('col-gc-minor', { defaultValue: 'Minor' }),
                  t('col-gc-major', { defaultValue: 'Major' }),
                  t('col-gc-incremental', { defaultValue: 'Incremental' }),
                  t('col-gc-weakcb', { defaultValue: 'Weak callbacks' }),
                  t('col-gc-last-min', { defaultValue: 'Last minute' }),
                ].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-3 py-2 text-xs font-semibold text-site-text-muted ${i === 0 ? 'text-left' : 'text-right'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snaps.map((s) => {
                const kind = (k: string) => {
                  const row = s.gc.total.byKind[k];
                  return row ? `${fmtInt(row.count)} · ${fmtMs(row.pauseMs)}` : '—';
                };
                const last = s.gc.lastMinute;
                return (
                  <tr key={`${s.service}:${s.pid}`} className="border-t border-site-border">
                    <td className="px-3 py-2 font-mono text-xs text-site-text">
                      {s.service}:{s.pid}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-site-text">
                      {kind('minor')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-site-text">
                      {kind('major')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-site-text">
                      {kind('incremental')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-site-text">
                      {kind('weakcb')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-site-text">
                      {last ? `${fmtInt(last.count)} · ${fmtMs(last.pauseMs)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <HeapSection />

      {os && (
        <section className="space-y-3">
          <h2 className="site-section-label">{t('os-title', { defaultValue: 'Host' })}</h2>
          <div className="glass-fill rounded-site p-4">
            <Pairs
              rows={[
                [
                  t('os-load', { defaultValue: 'Load average (1 / 5 / 15 min)' }),
                  os.loadavg.map((n) => fmtNum(n, 2)).join(' / '),
                ],
                [t('os-cpus', { defaultValue: 'CPUs visible' }), fmtInt(os.cpus)],
                [
                  t('os-mem', { defaultValue: 'Memory free / total' }),
                  `${fmtBytes(os.freemem)} / ${fmtBytes(os.totalmem)}`,
                ],
              ]}
            />
          </div>
        </section>
      )}
    </div>
  );
}
