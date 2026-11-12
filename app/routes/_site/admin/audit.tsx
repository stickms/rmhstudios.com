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

import { api } from '@/lib/contract/client';
import { listAuditLogApi, type AuditLogEntry } from '@/lib/admin/admin-tools.contract';
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
      // `query` is the filters as a query string (also the CSV link), so the effect
      // re-runs exactly when a filter changes.
      api(listAuditLogApi, { query: Object.fromEntries(new URLSearchParams(query)) })
        .catch(() => ({ items: [] as AuditLogEntry[] }))
        .then((d) => setItems(d.items ?? []))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <PageLayout title={t('audit-log', { defaultValue: 'Audit Log' })} wide backTo="/admin">
      <AdminBody width="narrow">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
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
            className="min-w-0"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label={t('audit-filter-from', { defaultValue: 'From' })}
          />
          <Input
            type="date"
            className="min-w-0"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label={t('audit-filter-to', { defaultValue: 'To' })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="default" size="sm" className="gap-2">
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
          <ul className="divide-y divide-site-border border-t border-site-border">
            {items.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-3">
                <UserAvatar
                  src={e.admin.image}
                  alt={e.admin.name || t('audit-admin-fallback', { defaultValue: 'Admin' })}
                  size={28}
                  fallbackName={e.admin.name || 'A'}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="t-body min-w-0 truncate font-semibold text-site-text">
                      {e.admin.name || e.admin.handle}
                    </span>
                    <span className="t-meta shrink-0">
                      {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                    </span>
                  </p>
                  <p className="t-body text-site-text-muted mt-1 break-words">
                    <code className="text-site-text">{e.action}</code>
                    {e.targetType && <span> · {e.targetType}</span>}
                  </p>
                  {e.detail && (
                    <p className="t-body mt-1 break-words text-site-text-muted">{e.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminBody>
    </PageLayout>
  );
}
