import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, Inbox, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin/library-quota')({
  head: () => ({ meta: [{ title: 'Library Upload Appeals | RMH Studios' }] }),
  beforeLoad: () => getAdminSession(),
  component: AdminLibraryQuotaPage,
});

type QuotaRequest = {
  id: string;
  requestedTotal: number;
  reason: string;
  createdAt: string;
  user: { id: string; handle: string | null; name: string | null; used: number; currentQuota: number };
};

function AdminLibraryQuotaPage() {
  const { t } = useTranslation('admin');
  const [requests, setRequests] = useState<QuotaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/library/quota-requests').catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => null);
      if (data?.requests) setRequests(data.requests as QuotaRequest[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (req: QuotaRequest, approve: boolean) => {
      let grantedTotal = req.requestedTotal;
      if (approve) {
        const input = window.prompt(
          t('quota-grant-prompt', { defaultValue: 'New total upload cap to grant:' }),
          String(req.requestedTotal),
        );
        if (input === null) return;
        const n = Number(input);
        if (!Number.isFinite(n) || n < 1) {
          toast.error(t('quota-grant-invalid', { defaultValue: 'Enter a valid number.' }));
          return;
        }
        grantedTotal = Math.floor(n);
      }
      setBusy(req.id);
      const res = await fetch('/api/admin/library/quota-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: req.id, approve, grantedTotal }),
      }).catch(() => null);
      setBusy(null);
      if (res?.ok) {
        toast.success(
          approve
            ? t('quota-approved', { total: grantedTotal, defaultValue: `Approved — cap set to ${grantedTotal}.` })
            : t('quota-denied', { defaultValue: 'Request denied.' }),
        );
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
      } else {
        const err = await res?.json().catch(() => null);
        toast.error(err?.error ?? t('quota-decide-failed', { defaultValue: 'Could not update the request.' }));
      }
    },
    [t],
  );

  return (
    <PageLayout
      title={t('library-quota-title', { defaultValue: 'Library Upload Appeals' })}
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
      wide
    >
      <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t('quota-none', { defaultValue: 'No pending upload appeals.' })}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((req) => {
              const who = req.user.handle ? `@${req.user.handle}` : req.user.name ?? req.user.id;
              return (
                <li key={req.id} className="glass-fill rounded-site p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-site-text">{who}</p>
                      <p className="text-sm text-site-text-muted mt-0.5">
                        {t('quota-summary', {
                          used: req.user.used,
                          current: req.user.currentQuota,
                          requested: req.requestedTotal,
                          defaultValue: `Using {{used}} of {{current}} — requesting a cap of {{requested}}`,
                        })}
                      </p>
                      {req.reason && <p className="text-sm text-site-text mt-2 whitespace-pre-wrap">{req.reason}</p>}
                      <p className="text-xs text-site-text-muted mt-2">
                        {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" disabled={busy === req.id} onClick={() => decide(req, false)}>
                        <X size={15} /> {t('deny', { defaultValue: 'Deny' })}
                      </Button>
                      <Button size="sm" loading={busy === req.id} onClick={() => decide(req, true)}>
                        <Check size={15} /> {t('approve', { defaultValue: 'Approve' })}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}
