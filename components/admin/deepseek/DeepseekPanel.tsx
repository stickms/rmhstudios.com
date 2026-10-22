import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Spinner } from '@/components/ui/spinner';
import { DataTable, type Column } from '@/components/admin/perf/DataTable';
import { Kpi } from '@/components/admin/perf/Kpi';
import type { HourlyPoint } from '@/lib/deepseek/balance';
import { useDeepseekBalance, useDeepseekHistory, type Snapshot } from './api';
import { BalanceChart } from './BalanceChart';
import { fmtDateTime, fmtDuration, fmtHour, fmtMoney, fmtSigned } from './format';

const WINDOWS = [
  { id: '24h', hours: 24 },
  { id: '7d', hours: 168 },
  { id: '30d', hours: 720 },
  { id: '90d', hours: 2160 },
] as const;
type WindowId = (typeof WINDOWS)[number]['id'];

export function DeepseekPanel() {
  const { t } = useTranslation('f-deepseek');
  const { state, loading, refreshing, updatedAt, refresh } = useDeepseekBalance();
  const [win, setWin] = useState<WindowId>('7d');
  const [nonce, setNonce] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const hours = WINDOWS.find((w) => w.id === win)!.hours;
  const history = useDeepseekHistory(hours, nonce);

  const errorText = (code: string): string => {
    if (code === 'timeout')
      return t('error-timeout', { defaultValue: 'DeepSeek did not answer within 10 seconds.' });
    if (code === 'invalid_response')
      return t('error-invalid', {
        defaultValue: 'DeepSeek returned a response we could not read.',
      });
    if (code === 'http_401')
      return t('error-unauthorized', {
        defaultValue: 'DeepSeek rejected the API key (HTTP 401). Check DEEPSEEK_API_KEY.',
      });
    if (code === 'network')
      return t('error-network', { defaultValue: 'Could not reach the server.' });
    return t('error-upstream', {
      defaultValue: 'DeepSeek returned an error ({{code}}).',
      code,
    });
  };

  const onRefresh = async () => {
    const err = await refresh();
    if (err) toast.error(errorText(err));
    else {
      toast.success(t('refreshed', { defaultValue: 'Balance refreshed and saved.' }));
      setNonce((n) => n + 1);
    }
  };

  const windowTabs = (
    <LiquidTabs
      aria-label={t('window-label', { defaultValue: 'History window' })}
      value={win}
      onChange={(id) => setWin(id as WindowId)}
      tabs={[
        { id: '24h', label: t('window-24h', { defaultValue: '24 hours' }) },
        { id: '7d', label: t('window-7d', { defaultValue: '7 days' }) },
        { id: '30d', label: t('window-30d', { defaultValue: '30 days' }) },
        { id: '90d', label: t('window-90d', { defaultValue: '90 days' }) },
      ]}
    />
  );

  if (loading && !state) return <Spinner />;

  if (state?.error === 'not_configured') {
    return (
      <div className="space-y-6">
        <section className="glass-pane rounded-site p-6">
          <h2 className="text-lg font-semibold text-site-text">
            {t('not-configured-title', { defaultValue: 'DeepSeek is not configured' })}
          </h2>
          <p className="mt-2 text-sm text-site-text-muted">
            {t('not-configured-body', {
              defaultValue:
                'Set the DEEPSEEK_API_KEY environment variable on the web and jobs services (optionally DEEPSEEK_BASE_URL) and redeploy. Balance is then sampled every hour.',
            })}
          </p>
        </section>
        {state.latest.length > 0 && (
          <p className="text-xs text-site-text-dim">
            {t('stale-history', {
              defaultValue: 'Showing history recorded before the key was removed.',
            })}
          </p>
        )}
      </div>
    );
  }

  const live = state?.live ?? null;
  const currencies = live
    ? live.balances.map((b) => b.currency)
    : (state?.latest ?? []).map((s) => s.currency);
  const allSeries = history.series ?? [];
  const seriesCurrencies = allSeries.map((s) => s.currency);
  const options = Array.from(new Set([...currencies, ...seriesCurrencies]));
  const currency = picked && options.includes(picked) ? picked : (options[0] ?? 'USD');
  const series = allSeries.find((s) => s.currency === currency);
  const summary = series?.summary;
  const cardsFor = live
    ? live.balances
    : (state?.latest ?? []).map((s: Snapshot) => ({
        currency: s.currency,
        totalBalance: s.totalBalance,
        grantedBalance: s.grantedBalance,
        toppedUpBalance: s.toppedUpBalance,
      }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {live ? (
          <Badge variant={live.isAvailable ? 'success' : 'danger'}>
            {live.isAvailable
              ? t('available', { defaultValue: 'API available' })
              : t('unavailable', { defaultValue: 'Insufficient balance' })}
          </Badge>
        ) : (
          <Badge variant="warning">
            {t('live-unknown', { defaultValue: 'Live status unknown' })}
          </Badge>
        )}
        <Button size="xs" variant="outline" onClick={() => void onRefresh()} disabled={refreshing}>
          <RefreshCw aria-hidden className={refreshing ? 'animate-spin' : undefined} />
          {t('refresh-now', { defaultValue: 'Refresh now' })}
        </Button>
        <span className="text-xs text-site-text-dim">
          {t('updated-at', {
            defaultValue: 'Updated {{time}}',
            time: fmtDateTime(live?.fetchedAt ?? updatedAt),
          })}
        </span>
      </div>

      {state?.error && (
        <p role="alert" className="glass-fill rounded-site p-4 text-sm text-site-danger">
          {errorText(state.error)}{' '}
          {state.latest.length > 0 &&
            t('showing-saved', { defaultValue: 'Showing the last saved balance.' })}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {cardsFor.map((b) => (
          <section key={b.currency} className="glass-pane rounded-site p-5">
            <h2 className="text-xs font-semibold text-site-text-muted">
              {t('balance-heading', { defaultValue: '{{currency}} balance', currency: b.currency })}
            </h2>
            <p className="mt-1 text-3xl font-bold tabular-nums text-site-text">
              {fmtMoney(b.totalBalance, b.currency)}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-site-text-muted">
                  {t('granted', { defaultValue: 'Granted' })}
                </dt>
                <dd className="tabular-nums text-site-text">
                  {fmtMoney(b.grantedBalance, b.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-site-text-muted">
                  {t('topped-up', { defaultValue: 'Topped up' })}
                </dt>
                <dd className="tabular-nums text-site-text">
                  {fmtMoney(b.toppedUpBalance, b.currency)}
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {windowTabs}
        {options.length > 1 && (
          <LiquidTabs
            aria-label={t('currency-label', { defaultValue: 'Currency' })}
            value={currency}
            onChange={setPicked}
            tabs={options.map((c) => ({ id: c, label: c }))}
          />
        )}
      </div>

      {history.loading && !history.series ? (
        <Spinner />
      ) : history.failed && !history.series ? (
        <p className="glass-fill rounded-site p-6 text-center text-sm text-site-text-muted">
          {t('history-failed', { defaultValue: 'Could not load balance history.' })}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              label={t('burn-hour', { defaultValue: 'Spend per hour' })}
              value={fmtMoney(summary?.perHour, currency, 4)}
              hint={t('burn-hint', {
                defaultValue: 'Top-ups excluded; over {{hours}} h of samples',
                hours: summary?.spanHours ?? 0,
              })}
            />
            <Kpi
              label={t('burn-day', { defaultValue: 'Spend per day' })}
              value={fmtMoney(summary?.perDay, currency)}
            />
            <Kpi
              label={t('remaining', { defaultValue: 'Projected time left' })}
              value={fmtDuration(summary?.hoursRemaining)}
              hint={t('remaining-hint', {
                defaultValue: 'At the average spend rate for this window',
              })}
            />
            <Kpi
              label={t('spent-window', { defaultValue: 'Spent in window' })}
              value={fmtMoney(summary?.spent, currency)}
              hint={
                summary && summary.toppedUp > 0
                  ? t('topped-up-window', {
                      defaultValue: 'Plus {{amount}} added',
                      amount: fmtMoney(summary.toppedUp, currency),
                    })
                  : undefined
              }
            />
          </div>

          <BalanceChart points={series?.points ?? []} currency={currency} />

          <HistoryTable points={series?.points ?? []} currency={currency} />
        </>
      )}
    </div>
  );
}

function HistoryTable({ points, currency }: { points: HourlyPoint[]; currency: string }) {
  const { t } = useTranslation('f-deepseek');
  const rows = useMemo(() => [...points].reverse(), [points]);
  const columns: Column<HourlyPoint>[] = [
    {
      id: 'hour',
      header: t('col-hour', { defaultValue: 'Hour' }),
      render: (r) => fmtHour(r.hour),
      sortValue: (r) => r.hour,
    },
    {
      id: 'total',
      header: t('col-balance', { defaultValue: 'Balance' }),
      render: (r) => fmtMoney(r.total, currency),
      sortValue: (r) => r.total,
      align: 'right',
    },
    {
      id: 'delta',
      header: t('col-delta', { defaultValue: 'Change' }),
      render: (r) => fmtSigned(r.delta, currency),
      sortValue: (r) => r.delta ?? 0,
      align: 'right',
      cellClass: (r) =>
        r.delta === null || r.delta === 0
          ? undefined
          : r.delta > 0
            ? 'text-site-success'
            : 'text-site-text',
    },
    {
      id: 'source',
      header: t('col-source', { defaultValue: 'Source' }),
      render: (r) =>
        r.source === 'manual'
          ? t('source-manual', { defaultValue: 'Manual' })
          : t('source-cron', { defaultValue: 'Hourly' }),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.hour}
      initialSort={{ id: 'hour', dir: 'desc' }}
      limit={2200}
      empty={t('history-empty', { defaultValue: 'No samples recorded in this window yet.' })}
      sortLabel={(h) => t('sort-by', { defaultValue: 'Sort by {{column}}', column: h })}
    />
  );
}
