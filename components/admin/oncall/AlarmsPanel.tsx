import { useCallback, useEffect, useState } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Kpi } from '@/components/admin/perf/Kpi';
import {
  heartbeatHealth,
  phaseOf,
  runbookHref,
  sortAlarms,
  type AlarmPhase,
  type AlarmView,
  type OncallApiResponse,
} from '@/lib/oncall/dashboard';
import { formatRelativeTime } from '@/lib/utils';

const POLL_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function useOncall() {
  const [data, setData] = useState<OncallApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/oncall', { credentials: 'include', cache: 'no-store' });
      setData(
        res.ok ? ((await res.json()) as OncallApiResponse) : { ok: false, error: 'unreachable' },
      );
    } catch {
      setData({ ok: false, error: 'unreachable' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);
  return { data, loading, reload: load };
}

const PHASE_VARIANT: Record<AlarmPhase, 'danger' | 'warning' | 'success' | 'default'> = {
  paging: 'danger',
  acked: 'default',
  firing: 'warning',
  resolved: 'success',
};

function AlarmCard({ alarm }: { alarm: AlarmView }) {
  const { t } = useTranslation('f-oncall');
  const phase = phaseOf(alarm);
  const href = runbookHref(alarm);
  const phaseLabel: Record<AlarmPhase, string> = {
    paging: t('phase-paging', { defaultValue: 'Paging — not acknowledged' }),
    acked: t('phase-acked', { defaultValue: 'Acknowledged' }),
    firing: t('phase-firing', { defaultValue: 'Firing' }),
    resolved: t('phase-resolved', { defaultValue: 'Resolved' }),
  };
  return (
    <li className="glass-fill rounded-site p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={alarm.sev <= 2 ? 'danger' : 'warning'} icon={false}>
          {t('sev', { defaultValue: 'SEV{{sev}}', sev: alarm.sev })}
        </Badge>
        <Badge variant={PHASE_VARIANT[phase]}>{phaseLabel[phase]}</Badge>
        <span className="font-mono text-xs text-site-text-dim">{alarm.key}</span>
      </div>
      <h3 className="mt-2 font-semibold text-site-text">{alarm.title}</h3>
      {alarm.detail && (
        <p className="mt-1 whitespace-pre-line break-words text-sm text-site-text-muted">
          {alarm.detail}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-site-text-muted sm:grid-cols-4">
        <div>
          <dt className="text-site-text-dim">{t('since', { defaultValue: 'Since' })}</dt>
          <dd>{formatRelativeTime(alarm.firedAt)}</dd>
        </div>
        <div>
          <dt className="text-site-text-dim">{t('source', { defaultValue: 'Source' })}</dt>
          <dd>{alarm.source}</dd>
        </div>
        <div>
          <dt className="text-site-text-dim">{t('pages', { defaultValue: 'Pages sent' })}</dt>
          <dd className="tabular-nums">{alarm.pageCount}</dd>
        </div>
        <div>
          <dt className="text-site-text-dim">
            {alarm.state === 'resolved'
              ? t('resolved-at', { defaultValue: 'Resolved' })
              : t('acked-by', { defaultValue: 'Acknowledged by' })}
          </dt>
          <dd>
            {alarm.state === 'resolved'
              ? formatRelativeTime(alarm.resolvedAt ?? alarm.updatedAt)
              : alarm.acked
                ? t('acked-detail', {
                    defaultValue: 'Discord user {{id}}, {{when}}',
                    id: alarm.acked.by,
                    when: formatRelativeTime(alarm.acked.at),
                  })
                : '—'}
          </dd>
        </div>
      </dl>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm text-site-accent hover:underline"
        >
          <BookOpen className="size-4" aria-hidden />
          {t('runbook', { defaultValue: 'Runbook' })}
        </a>
      )}
    </li>
  );
}

export function AlarmsPanel() {
  const { t } = useTranslation('f-oncall');
  const { data, loading, reload } = useOncall();

  if (!data) return <Spinner />;

  if (!data.ok) {
    return (
      <section className="glass-pane rounded-site p-6">
        <h2 className="text-lg font-semibold text-site-text">
          {data.error === 'not_configured'
            ? t('not-configured-title', { defaultValue: 'On-call watchdog not configured' })
            : t('unreachable-title', { defaultValue: 'Watchdog unreachable' })}
        </h2>
        <p className="mt-2 text-sm text-site-text-muted">
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
        <Button className="mt-4" variant="outline" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className="size-4" aria-hidden />
          {t('retry', { defaultValue: 'Retry' })}
        </Button>
      </section>
    );
  }

  const alarms = sortAlarms(data.alarms);
  const open = alarms.filter((a) => a.state === 'firing');
  const resolved = alarms.filter(
    (a) => a.state === 'resolved' && data.now - (a.resolvedAt ?? 0) < DAY_MS,
  );
  const paging = open.filter((a) => phaseOf(a) === 'paging').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-site-text-muted">
          {t('refreshed', {
            defaultValue: 'Updated {{when}} · refreshes every 30s',
            when: formatRelativeTime(data.now),
          })}
        </p>
        <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className="size-4" aria-hidden />
          {t('refresh', { defaultValue: 'Refresh' })}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label={t('kpi-paging', { defaultValue: 'Paging (unacked)' })}
          value={String(paging)}
          tone={paging ? 'danger' : 'ok'}
        />
        <Kpi
          label={t('kpi-open', { defaultValue: 'Open alarms' })}
          value={String(open.length)}
          tone={open.length ? 'warn' : 'ok'}
        />
        <Kpi
          label={t('kpi-resolved', { defaultValue: 'Resolved (24h)' })}
          value={String(resolved.length)}
        />
        <Kpi
          label={t('kpi-heartbeats', { defaultValue: 'Check-ins late' })}
          value={String(
            data.heartbeats.filter((h) => heartbeatHealth(h, data.now) === 'late').length,
          )}
          tone={
            data.heartbeats.some((h) => heartbeatHealth(h, data.now) === 'late') ? 'danger' : 'ok'
          }
        />
      </div>

      <section className="glass-pane rounded-site p-5">
        <h2 className="text-lg font-semibold text-site-text">
          {t('heartbeats-title', { defaultValue: 'Check-ins' })}
        </h2>
        <p className="mt-1 text-sm text-site-text-muted">
          {t('heartbeats-body', {
            defaultValue:
              'Senders on the VPS check in with the watchdog; silence past the limit pages.',
          })}
        </p>
        {/* Two columns at most: this sits in the centre column between the sidebar and
            the right rail, where four cards left no room for the status badge. */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.heartbeats.map((h) => {
            const health = heartbeatHealth(h, data.now);
            return (
              <li key={h.name} className="glass-fill min-w-0 rounded-site p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="min-w-0 break-words font-mono text-sm text-site-text">
                    {h.name}
                  </span>
                  <Badge
                    className="shrink-0"
                    variant={health === 'ok' ? 'success' : health === 'late' ? 'danger' : 'default'}
                  >
                    {health === 'ok'
                      ? t('hb-ok', { defaultValue: 'OK' })
                      : health === 'late'
                        ? t('hb-late', { defaultValue: 'Late' })
                        : t('hb-waiting', { defaultValue: 'Not reporting yet' })}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-site-text-muted">
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

      <section>
        <h2 className="mb-3 text-lg font-semibold text-site-text">
          {t('open-title', { defaultValue: 'Open alarms' })}
        </h2>
        {open.length ? (
          <ul className="space-y-3">
            {open.map((a) => (
              <AlarmCard key={a.key} alarm={a} />
            ))}
          </ul>
        ) : (
          <p className="glass-fill rounded-site p-4 text-sm text-site-text-muted">
            {t('open-empty', { defaultValue: 'Nothing firing.' })}
          </p>
        )}
      </section>

      {resolved.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-site-text">
            {t('resolved-title', { defaultValue: 'Resolved in the last 24 hours' })}
          </h2>
          <ul className="space-y-3">
            {resolved.map((a) => (
              <AlarmCard key={a.key} alarm={a} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
