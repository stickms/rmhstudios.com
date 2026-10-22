import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { useInsight } from './api';

interface RouteViews {
  trackingSince: string | null;
  routes: { route: string; views: number; known: boolean }[];
}

const DEAD_AT = 5;

export function DeadRoutesTab() {
  const { t } = useTranslation('f-ops');
  const { data, loading } = useInsight<RouteViews>('/api/admin/insights/routes');
  if (loading) return <Spinner />;
  if (!data) return null;
  const dead = data.routes.filter((r) => r.known && r.views <= DEAD_AT);
  const live = data.routes.filter((r) => !dead.includes(r));
  return (
    <section className="space-y-4">
      <p className="text-sm text-site-text-muted">
        {t('dead-intro', {
          defaultValue:
            'Hard page loads per top-level route over the last 90 days, from real-user monitoring. In-app navigations are not counted, so treat this as a floor.',
        })}{' '}
        {data.trackingSince
          ? t('dead-since', { defaultValue: 'Counting since {{date}}.', date: data.trackingSince })
          : t('dead-nodata', { defaultValue: 'No views recorded yet.' })}
      </p>
      <h2 className="font-display text-lg font-bold text-site-text">
        {t('dead-flagged', {
          defaultValue: 'Candidates for consolidation ({{count}})',
          count: dead.length,
        })}
      </h2>
      <RouteTable rows={dead} />
      <h2 className="font-display text-lg font-bold text-site-text">
        {t('dead-rest', { defaultValue: 'Everything else' })}
      </h2>
      <RouteTable rows={[...live].reverse()} />
    </section>
  );
}

function RouteTable({ rows }: { rows: { route: string; views: number }[] }) {
  const { t } = useTranslation('f-ops');
  if (rows.length === 0)
    return (
      <p className="text-sm text-site-text-dim">
        {t('dead-none', { defaultValue: 'Nothing here.' })}
      </p>
    );
  return (
    <ul className="glass-fill divide-y divide-site-border rounded-site">
      {rows.map((r) => (
        <li key={r.route} className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="font-mono text-site-text">{r.route}</span>
          <span className="text-site-text-muted">{r.views.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}
