import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useTranslation } from 'react-i18next';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) throw redirect({ to: '/' });
  return null;
});

export const Route = createFileRoute('/_site/admin/audit')({
  head: () => ({ meta: [{ title: 'Audit Log | RMH Studios' }] }),
  beforeLoad: () => getAdminSession(),
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
  const { t } = useTranslation("admin");
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/audit-log', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageLayout title={t("audit-log", { defaultValue: "Audit Log" })} wide backTo="/admin">
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState description={t("no-admin-actions", { defaultValue: "No admin actions logged yet." })} />
        ) : (
          <ul className="glass-fill divide-y divide-site-border rounded-site overflow-hidden">
            {items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <UserAvatar src={e.admin.image} alt={e.admin.name || 'Admin'} size={28} fallbackName={e.admin.name || 'A'} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-site-text">
                    <span className="font-semibold">{e.admin.name || e.admin.handle}</span>{' '}
                    <code className="glass-inset rounded-site-sm px-1.5 py-0.5 font-mono text-xs text-site-accent">{e.action}</code>
                    {e.targetType && <span className="text-site-text-muted"> · {e.targetType}</span>}
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
      </div>
    </PageLayout>
  );
}
