import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { send, useInsight } from './api';

interface Group {
  id: string;
  message: string;
  topFrame: string;
  source: string;
  sampleUrl: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  firstRelease: string;
  lastRelease: string;
  resolved: boolean;
  regressed: boolean;
}

export function ErrorsTab() {
  const { t } = useTranslation('f-ops');
  const { data, loading, reload } = useInsight<{ groups: Group[] }>('/api/admin/insights/errors');

  const toggle = async (g: Group) => {
    const r = await send('/api/admin/insights/errors', 'PATCH', {
      id: g.id,
      resolved: !g.resolved,
    });
    if (!r.ok)
      return void toast.error(t('errors-update-failed', { defaultValue: 'Could not update.' }));
    await reload();
  };

  if (loading) return <Spinner />;
  const groups = data?.groups ?? [];
  if (groups.length === 0)
    return (
      <p className="glass-fill rounded-site p-6 text-center text-sm text-site-text-muted">
        {t('errors-empty', { defaultValue: 'No client errors recorded yet.' })}
      </p>
    );
  return (
    <ul className="space-y-3">
      {groups.map((g) => (
        <li key={g.id} className="glass-fill space-y-2 rounded-site p-4">
          <div className="flex flex-wrap items-center gap-2">
            {g.regressed && (
              <Badge variant="danger">{t('errors-regressed', { defaultValue: 'Regressed' })}</Badge>
            )}
            {g.resolved && (
              <Badge variant="success">{t('errors-resolved', { defaultValue: 'Resolved' })}</Badge>
            )}
            <span className="font-mono text-xs text-site-text-dim">
              {t('errors-count', { defaultValue: '{{count}} events', count: g.count })}
            </span>
          </div>
          <p className="break-words text-sm font-semibold text-site-text">{g.message}</p>
          {g.topFrame && (
            <p className="break-all font-mono text-xs text-site-text-muted">{g.topFrame}</p>
          )}
          <p className="text-xs text-site-text-dim">
            {t('errors-seen', {
              defaultValue:
                'First seen {{first}} in {{firstRelease}} - last seen {{last}} in {{lastRelease}}',
              first: new Date(g.firstSeenAt).toLocaleDateString(),
              firstRelease: g.firstRelease,
              last: new Date(g.lastSeenAt).toLocaleString(),
              lastRelease: g.lastRelease,
            })}
          </p>
          <Button size="xs" variant="outline" onClick={() => toggle(g)}>
            {g.resolved
              ? t('errors-reopen', { defaultValue: 'Reopen' })
              : t('errors-resolve', { defaultValue: 'Mark resolved' })}
          </Button>
        </li>
      ))}
    </ul>
  );
}
