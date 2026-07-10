import { createFileRoute, redirect, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <PageLayout title={t('library-quota-title', { defaultValue: 'Library Upload Appeals' })} wide>
      <div className="mb-4">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-site-text-muted hover:text-site-text">
          <ArrowLeft size={15} /> {t('back-to-admin', { defaultValue: 'Back to admin' })}
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-site-text-muted">
          <Loader2 className="animate-spin" size={18} /> {t('loading', { defaultValue: 'Loading…' })}
        </div>
      ) : requests.length === 0 ? (
        <p className="text-site-text-muted">{t('quota-none', { defaultValue: 'No pending upload appeals.' })}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((req) => {
            const who = req.user.handle ? `@${req.user.handle}` : req.user.name ?? req.user.id;
            return (
              <li key={req.id} className="rounded-site-sm border border-site-border bg-site-card p-4">
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
                    <Button size="sm" disabled={busy === req.id} onClick={() => decide(req, true)}>
                      {busy === req.id ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}{' '}
                      {t('approve', { defaultValue: 'Approve' })}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageLayout>
  );
}
