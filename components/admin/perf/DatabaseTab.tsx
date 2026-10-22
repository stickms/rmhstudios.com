import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { DbDiagnostics, PerfOverview, Row } from '@/lib/perf/admin-types';
import type { OpRow, SlowQuery } from '@/lib/perf/process-metrics';
import { useLazyJson } from './api';
import { DataTable, type Column } from './DataTable';
import { fmtBytes, fmtClock, fmtInt, fmtMs, fmtNum, fmtPct } from './format';
import { Kpi } from './Kpi';

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));
const str = (v: unknown) => (v === null || v === undefined ? '—' : String(v));

function SectionTitle({ children }: { children: string }) {
  return <h2 className="site-section-label">{children}</h2>;
}

/** Generic table over loosely-typed diagnostic rows. */
function RowsTable({
  rows,
  columns,
  empty,
  keyOf,
}: {
  rows: Row[] | null | undefined;
  columns: Column<Row>[];
  empty: string;
  keyOf: (row: Row, i: number) => string;
}) {
  const { t } = useTranslation('f-perf');
  if (rows === null || rows === undefined) {
    return (
      <p className="glass-fill rounded-site p-4 text-sm text-site-text-muted">
        {t('diag-unavailable', { defaultValue: 'Unavailable (the query failed or timed out).' })}
      </p>
    );
  }
  // `DataTable` keys rows by a function of the row alone; index-qualify so two
  // rows that share a natural key still render.
  const indexed = rows.map((r, i) => ({ ...r, __i: i }));
  return (
    <DataTable
      rows={indexed}
      columns={columns}
      rowKey={(r) => keyOf(r, r.__i as number)}
      empty={empty}
      sortLabel={(h) => t('sort-by', { defaultValue: 'Sort by {{column}}', column: h })}
    />
  );
}

function DiagnosticsSection() {
  const { t } = useTranslation('f-perf');
  const { data, loading, failed, reload } = useLazyJson<DbDiagnostics>('/api/admin/perf/db');

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SectionTitle>{t('diag-title', { defaultValue: 'Postgres diagnostics' })}</SectionTitle>
      <Button size="xs" variant="outline" onClick={() => void reload()} disabled={loading}>
        <RefreshCw aria-hidden />
        {t('diag-reload', { defaultValue: 'Reload' })}
      </Button>
    </div>
  );

  if (loading && !data) {
    return (
      <section className="space-y-3">
        {header}
        <Spinner />
      </section>
    );
  }
  if (failed || !data) {
    return (
      <section className="space-y-3">
        {header}
        <p className="glass-fill rounded-site p-6 text-center text-sm text-site-text-muted">
          {t('diag-failed', { defaultValue: 'Could not load Postgres diagnostics.' })}
        </p>
      </section>
    );
  }

  const db = data.database;
  const hit = db?.cacheHitRatio ?? null;
  const conn = data.connections;
  const rightNum = (
    id: string,
    header: string,
    fmt: (n: number) => string,
    key: string,
  ): Column<Row> => ({
    id,
    header,
    align: 'right',
    sortValue: (r) => num(r[key]),
    render: (r) => fmt(num(r[key])),
  });
  const textCol = (id: string, header: string, key: string, mono = false): Column<Row> => ({
    id,
    header,
    sortValue: (r) => str(r[key]),
    render: (r) => (
      <span className={mono ? 'font-mono text-xs break-all' : undefined}>{str(r[key])}</span>
    ),
  });

  return (
    <section className="space-y-4">
      {header}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <Kpi
          label={t('diag-connections', { defaultValue: 'Connections' })}
          value={conn ? `${fmtInt(num(conn.used))} / ${fmtInt(num(conn.max))}` : '—'}
          tone={conn && num(conn.used) / Math.max(num(conn.max), 1) > 0.8 ? 'warn' : 'ok'}
        />
        <Kpi
          label={t('diag-cache-hit', { defaultValue: 'Buffer cache hit' })}
          value={hit === null ? '—' : fmtPct(hit * 100, 2)}
          tone={hit !== null && hit < 0.95 ? 'warn' : 'ok'}
          hint={t('diag-cache-hit-hint', { defaultValue: 'blocks served from memory' })}
        />
        <Kpi
          label={t('diag-locks', { defaultValue: 'Waiting locks' })}
          value={fmtInt(data.waitingLocks)}
          tone={data.waitingLocks ? 'warn' : 'ok'}
        />
        <Kpi
          label={t('diag-size', { defaultValue: 'Database size' })}
          value={fmtBytes(data.server ? num(data.server.size_bytes) : null)}
          hint={data.server ? str(data.server.version).split(' ').slice(0, 2).join(' ') : undefined}
        />
        <Kpi
          label={t('diag-deadlocks', { defaultValue: 'Deadlocks' })}
          value={fmtInt(db ? num(db.deadlocks) : null)}
          tone={db && num(db.deadlocks) > 0 ? 'warn' : 'ok'}
          hint={t('diag-since-reset', { defaultValue: 'since stats reset' })}
        />
        <Kpi
          label={t('diag-rollbacks', { defaultValue: 'Rollbacks' })}
          value={fmtInt(db ? num(db.xact_rollback) : null)}
          hint={
            db
              ? t('diag-commits', { defaultValue: '{{count}} commits', count: num(db.xact_commit) })
              : undefined
          }
        />
        <Kpi
          label={t('diag-temp', { defaultValue: 'Temp files' })}
          value={fmtInt(db ? num(db.temp_files) : null)}
          hint={db ? fmtBytes(num(db.temp_bytes)) : undefined}
        />
        <Kpi
          label={t('diag-pool', { defaultValue: 'App pool (this worker)' })}
          value={(() => {
            const pool = data.pool as {
              primary?: { total: number; idle: number; waiting: number; max: number };
            } | null;
            const p = pool?.primary;
            return p ? `${fmtInt(p.total - p.idle)} / ${fmtInt(p.max)}` : '—';
          })()}
          hint={t('diag-pool-hint', { defaultValue: 'in use / max connections' })}
        />
      </div>

      <SectionTitle>{t('diag-activity', { defaultValue: 'Connections by state' })}</SectionTitle>
      <RowsTable
        rows={data.activity}
        empty={t('diag-none', { defaultValue: 'Nothing to show.' })}
        keyOf={(r) => `${str(r.state)}|${str(r.wait_event_type)}`}
        columns={[
          textCol('state', t('col-state', { defaultValue: 'State' }), 'state'),
          textCol('wait', t('col-wait-type', { defaultValue: 'Wait type' }), 'wait_event_type'),
          rightNum('count', t('col-count-short', { defaultValue: 'Count' }), fmtInt, 'count'),
        ]}
      />

      <SectionTitle>{t('diag-longest', { defaultValue: 'Longest-running queries' })}</SectionTitle>
      <RowsTable
        rows={data.longestRunning}
        empty={t('diag-none-running', { defaultValue: 'No active queries right now.' })}
        keyOf={(r) => str(r.pid)}
        columns={[
          rightNum('pid', t('col-pid', { defaultValue: 'PID' }), (n) => String(n), 'pid'),
          textCol('state', t('col-state', { defaultValue: 'State' }), 'state'),
          rightNum('dur', t('col-duration', { defaultValue: 'Duration' }), fmtMs, 'duration_ms'),
          textCol('wait', t('col-wait', { defaultValue: 'Wait' }), 'wait_event'),
          textCol('app', t('col-app', { defaultValue: 'Application' }), 'application_name'),
          textCol('query', t('col-query', { defaultValue: 'Query' }), 'query', true),
        ]}
      />

      <SectionTitle>
        {t('diag-statements', { defaultValue: 'Top statements by total time' })}
      </SectionTitle>
      {data.statements.available ? (
        <RowsTable
          rows={data.statements.rows}
          empty={t('diag-none', { defaultValue: 'Nothing to show.' })}
          keyOf={(_r, i) => String(i)}
          columns={[
            textCol('query', t('col-query', { defaultValue: 'Query' }), 'query', true),
            rightNum('calls', t('col-calls', { defaultValue: 'Calls' }), fmtInt, 'calls'),
            rightNum('total', t('col-total', { defaultValue: 'Total' }), fmtMs, 'total_exec_time'),
            rightNum('mean', t('col-mean', { defaultValue: 'Mean' }), fmtMs, 'mean_exec_time'),
            rightNum('max', t('col-max', { defaultValue: 'Max' }), fmtMs, 'max_exec_time'),
            rightNum('rows', t('col-rows', { defaultValue: 'Rows' }), fmtInt, 'rows'),
          ]}
        />
      ) : (
        <p className="glass-fill rounded-site p-4 text-sm text-site-text-muted">
          {t('diag-no-pgss', {
            defaultValue: 'The pg_stat_statements extension is not installed on this database.',
          })}
        </p>
      )}

      <SectionTitle>{t('diag-tables', { defaultValue: 'Largest tables' })}</SectionTitle>
      <RowsTable
        rows={data.tables}
        empty={t('diag-none', { defaultValue: 'Nothing to show.' })}
        keyOf={(r) => str(r.table)}
        columns={[
          textCol('table', t('col-table', { defaultValue: 'Table' }), 'table', true),
          rightNum('size', t('col-size', { defaultValue: 'Size' }), fmtBytes, 'total_bytes'),
          rightNum('live', t('col-live', { defaultValue: 'Live rows' }), fmtInt, 'n_live_tup'),
          rightNum('dead', t('col-dead', { defaultValue: 'Dead rows' }), fmtInt, 'n_dead_tup'),
          rightNum('seq', t('col-seq', { defaultValue: 'Seq scans' }), fmtInt, 'seq_scan'),
          rightNum('idx', t('col-idx', { defaultValue: 'Index scans' }), fmtInt, 'idx_scan'),
          textCol(
            'vac',
            t('col-autovacuum', { defaultValue: 'Last autovacuum' }),
            'last_autovacuum',
          ),
        ]}
      />

      <SectionTitle>
        {t('diag-seq-hints', { defaultValue: 'Possible missing indexes' })}
      </SectionTitle>
      <p className="text-xs text-site-text-dim">
        {t('diag-seq-hints-note', {
          defaultValue: 'Tables over 10,000 rows scanned sequentially more often than by index.',
        })}
      </p>
      <RowsTable
        rows={data.seqScanHints}
        empty={t('diag-none-hints', { defaultValue: 'No candidates.' })}
        keyOf={(r) => str(r.table)}
        columns={[
          textCol('table', t('col-table', { defaultValue: 'Table' }), 'table', true),
          rightNum('seq', t('col-seq', { defaultValue: 'Seq scans' }), fmtInt, 'seq_scan'),
          rightNum('idx', t('col-idx', { defaultValue: 'Index scans' }), fmtInt, 'idx_scan'),
          rightNum('live', t('col-live', { defaultValue: 'Live rows' }), fmtInt, 'n_live_tup'),
          rightNum(
            'read',
            t('col-seq-read', { defaultValue: 'Rows read by seq scans' }),
            fmtInt,
            'seq_tup_read',
          ),
        ]}
      />

      <SectionTitle>{t('diag-unused', { defaultValue: 'Unused indexes' })}</SectionTitle>
      <p className="text-xs text-site-text-dim">
        {t('diag-unused-note', {
          defaultValue:
            'Never scanned since the last stats reset, over 1 MB, and not enforcing a unique or primary-key constraint.',
        })}
      </p>
      <RowsTable
        rows={data.unusedIndexes}
        empty={t('diag-none-hints', { defaultValue: 'No candidates.' })}
        keyOf={(r) => `${str(r.table)}.${str(r.index)}`}
        columns={[
          textCol('table', t('col-table', { defaultValue: 'Table' }), 'table', true),
          textCol('index', t('col-index', { defaultValue: 'Index' }), 'index', true),
          rightNum('size', t('col-size', { defaultValue: 'Size' }), fmtBytes, 'bytes'),
        ]}
      />
    </section>
  );
}

export function DatabaseTab({ overview }: { overview: PerfOverview }) {
  const { t } = useTranslation('f-perf');
  const { db, gauges } = overview.cluster;

  const opColumns: Column<OpRow>[] = [
    {
      id: 'op',
      header: t('col-op', { defaultValue: 'Operation' }),
      sortValue: (r) => r.op,
      render: (r) => <span className="font-mono text-xs">{r.op}</span>,
    },
    {
      id: 'count',
      header: t('col-count-short', { defaultValue: 'Count' }),
      align: 'right',
      sortValue: (r) => r.count,
      render: (r) => fmtInt(r.count),
    },
    {
      id: 'err',
      header: t('col-errors', { defaultValue: 'Errors' }),
      align: 'right',
      sortValue: (r) => r.errors,
      render: (r) => fmtInt(r.errors),
      cellClass: (r) => (r.errors > 0 ? 'text-site-danger font-semibold' : undefined),
    },
    {
      id: 'avg',
      header: t('col-avg', { defaultValue: 'Avg' }),
      align: 'right',
      sortValue: (r) => r.avgMs,
      render: (r) => fmtMs(r.avgMs),
    },
    {
      id: 'p95',
      header: t('col-p95', { defaultValue: 'p95' }),
      align: 'right',
      sortValue: (r) => r.p95,
      render: (r) => fmtMs(r.p95),
    },
    {
      id: 'max',
      header: t('col-max', { defaultValue: 'Max' }),
      align: 'right',
      sortValue: (r) => r.maxMs,
      render: (r) => fmtMs(r.maxMs),
    },
    {
      id: 'total',
      header: t('col-total-time', { defaultValue: 'Total time' }),
      align: 'right',
      sortValue: (r) => r.totalMs,
      render: (r) => fmtMs(r.totalMs),
    },
  ];

  const slowColumns: Column<SlowQuery>[] = [
    {
      id: 'at',
      header: t('col-time', { defaultValue: 'Time' }),
      render: (r) => fmtClock(r.at),
      sortValue: (r) => r.at,
    },
    {
      id: 'ms',
      header: t('col-duration', { defaultValue: 'Duration' }),
      align: 'right',
      render: (r) => fmtMs(r.ms),
      sortValue: (r) => r.ms,
    },
    {
      id: 'op',
      header: t('col-op', { defaultValue: 'Operation' }),
      render: (r) => <span className="font-mono text-xs">{r.op}</span>,
    },
    {
      id: 'route',
      header: t('col-route', { defaultValue: 'Route' }),
      render: (r) => <span className="font-mono text-xs break-all">{r.route || '—'}</span>,
    },
    {
      id: 'proc',
      header: t('col-process', { defaultValue: 'Process' }),
      render: (r) => `${r.service ?? '?'}:${r.pid ?? '?'}`,
    },
  ];

  const g = (name: string) => gauges[name];
  const hasPool = g('db.pool.total') !== undefined;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionTitle>
          {t('db-app-side', { defaultValue: 'Application side (web tier)' })}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Kpi
            label={t('db-queries', { defaultValue: 'Queries' })}
            value={fmtInt(db.totals.count)}
            hint={t('since-boot', { defaultValue: 'since boot' })}
          />
          <Kpi label={t('db-avg', { defaultValue: 'Avg query' })} value={fmtMs(db.totals.avgMs)} />
          <Kpi
            label={t('db-errors', { defaultValue: 'Query errors' })}
            value={fmtInt(db.totals.errors)}
            tone={db.totals.errors > 0 ? 'warn' : 'ok'}
          />
          <Kpi
            label={t('db-slow', { defaultValue: 'Slow queries' })}
            value={fmtInt(db.totals.slow)}
            hint={t('db-slow-hint', { defaultValue: 'over the slow-query threshold' })}
          />
          {hasPool && (
            <>
              <Kpi
                label={t('db-pool-in-use', { defaultValue: 'Pool in use' })}
                value={`${fmtInt(g('db.pool.total') - (g('db.pool.idle') ?? 0))} / ${fmtInt(g('db.pool.max'))}`}
                hint={t('db-pool-hint', { defaultValue: 'summed across workers' })}
              />
              <Kpi
                label={t('db-pool-idle', { defaultValue: 'Pool idle' })}
                value={fmtInt(g('db.pool.idle'))}
              />
              <Kpi
                label={t('db-pool-waiting', { defaultValue: 'Pool waiting' })}
                value={fmtInt(g('db.pool.waiting'))}
                tone={g('db.pool.waiting') > 0 ? 'warn' : 'ok'}
              />
            </>
          )}
          {g('db.replica.pool.total') !== undefined && (
            <Kpi
              label={t('db-replica', { defaultValue: 'Replica pool in use' })}
              value={`${fmtInt(g('db.replica.pool.total') - (g('db.replica.pool.idle') ?? 0))} / ${fmtInt(g('db.replica.pool.max'))}`}
              hint={`${fmtNum(g('db.replica.pool.waiting'), 0)} ${t('db-waiting-word', { defaultValue: 'waiting' })}`}
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>{t('db-ops', { defaultValue: 'Queries by operation' })}</SectionTitle>
        <DataTable
          rows={db.ops}
          columns={opColumns}
          rowKey={(r) => r.op}
          initialSort={{ id: 'total', dir: 'desc' }}
          empty={t('db-ops-empty', { defaultValue: 'No queries recorded yet.' })}
          sortLabel={(h) => t('sort-by', { defaultValue: 'Sort by {{column}}', column: h })}
        />
      </section>

      <section className="space-y-3">
        <SectionTitle>{t('db-slow-feed', { defaultValue: 'Slow queries' })}</SectionTitle>
        <p className="text-xs text-site-text-dim">
          {t('db-slow-feed-note', {
            defaultValue:
              'Newest first, last 50. Threshold is PERF_SLOW_QUERY_MS (default 250 ms).',
          })}
        </p>
        <DataTable
          rows={db.slowQueries}
          columns={slowColumns}
          rowKey={(r) => `${r.at}|${r.op}|${r.pid}|${r.ms}`}
          initialSort={{ id: 'at', dir: 'desc' }}
          empty={t('db-slow-empty', { defaultValue: 'No slow queries recorded.' })}
          sortLabel={(h) => t('sort-by', { defaultValue: 'Sort by {{column}}', column: h })}
        />
      </section>

      <DiagnosticsSection />
    </div>
  );
}
