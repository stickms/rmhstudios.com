'use client';

/**
 * Monthly coin statement (C4) — the wallet's "Statement" tab. Lazy-loaded when
 * the tab opens. Read-only: it summarises the ledger and links the CSV download.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import {
  STATEMENT_CSV_MAX_ROWS,
  recentMonths,
  type StatementCategory,
  type StatementSummary,
} from '@/lib/economy/statement';
import { apiJson } from './api';

export default function StatementPanel() {
  const { t, i18n } = useTranslation('f-economy-plus');
  const months = useMemo(() => recentMonths(new Date(), 12), []);
  const [month, setMonth] = useState(months[0]!);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['economy-plus', 'statement', month],
    queryFn: () => apiJson<StatementSummary>(`/api/coins/statement?month=${month}`),
    staleTime: 60_000,
  });

  const fmtMonth = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const monthLabel = (m: string) => fmtMonth.format(new Date(`${m}-01T00:00:00Z`));

  const labels: Record<StatementCategory, { name: string; hint: string }> = {
    earned: {
      name: t('stmt-earned', { defaultValue: 'Earned' }),
      hint: t('stmt-earned-hint', { defaultValue: 'Rewards, quests, market sales, refunds' }),
    },
    spent: {
      name: t('stmt-spent', { defaultValue: 'Spent' }),
      hint: t('stmt-spent-hint', { defaultValue: 'Shop, memberships, fees' }),
    },
    gifted: {
      name: t('stmt-gifted', { defaultValue: 'Gifted' }),
      hint: t('stmt-gifted-hint', { defaultValue: 'Tips, gifts and pledges, given and received' }),
    },
    staked: {
      name: t('stmt-staked', { defaultValue: 'Staked' }),
      hint: t('stmt-staked-hint', { defaultValue: 'Stakes placed and payouts returned' }),
    },
  };

  const n = (v: number) => v.toLocaleString(i18n.language);

  return (
    <div className="space-y-3 px-3 pb-8">
      <div className="glass-pane flex flex-wrap items-end justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <label htmlFor="stmt-month" className="site-section-label block">
            {t('stmt-month', { defaultValue: 'Statement month' })}
          </label>
          <Select
            id="stmt-month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-52"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/coins/statement?month=${month}&format=csv`} download>
            <Download /> {t('stmt-download', { defaultValue: 'Download CSV' })}
          </a>
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <p className="px-1 text-sm text-site-danger">
          {t('stmt-error', { defaultValue: "Couldn't load that statement." })}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            <div className="glass-fill p-4">
              <dt className="text-xs text-site-text-muted">
                {t('stmt-opening', { defaultValue: 'Opening balance' })}
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-site-text">
                <CoinIcon className="size-4" /> {n(data.openingBalance)}
              </dd>
            </div>
            <div className="glass-fill p-4">
              <dt className="text-xs text-site-text-muted">
                {t('stmt-closing', { defaultValue: 'Closing balance' })}
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-site-text">
                <CoinIcon className="size-4" /> {n(data.closingBalance)}
              </dd>
            </div>
          </dl>

          <div className="glass-fill overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <caption className="sr-only">
                {t('stmt-table-caption', { defaultValue: 'Coin movement by category' })}
              </caption>
              <thead>
                <tr className="text-left text-xs text-site-text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('stmt-col-category', { defaultValue: 'Category' })}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('stmt-col-in', { defaultValue: 'In' })}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('stmt-col-out', { defaultValue: 'Out' })}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('stmt-col-count', { defaultValue: 'Entries' })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-site-border">
                {data.categories.map((c) => (
                  <tr key={c.category}>
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <span className="block font-semibold text-site-text">
                        {labels[c.category].name}
                      </span>
                      <span className="block text-xs text-site-text-muted">
                        {labels[c.category].hint}
                      </span>
                    </th>
                    <td className="px-4 py-3 text-right tabular-nums text-site-text">
                      {n(c.inTotal)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-site-text">
                      {n(c.outTotal)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-site-text-muted">
                      {n(c.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-site-border font-semibold">
                  <th scope="row" className="px-4 py-3 text-left text-site-text">
                    {t('stmt-total', { defaultValue: 'Net change' })}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums text-site-text">
                    {n(data.totalIn)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-site-text">
                    {n(data.totalOut)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-site-text">
                    {data.net > 0 ? '+' : ''}
                    {n(data.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {data.rowCount > STATEMENT_CSV_MAX_ROWS ? (
            <p className="px-1 text-xs text-site-text-muted">
              {t('stmt-truncated', {
                defaultValue:
                  'This month has more than {{max}} entries; the CSV contains the first {{max}}.',
                max: n(STATEMENT_CSV_MAX_ROWS),
              })}
            </p>
          ) : null}
          <p className="px-1 text-xs text-site-text-muted">
            {t('stmt-note', {
              defaultValue:
                'Months run from the 1st at 00:00 UTC. The opening balance is the closing balance less the month’s net change.',
            })}
          </p>
        </>
      )}
    </div>
  );
}
