import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import type { ChartSeries, DeployMarker, RangeId } from '@/lib/ops/series';
import { MetricChart } from './MetricChart';
import { api } from '@/lib/contract/client';
import { getAdminOncallSeriesApi } from '@/lib/admin/admin-ops.contract';

/** The metrics history behind every threshold alarm, one chart per metric. */
export function MetricsSection() {
  const { t } = useTranslation('f-oncall');
  const [range, setRange] = useState<RangeId>('24h');
  const [series, setSeries] = useState<ChartSeries[] | null>(null);
  const [deploys, setDeploys] = useState<DeployMarker[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api(getAdminOncallSeriesApi, { query: { range }, retries: 0 })
      .then((body) => {
        if (!cancelled) {
          setSeries(body.series);
          setDeploys(body.deploys ?? []);
          setFailed(false);
        }
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="site-section-label">
            {t('metrics-title', { defaultValue: 'Metrics' })}
          </h2>
          <p className="mt-1 text-sm text-site-text-muted">
            {t('metrics-body', {
              defaultValue:
                'Response times, page loads and LLM calls, with each alarm’s threshold as a dashed line.',
            })}
          </p>
        </div>
        <Tabs
          aria-label={t('metrics-range', { defaultValue: 'Time range' })}
          value={range}
          onChange={(id) => setRange(id as RangeId)}
          tabs={[
            { id: '1h', label: t('range-1h', { defaultValue: '1 hour' }) },
            { id: '24h', label: t('range-24h', { defaultValue: '24 hours' }) },
            { id: '7d', label: t('range-7d', { defaultValue: '7 days' }) },
          ]}
        />
      </div>
      {failed ? (
        <p className="mt-3 rounded-site p-5 text-sm text-site-text-muted">
          {t('metrics-failed', {
            defaultValue: 'Could not load the metrics. Refresh to try again.',
          })}
        </p>
      ) : !series ? (
        <div className="mt-3">
          <Spinner />
        </div>
      ) : (
        // Keep the previous charts on screen (dimmed) while a new range loads.
        <div className={`mt-3 grid gap-3 xl:grid-cols-2 ${loading ? 'opacity-60' : ''}`}>
          {series.map((s) => (
            <MetricChart key={s.key} series={s} deploys={deploys} withDate={range === '7d'} />
          ))}
        </div>
      )}
    </section>
  );
}
