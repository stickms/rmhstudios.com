/**
 * /admin/census (third-pass audit DT1): every table and every catalogue product, live or
 * from a stored monthly snapshot, with a "quiet for 90 days" filter. The numbers are the
 * census document as stored; the quiet verdict is derived from it here (`tableQuiet`), so
 * the page and the evidence file apply one rule. The filter is a Select because "unknown" is
 * a third answer, and the one to chase before DT2 drops anything.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/admin/perf/DataTable';
import { adminCensusQuery } from '@/lib/admin/admin-ops.queries';
import { takeAdminCensusSnapshotApi } from '@/lib/admin/census.contract';
import {
  CENSUS_ACTIVE_DAYS,
  CENSUS_QUIET_DAYS,
  CENSUS_SCAN_MAX_BYTES,
  censusMonth,
  productQuiet,
  summarizeCensus,
  tableQuiet,
  tableWrites,
  type Census,
  type CensusProduct,
  type CensusTable,
  type Quiet,
  type QuietVerdict,
} from '@/lib/admin/census';

const LIVE = 'live';
const nf = new Intl.NumberFormat('en-US');

/** ISO timestamps are UTC; the page prints them as they are, so server and browser agree. */
const day = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');
const minute = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

function bytes(n: number): string {
  if (n < 1024 * 1024) return `${nf.format(Math.round(n / 1024))} kB`;
  return `${nf.format(Math.round(n / (1024 * 1024)))} MB`;
}

type TableRow = CensusTable & { quiet: Quiet; writes: number };
type ProductRow = CensusProduct & { quiet: QuietVerdict };

type Filter = 'all' | QuietVerdict;

const VERDICT_ORDER: Record<QuietVerdict, number> = { quiet: 0, unknown: 1, active: 2 };

export function CensusPanel() {
  const { t } = useTranslation('admin');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [source, setSource] = useState<string>(LIVE);
  const [tab, setTab] = useState<string>('tables');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isPending, isError } = useQuery(adminCensusQuery(source === LIVE ? null : source));
  const census: Census | null = data?.census ?? null;
  const baseline = data?.baseline ?? null;

  const verdictLabel = (v: QuietVerdict): string =>
    v === 'quiet'
      ? t('census-verdict-quiet', { defaultValue: 'Quiet' })
      : v === 'active'
        ? t('census-verdict-active', { defaultValue: 'Active' })
        : t('census-verdict-unknown', { defaultValue: 'Unknown' });

  const basisLabel = (q: Quiet): string => {
    if (q.basis === 'newest-row')
      return t('census-basis-newest-row', { defaultValue: 'newest row' });
    if (q.basis === 'autoanalyze')
      return t('census-basis-autoanalyze', { defaultValue: 'autoanalyze' });
    if (q.basis === 'counters')
      return t('census-basis-counters', { defaultValue: 'write counters' });
    if (q.basis === 'snapshots')
      return t('census-basis-snapshots', { defaultValue: 'monthly snapshots' });
    return '';
  };

  const tableRows = useMemo<TableRow[]>(
    () =>
      census
        ? census.tables.map((row) => ({
            ...row,
            quiet: tableQuiet(row, census, baseline),
            writes: tableWrites(row),
          }))
        : [],
    [census, baseline],
  );
  const productRows = useMemo<ProductRow[]>(
    () =>
      census ? census.products.map((row) => ({ ...row, quiet: productQuiet(row, census) })) : [],
    [census],
  );
  const summary = useMemo(
    () => (census ? summarizeCensus(census, baseline) : null),
    [census, baseline],
  );

  const needle = search.trim().toLowerCase();
  const shownTables = tableRows.filter(
    (r) =>
      (filter === 'all' || r.quiet.verdict === filter) &&
      (!needle || r.table.toLowerCase().includes(needle)),
  );
  const shownProducts = productRows.filter(
    (r) =>
      (filter === 'all' || r.quiet === filter) &&
      (!needle || r.id.includes(needle) || r.title.toLowerCase().includes(needle)),
  );

  const tableColumns: Column<TableRow>[] = [
    {
      id: 'table',
      header: t('census-col-table', { defaultValue: 'Table' }),
      render: (r) => <span className="font-mono">{r.table}</span>,
      sortValue: (r) => r.table,
    },
    {
      id: 'rows',
      header: t('census-col-rows', { defaultValue: 'Rows' }),
      align: 'right',
      render: (r) => <span className="font-mono">{nf.format(r.liveRows)}</span>,
      sortValue: (r) => r.liveRows,
    },
    {
      id: 'writes',
      header: t('census-col-writes', { defaultValue: 'Writes' }),
      align: 'right',
      render: (r) => <span className="font-mono">{nf.format(r.writes)}</span>,
      sortValue: (r) => r.writes,
    },
    {
      id: 'index-reads',
      header: t('census-col-index-reads', { defaultValue: 'Index reads' }),
      align: 'right',
      render: (r) => <span className="font-mono">{nf.format(r.indexScans)}</span>,
      sortValue: (r) => r.indexScans,
    },
    {
      id: 'size',
      header: t('census-col-size', { defaultValue: 'Size' }),
      align: 'right',
      render: (r) => <span className="font-mono">{bytes(r.bytes)}</span>,
      sortValue: (r) => r.bytes,
    },
    {
      id: 'newest',
      header: t('census-col-newest-row', { defaultValue: 'Newest row' }),
      render: (r) =>
        r.newestRow ? (
          <span className="font-mono">
            {day(r.newestRow)} <span className="text-site-text-muted">{r.newestRowColumn}</span>
          </span>
        ) : (
          <span className="text-site-text-muted">
            {r.newestRowColumn
              ? t('census-newest-empty', { defaultValue: 'no rows' })
              : t('census-newest-not-read', { defaultValue: 'not read' })}
          </span>
        ),
      sortValue: (r) => r.newestRow ?? '',
    },
    {
      id: 'autoanalyze',
      header: t('census-col-autoanalyze', { defaultValue: 'Autoanalyze' }),
      render: (r) => <span className="font-mono">{day(r.lastAutoanalyze)}</span>,
      sortValue: (r) => r.lastAutoanalyze ?? '',
    },
    {
      id: 'quiet',
      header: t('census-col-quiet', {
        defaultValue: '{{days}} days',
        days: census?.quietDays ?? CENSUS_QUIET_DAYS,
      }),
      render: (r) => (
        <span className={r.quiet.verdict === 'quiet' ? 'font-semibold' : undefined}>
          {verdictLabel(r.quiet.verdict)}
          {r.quiet.basis ? (
            <span className="font-normal text-site-text-muted"> · {basisLabel(r.quiet)}</span>
          ) : null}
        </span>
      ),
      sortValue: (r) => VERDICT_ORDER[r.quiet.verdict],
    },
  ];

  const productColumns: Column<ProductRow>[] = [
    {
      id: 'product',
      header: t('census-col-product', { defaultValue: 'Product' }),
      render: (r) => (
        <span>
          {r.title} <span className="font-mono text-site-text-muted">{r.id}</span>
        </span>
      ),
      sortValue: (r) => r.title.toLowerCase(),
    },
    {
      id: 'kind',
      header: t('census-col-kind', { defaultValue: 'Kind' }),
      render: (r) =>
        r.kind === 'game'
          ? t('census-kind-game', { defaultValue: 'Game' })
          : r.kind === 'app'
            ? t('census-kind-app', { defaultValue: 'App' })
            : t('census-kind-uncatalogued', { defaultValue: 'Not in the catalogue' }),
      sortValue: (r) => r.kind,
    },
    {
      id: 'actives',
      header: t('census-col-actives', {
        defaultValue: '{{days}}-day actives',
        days: census?.activeDays ?? CENSUS_ACTIVE_DAYS,
      }),
      align: 'right',
      render: (r) =>
        r.tracked ? (
          <span className="font-mono">{nf.format(r.actives)}</span>
        ) : (
          <span className="text-site-text-muted">
            {t('census-not-measured', { defaultValue: 'not measured' })}
          </span>
        ),
      sortValue: (r) => r.actives,
    },
    {
      id: 'playtime',
      header: t('census-col-playtime', { defaultValue: 'Playtime' }),
      align: 'right',
      render: (r) => <span className="font-mono">{nf.format(r.playtimeActives)}</span>,
      sortValue: (r) => r.playtimeActives,
    },
    {
      id: 'history',
      header: t('census-col-history', { defaultValue: 'History' }),
      align: 'right',
      render: (r) => <span className="font-mono">{nf.format(r.historyActives)}</span>,
      sortValue: (r) => r.historyActives,
    },
    {
      id: 'players',
      header: t('census-col-players', { defaultValue: 'Players, all time' }),
      align: 'right',
      render: (r) => <span className="font-mono">{nf.format(r.players)}</span>,
      sortValue: (r) => r.players,
    },
    {
      id: 'last-active',
      header: t('census-col-last-active', { defaultValue: 'Last active' }),
      render: (r) =>
        r.lastActiveAt ? (
          <span className="font-mono">{day(r.lastActiveAt)}</span>
        ) : (
          <span className="text-site-text-muted">
            {t('census-never', { defaultValue: 'never' })}
          </span>
        ),
      sortValue: (r) => r.lastActiveAt ?? '',
    },
    {
      id: 'quiet',
      header: t('census-col-quiet', {
        defaultValue: '{{days}} days',
        days: census?.quietDays ?? CENSUS_QUIET_DAYS,
      }),
      render: (r) => (
        <span className={r.quiet === 'quiet' ? 'font-semibold' : undefined}>
          {verdictLabel(r.quiet)}
        </span>
      ),
      sortValue: (r) => VERDICT_ORDER[r.quiet],
    },
  ];

  const tabs: TabItem[] = [
    {
      id: 'tables',
      label: t('census-tab-tables', { defaultValue: 'Tables' }),
      count: shownTables.length,
    },
    {
      id: 'products',
      label: t('census-tab-products', { defaultValue: 'Products' }),
      count: shownProducts.length,
    },
  ];

  const takeSnapshot = async () => {
    const month = censusMonth(new Date());
    if (
      data?.snapshots.some((s) => s.month === month) &&
      !(await confirm({
        title: t('census-replace-title', {
          defaultValue: 'Replace the {{month}} snapshot?',
          month,
        }),
        description: t('census-replace-body', {
          defaultValue:
            'One snapshot is kept per month. Taking one now overwrites the one stored for this month.',
        }),
      }))
    ) {
      return;
    }
    setSaving(true);
    try {
      const { snapshot } = await api(takeAdminCensusSnapshotApi, { body: {} });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'census'] });
      toast.success(
        t('census-snapshot-saved', {
          defaultValue: 'Snapshot for {{month}} saved.',
          month: snapshot.month,
        }),
      );
    } catch {
      toast.error(
        t('census-snapshot-failed', {
          defaultValue: 'The snapshot was not saved. Wait a few minutes and try again.',
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const sortLabel = (header: string) =>
    t('census-sort-by', { defaultValue: 'Sort by {{column}}', column: header });

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label={t('census-source', { defaultValue: 'Census to show' })}
          containerClassName="w-56"
        >
          <option value={LIVE}>
            {t('census-source-live', { defaultValue: 'Live, as of now' })}
          </option>
          {(data?.snapshots ?? []).map((s) => (
            <option key={s.month} value={s.month}>
              {t('census-source-month', { defaultValue: 'Snapshot {{month}}', month: s.month })}
            </option>
          ))}
        </Select>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('census-search', { defaultValue: 'Filter by name' })}
          aria-label={t('census-search', { defaultValue: 'Filter by name' })}
          className="w-56"
        />
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          aria-label={t('census-filter', { defaultValue: 'Rows to show' })}
          containerClassName="w-56"
        >
          <option value="all">{t('census-filter-all', { defaultValue: 'All' })}</option>
          <option value="quiet">
            {t('census-filter-quiet', {
              defaultValue: 'Quiet for {{days}} days',
              days: CENSUS_QUIET_DAYS,
            })}
          </option>
          <option value="unknown">
            {t('census-verdict-unknown', { defaultValue: 'Unknown' })}
          </option>
          <option value="active">{t('census-verdict-active', { defaultValue: 'Active' })}</option>
        </Select>
        <Button variant="primary" loading={saving} onClick={takeSnapshot} className="ms-auto">
          {t('census-take-snapshot', { defaultValue: 'Take snapshot now' })}
        </Button>
      </div>

      {isPending ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : isError || !census || !summary || !data ? (
        <EmptyState
          title={t('census-unavailable', { defaultValue: 'Could not load the census.' })}
          description={t('census-unavailable-hint', {
            defaultValue:
              'Reload the page. If it keeps failing, the database statistics could not be read.',
          })}
        />
      ) : (
        <>
          <div className="space-y-1 border-b border-site-border pb-4">
            <p className="pb-1 text-sm text-site-text">
              {t('census-no-last-write', {
                defaultValue:
                  'Postgres does not record when a table was last written. Every column here is an indirect sign of use; the notes under the list say what each one is.',
              })}
            </p>
            <p className="t-meta">
              {data.source === 'live'
                ? t('census-taken-live', {
                    defaultValue: 'Live. Taken {{at}} UTC.',
                    at: minute(census.takenAt),
                  })
                : data.source === 'cron'
                  ? t('census-taken-cron', {
                      defaultValue: 'Stored by the monthly job. Taken {{at}} UTC.',
                      at: minute(census.takenAt),
                    })
                  : t('census-taken-manual', {
                      defaultValue: 'Stored by an admin. Taken {{at}} UTC.',
                      at: minute(census.takenAt),
                    })}{' '}
              {census.statsReset
                ? t('census-counters-since', {
                    defaultValue: 'Counters since {{at}} UTC.',
                    at: minute(census.statsReset),
                  })
                : t('census-counters-never-reset', {
                    defaultValue: 'Counters were never reset, so their start is unknown.',
                  })}
            </p>
            <p className="t-meta">
              {baseline
                ? t('census-baseline', {
                    defaultValue: 'Write counters are compared with the snapshot taken {{at}} UTC.',
                    at: minute(baseline.takenAt),
                  })
                : t('census-no-baseline', {
                    defaultValue:
                      'No stored snapshot is {{days}} days old yet, so most tables without a timestamp column read "unknown".',
                    days: census.quietDays,
                  })}
            </p>
            <p className="t-meta">
              {t('census-summary-tables', {
                defaultValue:
                  '{{tables}} tables: {{empty}} empty, {{quiet}} quiet, {{unknown}} unknown.',
                tables: nf.format(summary.tables),
                empty: nf.format(summary.emptyTables),
                quiet: nf.format(summary.quietTables),
                unknown: nf.format(summary.unknownTables),
              })}{' '}
              {t('census-summary-products', {
                defaultValue: '{{products}} products: {{active}} with actives, {{quiet}} quiet.',
                products: nf.format(summary.products),
                active: nf.format(summary.activeProducts),
                quiet: nf.format(summary.quietProducts),
              })}
            </p>
          </div>

          <Tabs
            tabs={tabs}
            value={tab}
            onChange={setTab}
            aria-label={t('census-tabs', { defaultValue: 'Census sections' })}
          />

          {tab === 'tables' ? (
            <>
              <DataTable
                rows={shownTables}
                columns={tableColumns}
                rowKey={(r) => r.table}
                initialSort={{ id: 'rows', dir: 'desc' }}
                limit={tableRows.length}
                empty={t('census-no-tables', { defaultValue: 'No table matches.' })}
                sortLabel={sortLabel}
              />
              <section className="border-t border-site-border pt-4">
                <h2 className="t-heading text-site-text">
                  {t('census-notes-title', { defaultValue: 'What the columns mean' })}
                </h2>
                <ul className="mt-2 max-w-2xl space-y-2 text-sm text-site-text-muted">
                  <li>
                    {t('census-note-no-last-write', {
                      defaultValue:
                        'Postgres does not record when a table was last written. Nothing here is a last-write time; each column is one indirect sign.',
                    })}
                  </li>
                  <li>
                    {t('census-note-rows', {
                      defaultValue: "Rows is the planner's estimate of live rows, not a count.",
                    })}
                  </li>
                  <li>
                    {t('census-note-writes', {
                      defaultValue:
                        'Writes is rows inserted, updated and deleted since the counters started. A reset or a crash restarts them, so read it with the start time above.',
                    })}
                  </li>
                  <li>
                    {t('census-note-index-reads', {
                      defaultValue:
                        'Index reads is index scans since the counters started. Sequential scans are left out because a backup makes one per table. Reading a newest row through an index adds one index read each time the census runs.',
                    })}
                  </li>
                  <li>
                    {t('census-note-newest-row', {
                      defaultValue:
                        'Newest row is the largest updatedAt or createdAt, in UTC. It is read only where that is cheap: through an index on the column, or by scanning a table of at most {{kb}} kB. A larger table without such an index says "not read". It dates the last insert or Prisma update; a delete never shows.',
                      kb: nf.format(Math.round(CENSUS_SCAN_MAX_BYTES / 1024)),
                    })}
                  </li>
                  <li>
                    {t('census-note-autoanalyze', {
                      defaultValue:
                        'Autoanalyze is when autovacuum last analysed the table. It does that only after enough rows changed, so a recent date means recent writes; an old or empty one means little.',
                    })}
                  </li>
                  <li>
                    {t('census-note-verdict-snapshots', {
                      defaultValue:
                        'Active: the newest row or an autoanalyze is inside {{days}} days, or the counters started inside them and show writes. Then, once a stored snapshot is {{days}} days old, the write counter decides: moved since that snapshot is active, unmoved is quiet. Without one, quiet means the counters cover all {{days}} days and show no write, or the newest row is older. Unknown: none of these can be shown.',
                      days: census.quietDays,
                    })}
                  </li>
                </ul>
              </section>
            </>
          ) : (
            <>
              <DataTable
                rows={shownProducts}
                columns={productColumns}
                rowKey={(r) => r.id}
                initialSort={{ id: 'actives', dir: 'desc' }}
                limit={productRows.length}
                empty={t('census-no-products', { defaultValue: 'No product matches.' })}
                sortLabel={sortLabel}
              />
              <section className="border-t border-site-border pt-4">
                <h2 className="t-heading text-site-text">
                  {t('census-notes-title', { defaultValue: 'What the columns mean' })}
                </h2>
                <ul className="mt-2 max-w-2xl space-y-2 text-sm text-site-text-muted">
                  <li>
                    {t('census-note-actives', {
                      defaultValue:
                        'Actives are distinct signed-in users in the last {{days}} days. Signed-out visitors are not counted anywhere.',
                      days: census.activeDays,
                    })}
                  </li>
                  <li>
                    {t('census-note-playtime', {
                      defaultValue:
                        "Playtime counts users with a heartbeat on the product's pages, by UTC day. History counts users whose history holds a visit to it. The total counts each user once.",
                    })}
                  </li>
                  <li>
                    {t('census-note-not-measured', {
                      defaultValue:
                        'An off-site or unlisted product sends no heartbeat. Its zero means "not measured", and it is never marked quiet.',
                    })}
                  </li>
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
