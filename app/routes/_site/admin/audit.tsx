import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AdminBody } from '@/components/admin/AdminBody';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_site/admin/audit')({
  head: () => ({ meta: [{ title: 'Audit Log | RMH Studios' }] }),
  component: AuditLogPage,
});

interface Entry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
  admin: { name: string | null; image: string | null; handle: string | null };
}

function AuditLogPage() {
  const { t } = useTranslation('admin');
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // The same query string drives the list and the CSV download, so what you
  // export is exactly what you are looking at.
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (action.trim()) p.set('action', action.trim());
    if (targetType.trim()) p.set('targetType', targetType.trim());
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p.toString();
  }, [action, targetType, from, to]);
  const filtered = query !== '';

  useEffect(() => {
    // Wait a beat after typing so we do not fire a request per keystroke.
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/audit-log${query ? `?${query}` : ''}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setItems(d.items ?? []))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <PageLayout title={t('audit-log', { defaultValue: 'Audit Log' })} wide backTo="/admin">
      <AdminBody width="narrow">
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder={t('audit-filter-action', { defaultValue: 'Action starts with…' })}
            aria-label={t('audit-filter-action', { defaultValue: 'Action starts with…' })}
          />
          <Input
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            placeholder={t('audit-filter-target', { defaultValue: 'Target type' })}
            aria-label={t('audit-filter-target', { defaultValue: 'Target type' })}
          />
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label={t('audit-filter-from', { defaultValue: 'From' })}
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label={t('audit-filter-to', { defaultValue: 'To' })}
          />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href={`/api/admin/audit-log?format=csv${query ? `&${query}` : ''}`} download>
              <Download className="h-4 w-4" aria-hidden />
              {t('audit-export-csv', { defaultValue: 'Export CSV' })}
            </a>
          </Button>
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAction('');
                setTargetType('');
                setFrom('');
                setTo('');
              }}
            >
              {t('audit-clear-filters', { defaultValue: 'Clear filters' })}
            </Button>
          ) : null}
        </div>
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            description={
              filtered
                ? t('audit-no-match', { defaultValue: 'No actions match these filters.' })
                : t('no-admin-actions', { defaultValue: 'No admin actions logged yet.' })
            }
          />
        ) : (
          <ul className="glass-fill divide-y divide-site-border rounded-site overflow-hidden">
            {items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <UserAvatar
                  src={e.admin.image}
                  alt={e.admin.name || t('audit-admin-fallback', { defaultValue: 'Admin' })}
                  size={28}
                  fallbackName={e.admin.name || 'A'}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-site-text">
                    <span className="font-semibold">{e.admin.name || e.admin.handle}</span>{' '}
                    <code className="glass-inset rounded-site-sm px-2 py-0.5 font-mono text-xs text-site-accent">
                      {e.action}
                    </code>
                    {e.targetType && (
                      <span className="text-site-text-muted"> · {e.targetType}</span>
                    )}
                  </p>
                  {e.detail && <p className="truncate text-xs text-site-text-muted">{e.detail}</p>}
                </div>
                <span className="shrink-0 text-xs text-site-text-dim">
                  {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminBody>
    </PageLayout>
  );
}
