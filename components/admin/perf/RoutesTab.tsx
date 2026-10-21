import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { RouteRow } from '@/lib/perf/process-metrics';
import { DataTable, type Column } from './DataTable';
import { fmtInt, fmtMs, fmtNum, fmtPct } from './format';

/** A route is "slow" past this p95, "erroring" past this 5xx share, "chatty" past this many queries. */
const SLOW_P95_MS = 1000;
const ERROR_PCT = 1;
const CHATTY_QUERIES = 15;

const errPct = (r: RouteRow) => (r.count ? (r.errors5xx / r.count) * 100 : 0);

export function RoutesTab({ routes }: { routes: RouteRow[] }) {
  const { t } = useTranslation('f-perf');
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? routes.filter((r) => `${r.method} ${r.route}`.toLowerCase().includes(q)) : routes;
  }, [routes, filter]);

  // The three routes costing the most total time are the first place to look; the
  // flag survives filtering because it is computed from the unfiltered table.
  const costly = useMemo(
    () =>
      new Set(
        [...routes]
          .sort((a, b) => b.sumMs - a.sumMs)
          .slice(0, 3)
          .map((r) => `${r.method} ${r.route}`),
      ),
    [routes],
  );

  const columns: Column<RouteRow>[] = [
    {
      id: 'route',
      header: t('col-route', { defaultValue: 'Route' }),
      sortValue: (r) => r.route,
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-site-text-dim">{r.method}</span>
          <span className="font-mono text-xs break-all">{r.route}</span>
          {costly.has(`${r.method} ${r.route}`) && (
            <Badge variant="warning" size="sm">
              {t('badge-costly', { defaultValue: 'top cost' })}
            </Badge>
          )}
        </span>
      ),
    },
    {
      id: 'count',
      header: t('col-count', { defaultValue: 'Requests' }),
      align: 'right',
      sortValue: (r) => r.count,
      render: (r) => fmtInt(r.count),
    },
    {
      id: 'e5xx',
      header: t('col-5xx', { defaultValue: '5xx' }),
      align: 'right',
      sortValue: (r) => r.errors5xx,
      render: (r) => fmtInt(r.errors5xx),
    },
    {
      id: 'errpct',
      header: t('col-err-pct', { defaultValue: 'Error %' }),
      align: 'right',
      sortValue: errPct,
      render: (r) => fmtPct(errPct(r), 2),
      cellClass: (r) => (errPct(r) >= ERROR_PCT ? 'text-site-danger font-semibold' : undefined),
    },
    {
      id: 'e4xx',
      header: t('col-4xx', { defaultValue: '4xx' }),
      align: 'right',
      sortValue: (r) => r.errors4xx,
      render: (r) => fmtInt(r.errors4xx),
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
      cellClass: (r) => (r.p95 >= SLOW_P95_MS ? 'text-site-danger font-semibold' : undefined),
    },
    {
      id: 'p99',
      header: t('col-p99', { defaultValue: 'p99' }),
      align: 'right',
      sortValue: (r) => r.p99,
      render: (r) => fmtMs(r.p99),
    },
    {
      id: 'max',
      header: t('col-max', { defaultValue: 'Max' }),
      align: 'right',
      sortValue: (r) => r.maxMs,
      render: (r) => fmtMs(r.maxMs),
    },
    {
      id: 'queries',
      header: t('col-queries', { defaultValue: 'Queries / req' }),
      align: 'right',
      sortValue: (r) => r.avgQueries,
      render: (r) => fmtNum(r.avgQueries, 1),
      cellClass: (r) =>
        r.avgQueries >= CHATTY_QUERIES ? 'text-site-warning font-semibold' : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('routes-filter', { defaultValue: 'Filter routes…' })}
          aria-label={t('routes-filter-label', { defaultValue: 'Filter routes' })}
          className="max-w-xs"
        />
        <p className="text-xs text-site-text-dim">
          {t('routes-note', {
            defaultValue:
              'Paths are normalised (ids and handles collapse to :id, at most 4 segments); counts are since each worker started.',
          })}
        </p>
      </div>
      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => `${r.method} ${r.route}`}
        initialSort={{ id: 'count', dir: 'desc' }}
        empty={t('routes-empty', { defaultValue: 'No requests recorded yet.' })}
        sortLabel={(h) => t('sort-by', { defaultValue: 'Sort by {{column}}', column: h })}
      />
    </div>
  );
}
