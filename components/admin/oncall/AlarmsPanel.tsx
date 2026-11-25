import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { SearchField } from '@/components/ui/search-field';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/lib/toast';
import { AlarmCard } from './AlarmCard';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { Kpi } from '@/components/admin/perf/Kpi';
import { AlarmRules } from './AlarmRules';
import { MetricsSection } from './MetricsSection';
import {
  filterAlarms,
  heartbeatHealth,
  phaseOf,
  type AlarmAction,
  type AlarmFilter,
  type AlarmView,
  type OncallApiResponse,
} from '@/lib/oncall/dashboard';
import type { RemediationId } from '@/lib/oncall/remediations';
import { cn, formatRelativeTime } from '@/lib/utils';
import { api } from '@/lib/contract/client';
import { actOnAdminOncallAlarmApi, getAdminOncallApi, remediateAdminOncallApi } from '@/lib/admin/admin-ops.contract';

const POLL_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function useOncall() {
  const [data, setData] = useState<OncallApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await api(getAdminOncallApi, {
          retries: 0,
        }),
      );
    } catch {
      setData({
        ok: false,
        error: 'unreachable',
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);
  return {
    data,
    loading,
    reload: load,
  };
}

export function AlarmsPanel({ focusKey }: { focusKey?: string }) {
  const { t } = useTranslation('f-oncall');
  const { data, loading, reload } = useOncall();
  const [filter, setFilter] = useState<AlarmFilter | null>(null);
  const [query, setQuery] = useState('');
  const arrival = useArrival(data !== null);

  if (!data) return <Spinner />;

  if (!data.ok) {
    return (
      <section className={cn('min-w-0', arrival)}>
        <h2 className="t-heading text-site-text">
          {data.error === 'not_configured'
            ? t('not-configured-title', {
                defaultValue: 'On-call watchdog not configured',
              })
            : t('unreachable-title', {
                defaultValue: 'Watchdog unreachable',
              })}
        </h2>
        <p className="mt-2 t-body text-site-text-muted">
          {data.error === 'not_configured'
            ? t('not-configured-body', {
                defaultValue:
                  'Set ONCALL_URL and ONCALL_SIGNING_SECRET in .env.production and restart web. Paging itself does not depend on this page.',
              })
            : t('unreachable-body', {
                defaultValue:
                  'The watchdog did not answer. Paging runs on the watchdog itself, so alerts still reach #rmh-oncall — check there.',
              })}
        </p>
        <Button className="mt-4" variant="default" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className="size-4" aria-hidden />
          {t('retry', {
            defaultValue: 'Retry',
          })}
        </Button>
      </section>
    );
  }

  const open = data.alarms.filter((a) => a.state === 'firing');
  const resolved = data.alarms.filter((a) => a.state === 'resolved');
  const resolved24h = resolved.filter((a) => data.now - (a.resolvedAt ?? 0) < DAY_MS);
  const paging = open.filter((a) => phaseOf(a) === 'paging').length;
  // A link from Discord to a resolved alarm must show it: default to All when the target is not open.
  const focused = focusKey ? data.alarms.find((a) => a.key === focusKey) : undefined;
  const activeFilter: AlarmFilter = filter ?? (focused && focused.state === 'resolved' ? 'all' : 'open');
  const shown = filterAlarms(data.alarms, activeFilter, query);

  const report = async (call: Promise<{ ok: true; message: string } | { ok: false; error: string }>) => {
    try {
      const res = await call;
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
      void reload();
      return res.ok;
    } catch {
      toast.error(
        t('action-failed', { defaultValue: 'That did not go through. Try again, or use the buttons in Discord.' }),
      );
      return false;
    }
  };
  const onAct = (alarm: AlarmView, action: AlarmAction) =>
    report(api(actOnAdminOncallAlarmApi, { body: { key: alarm.key, action } }));
  const onRemediate = (alarm: AlarmView, action: RemediationId) =>
    report(api(remediateAdminOncallApi, { body: { key: alarm.key, action } }));

  return (
    <div className={cn('space-y-[var(--site-section-gap)]', arrival)}>
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 t-body text-site-text-muted">
          {t('refreshed', {
            defaultValue: 'Updated {{when}} · refreshes every 30s',
            when: formatRelativeTime(data.now),
          })}
        </p>
        <Button variant="default" size="sm" onClick={() => void reload()} disabled={loading} className="shrink-0">
          <RefreshCw className="size-4" aria-hidden />
          {t('refresh', { defaultValue: 'Refresh' })}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label={t('kpi-paging', {
            defaultValue: 'Paging (unacked)',
          })}
          value={String(paging)}
          tone={paging ? 'danger' : 'ok'}
        />
        <Kpi
          label={t('kpi-open', {
            defaultValue: 'Open alarms',
          })}
          value={String(open.length)}
          tone={open.length ? 'warn' : 'ok'}
        />
        <Kpi
          label={t('kpi-resolved', {
            defaultValue: 'Resolved (24h)',
          })}
          value={String(resolved24h.length)}
        />
        <Kpi
          label={t('kpi-heartbeats', {
            defaultValue: 'Check-ins late',
          })}
          value={String(data.heartbeats.filter((h) => heartbeatHealth(h, data.now) === 'late').length)}
          tone={data.heartbeats.some((h) => heartbeatHealth(h, data.now) === 'late') ? 'danger' : 'ok'}
        />
      </div>

      <section aria-labelledby="alarms-heading">
        <h2 id="alarms-heading" className="t-heading text-site-text">
          {t('alarms-title', { defaultValue: 'Alarms' })}
        </h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            aria-label={t('alarms-filter', { defaultValue: 'Which alarms to show' })}
            value={activeFilter}
            onChange={(id) => setFilter(id as AlarmFilter)}
            tabs={[
              { id: 'open', label: t('filter-open', { defaultValue: 'Open' }), count: open.length },
              { id: 'resolved', label: t('filter-resolved', { defaultValue: 'Resolved' }), count: resolved.length },
              { id: 'all', label: t('filter-all', { defaultValue: 'All' }) },
            ]}
          />
          <SearchField
            value={query}
            onValueChange={setQuery}
            placeholder={t('alarms-search', { defaultValue: 'Search alarms' })}
            aria-label={t('alarms-search', { defaultValue: 'Search alarms' })}
            containerClassName="sm:w-64"
          />
        </div>
        {shown.length ? (
          <ul className="mt-3 divide-y divide-site-border border-y border-site-border">
            {shown.map((a) => (
              <AlarmCard
                key={a.key}
                alarm={a}
                now={data.now}
                remediations={data.remediations}
                focused={a.key === focusKey}
                onAct={onAct}
                onRemediate={onRemediate}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-3 t-body text-site-text-muted">
            {query.trim()
              ? t('alarms-none-match', { defaultValue: 'No alarms match that search.' })
              : activeFilter === 'resolved'
                ? t('alarms-none-resolved', { defaultValue: 'Nothing resolved in the last 14 days.' })
                : activeFilter === 'open'
                  ? t('open-empty', { defaultValue: 'Nothing firing.' })
                  : t('alarms-none', { defaultValue: 'No alarms in the last 14 days.' })}
          </p>
        )}
      </section>

      <section className="min-w-0">
        <h2 className="t-heading text-site-text">
          {t('heartbeats-title', {
            defaultValue: 'Check-ins',
          })}
        </h2>
        <p className="mt-1 t-body text-site-text-muted">
          {t('heartbeats-body', {
            defaultValue: 'Senders on the VPS check in with the watchdog; silence past the limit pages.',
          })}
        </p>
        {/* Two columns at most: this sits in the centre column between the sidebar and
            the right rail, where four cards left no room for the status badge. */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.heartbeats.map((h) => {
            const health = heartbeatHealth(h, data.now);
            return (
              <li key={h.name} className="min-w-0 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="min-w-0 break-words font-mono t-body text-site-text">{h.name}</span>
                  <Badge
                    className="shrink-0"
                    variant={health === 'ok' ? 'success' : health === 'late' ? 'danger' : 'default'}
                  >
                    {health === 'ok'
                      ? t('hb-ok', {
                          defaultValue: 'OK',
                        })
                      : health === 'late'
                        ? t('hb-late', {
                            defaultValue: 'Late',
                          })
                        : t('hb-waiting', {
                            defaultValue: 'Not reporting yet',
                          })}
                  </Badge>
                </div>
                <p className="mt-1 t-body text-site-text-muted">
                  {h.lastSeen === null
                    ? t('hb-never', {
                        defaultValue: 'No check-in yet — not watched until the first one.',
                      })
                    : t('hb-last', {
                        defaultValue: 'Last {{when}} · pages after {{limit}} min of silence',
                        when: formatRelativeTime(h.lastSeen),
                        limit: Math.round(h.maxAgeMs / 60_000),
                      })}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <MetricsSection />

      <AlarmRules />
    </div>
  );
}
