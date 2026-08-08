/**
 * O8 — the Slice It! content dashboard, for operators.
 *
 * Storage totals, quota headroom, upload rate, chart-version distribution,
 * broken-chart detection (`O2`) and orphaned storage objects are all computable
 * from data that already exists and were surfaced nowhere. The first signal
 * that the 10 GB cap was close was uploads failing.
 *
 * A `_site/` surface, so it is on the SITE token contract (`--site-*`, glass
 * elevation classes) rather than the game's `--slice-*` neumorphism — the same
 * reasoning as `/admin/slice-it`: this is chrome for the admin area that
 * happens to be about a game.
 *
 * Lives here rather than in the route file because `routeTree.gen.ts` imports
 * every route module statically, so a route file's top-level imports land in
 * the entry chunk EVERY page downloads (OPT-01). The route lazy-loads this.
 *
 * The orphan scan is **behind a button**, not part of the initial load. It
 * lists a whole storage prefix, and a page that does that on every open is a
 * page nobody should leave a tab on.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Database, HardDrive, Trash2, TrendingUp } from 'lucide-react';

import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { formatCount } from '@/lib/utils';

interface Dashboard {
  storage: { usedBytes: number; limitBytes: number; headroom: number; unmeasured: number };
  topUploaders: { uploaderId: string; songs: number; bytes: number }[];
  staleCharts: number;
  uploadRate: { day: string; count: number }[];
  totals: { songs: number; charts: number; runs: number };
}

interface BrokenChart {
  chartId: string;
  songId: string;
  title: string;
  reasons: string[];
  dip: number;
  clearRate: number;
  sampleSize: number;
  spikes: number;
}

function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

export function ContentDashboard() {
  const { t } = useTranslation('r-slice-it');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [broken, setBroken] = useState<BrokenChart[] | null>(null);
  const [orphans, setOrphans] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [dash, bad] = await Promise.all([
          fetch('/api/slice-it/admin/content?view=dashboard').then((r) => r.json()),
          fetch('/api/slice-it/admin/content?view=broken').then((r) => r.json()),
        ]);
        if (cancelled) return;
        setDashboard(dash as Dashboard);
        setBroken((bad as { charts: BrokenChart[] }).charts ?? []);
      } catch {
        if (!cancelled) {
          toast.error(t('admin-content-failed', { defaultValue: 'Could not read the library.' }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const scanOrphans = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/slice-it/admin/content?view=orphans');
      const data = (await res.json()) as { keys: string[] };
      setOrphans(data.keys ?? []);
    } catch {
      toast.error(t('admin-content-scan-failed', { defaultValue: 'The scan did not finish.' }));
    } finally {
      setScanning(false);
    }
  }, [t]);

  return (
    <PageLayout
      title={t('admin-content-title', { defaultValue: 'Slice It — content & storage' })}
      description={t('admin-content-lede', {
        defaultValue:
          'Quota headroom, upload rate, charts that look broken, and storage objects nothing points at.',
      })}
      backTo="/admin"
      backLabel={t('back', { defaultValue: 'Back' })}
      wide
    >
      <div className="space-y-6 p-4 md:p-6">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-site-text-muted">
            <Spinner size={32} />
            <span>{t('admin-content-loading', { defaultValue: 'Measuring…' })}</span>
          </div>
        ) : !dashboard ? (
          <EmptyState
            icon={Database}
            title={t('admin-content-failed', { defaultValue: 'Could not read the library.' })}
          />
        ) : (
          <>
            <Card pane className="p-5 space-y-3">
              <h2 className="flex items-center gap-2 font-semibold text-site-text">
                <HardDrive className="size-4" aria-hidden />
                {t('admin-content-storage', { defaultValue: 'Storage' })}
              </h2>
              <p className="text-site-text-secondary">
                {gib(dashboard.storage.usedBytes)} / {gib(dashboard.storage.limitBytes)} —{' '}
                {(dashboard.storage.headroom * 100).toFixed(1)}%{' '}
                {t('admin-content-headroom', { defaultValue: 'free' })}
              </p>
              {/* The honest caveat: rows predating `fileSizeBytes` contribute
                  real bytes to the cap and zero to the total above, so "used"
                  is a floor. Hiding that would make the headroom read as more
                  precise than it is. */}
              {dashboard.storage.unmeasured > 0 && (
                <p className="text-sm text-site-text-muted">
                  {t('admin-content-unmeasured', {
                    defaultValue:
                      '{{count}} songs have no recorded size, so the total above is a floor.',
                    count: dashboard.storage.unmeasured,
                  })}
                </p>
              )}
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat
                  label={t('admin-content-songs', { defaultValue: 'Songs' })}
                  value={formatCount(dashboard.totals.songs)}
                />
                <Stat
                  label={t('admin-content-charts', { defaultValue: 'Charts' })}
                  value={formatCount(dashboard.totals.charts)}
                />
                <Stat
                  label={t('admin-content-runs', { defaultValue: 'Runs' })}
                  value={formatCount(dashboard.totals.runs)}
                />
                <Stat
                  label={t('admin-content-stale', { defaultValue: 'Below current generator' })}
                  value={formatCount(dashboard.staleCharts)}
                />
              </dl>
            </Card>

            <Card className="p-5 space-y-3">
              <h2 className="flex items-center gap-2 font-semibold text-site-text">
                <TrendingUp className="size-4" aria-hidden />
                {t('admin-content-uploads', { defaultValue: 'Uploads per day' })}
              </h2>
              {dashboard.uploadRate.length === 0 ? (
                <p className="text-site-text-muted">
                  {t('admin-content-no-uploads', { defaultValue: 'Nothing in this window.' })}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2 text-xs">
                  {dashboard.uploadRate.map((day) => (
                    <li key={day.day} className="glass-inset rounded-site px-2 py-1 tabular-nums">
                      <span className="text-site-text-muted">{day.day.slice(5)}</span>{' '}
                      <span className="text-site-text font-medium">{day.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5 space-y-3">
              <h2 className="flex items-center gap-2 font-semibold text-site-text">
                <AlertTriangle className="size-4" aria-hidden />
                {t('admin-content-broken', { defaultValue: 'Charts that look broken' })}
              </h2>
              {!broken || broken.length === 0 ? (
                <p className="text-site-text-muted">
                  {t('admin-content-no-broken', {
                    defaultValue: 'Nothing flagged in the recently updated charts.',
                  })}
                </p>
              ) : (
                <ul className="space-y-2">
                  {broken.map((chart) => (
                    <li
                      key={chart.chartId}
                      className="glass-fill rounded-site p-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"
                    >
                      <span className="font-medium text-site-text">{chart.title}</span>
                      <span className="text-sm text-site-text-secondary">
                        {chart.reasons.join(', ')}
                      </span>
                      <span className="text-xs text-site-text-muted tabular-nums ml-auto">
                        {t('admin-content-evidence', {
                          defaultValue:
                            'clear {{clear}}% · dip {{dip}} · {{spikes}} spikes · n={{n}}',
                          clear: (chart.clearRate * 100).toFixed(1),
                          dip: chart.dip.toFixed(3),
                          spikes: chart.spikes,
                          n: chart.sampleSize,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5 space-y-3">
              <h2 className="flex items-center gap-2 font-semibold text-site-text">
                <Trash2 className="size-4" aria-hidden />
                {t('admin-content-orphans', { defaultValue: 'Orphaned storage objects' })}
              </h2>
              <p className="text-sm text-site-text-secondary">
                {t('admin-content-orphans-note', {
                  defaultValue:
                    'Listed, never deleted. A listing can race an upload in flight, so this is a candidate list for a person to look at.',
                })}
              </p>
              <Button onClick={() => void scanOrphans()} disabled={scanning}>
                {scanning
                  ? t('admin-content-scanning', { defaultValue: 'Scanning…' })
                  : t('admin-content-scan', { defaultValue: 'Scan storage' })}
              </Button>
              {orphans !== null && (
                <p className="text-sm text-site-text-secondary">
                  {t('admin-content-orphan-count', {
                    defaultValue: '{{count}} objects with no song pointing at them.',
                    count: orphans.length,
                  })}
                </p>
              )}
            </Card>
          </>
        )}
      </div>
    </PageLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-inset rounded-site px-3 py-2">
      <dt className="text-xs text-site-text-muted">{label}</dt>
      <dd className="text-site-text font-medium tabular-nums">{value}</dd>
    </div>
  );
}
