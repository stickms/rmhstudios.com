/**
 * Admin — Prediction Markets moderation + resolution.
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createFileRoute } from '@tanstack/react-router';
import { Check, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';

interface AdminMarket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  isAiGenerated: boolean;
  yesPercent: number;
  volume: number;
  closesAt: string | null;
  creator: { id: string; name: string | null; handle: string | null } | null;
}

export const Route = createFileRoute('/_site/admin/predictions')({
  head: () => ({ meta: [{ title: 'Prediction Markets | Admin' }] }),
  component: AdminPredictionsPage,
});

function AdminPredictionsPage() {
  const { t } = useTranslation('admin');
  const confirm = useConfirm();
  const [pending, setPending] = useState<AdminMarket[]>([]);
  const [open, setOpen] = useState<AdminMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/predictions')
      .then((r) => r.json())
      .then((data) => {
        setPending(data.pending ?? []);
        setOpen(data.open ?? []);
      })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function moderate(id: string, action: 'approve' | 'deny') {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/predictions/${id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed');
        return;
      }
      toast.success(action === 'approve' ? 'Approved' : 'Denied');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function resolve(id: string, outcome: 'YES' | 'NO') {
    if (!(await confirm({ title: t('resolve-confirm', { defaultValue: `Resolve this market to ${outcome}? This pays out winners and cannot be undone.`, outcome }), danger: true }))) {
      return;
    }
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/predictions/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed');
        return;
      }
      toast.success(t('resolved-paid', { defaultValue: `Resolved ${outcome} — paid ${data.payouts} coins`, outcome, payouts: data.payouts }));
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageLayout title={t('predictions-title', { defaultValue: 'Prediction Markets' })} wide backTo="/admin">
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : (
          <>
            {/* Pending approval */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-site-text">
                {t('pending-approval', { defaultValue: 'Pending approval' })} ({pending.length})
              </h2>
              {pending.length === 0 ? (
                <EmptyState title={t('none-pending', { defaultValue: 'Nothing waiting for review.' })} />
              ) : (
                pending.map((m) => (
                  <div key={m.id} className="glass-fill rounded-site p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-site-text">{m.title}</h3>
                      {m.description && <p className="text-sm text-site-text-dim mt-1">{m.description}</p>}
                      <p className="text-xs text-site-text-dim mt-2">
                        {m.creator ? `@${m.creator.handle ?? m.creator.name ?? 'user'}` : 'system'}
                        {m.closesAt ? ` · closes ${new Date(m.closesAt).toLocaleString()}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:shrink-0">
                      <Button size="sm" variant="secondary" loading={busy === m.id} onClick={() => moderate(m.id, 'approve')}>
                        <Check className="w-4 h-4" /> {t('approve', { defaultValue: 'Approve' })}
                      </Button>
                      <Button size="sm" variant="danger" loading={busy === m.id} onClick={() => moderate(m.id, 'deny')}>
                        <X className="w-4 h-4" /> {t('deny', { defaultValue: 'Deny' })}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Open markets — resolve */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-site-text">
                {t('open-markets', { defaultValue: 'Open markets' })} ({open.length})
              </h2>
              {open.length === 0 ? (
                <EmptyState title={t('none-open', { defaultValue: 'No open markets.' })} />
              ) : (
                open.map((m) => (
                  <div key={m.id} className="glass-fill rounded-site p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-site-text flex items-center gap-2">
                        {m.title}
                        {m.isAiGenerated && <Sparkles className="w-3.5 h-3.5 text-site-accent shrink-0" />}
                      </h3>
                      <p className="text-xs text-site-text-dim mt-1">
                        {m.yesPercent}% YES · {m.volume} vol
                        {m.closesAt ? ` · closes ${new Date(m.closesAt).toLocaleString()}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:shrink-0">
                      <Button size="sm" variant="secondary" loading={busy === m.id} onClick={() => resolve(m.id, 'YES')}>
                        {t('resolve-yes', { defaultValue: 'Resolve YES' })}
                      </Button>
                      <Button size="sm" variant="danger" loading={busy === m.id} onClick={() => resolve(m.id, 'NO')}>
                        {t('resolve-no', { defaultValue: 'Resolve NO' })}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </PageLayout>
  );
}
