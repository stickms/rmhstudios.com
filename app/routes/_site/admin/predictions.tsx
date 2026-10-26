/**
 * Admin — Prediction Markets moderation + resolution.
 */

import { AdminBody } from '@/components/admin/AdminBody';
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
      .catch(() => toast.error(t('predictions-load-failed', { defaultValue: 'Failed to load predictions.' })))
      .finally(() => setLoading(false));
  }, [t]);

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
        toast.error(data.error || t('action-failed', { defaultValue: 'Action failed.' }));
        return;
      }
      toast.success(
        action === 'approve'
          ? t('approved', { defaultValue: 'Approved' })
          : t('denied', { defaultValue: 'Denied' }),
      );
      load();
    } finally {
      setBusy(null);
    }
  }

  async function resolve(id: string, outcome: 'YES' | 'NO') {
    if (!(await confirm({ title: t('resolve-confirm', { defaultValue: 'Resolve this market to {{outcome}}? This pays out winners and cannot be undone.', outcome }), danger: true }))) {
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
        toast.error(data.error || t('action-failed', { defaultValue: 'Action failed.' }));
        return;
      }
      toast.success(t('resolved-paid', { defaultValue: 'Resolved {{outcome}} — paid {{payouts}} coins', outcome, payouts: data.payouts }));
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageLayout
      title={t('predictions-title', { defaultValue: 'Prediction Markets' })}
      wide
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
    >
      <AdminBody>
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : (
          <>
            {/* Pending approval */}
            <section className="space-y-3">
              <h2 className="site-section-label">
                {t('pending-approval', { defaultValue: 'Pending approval' })} ({pending.length})
              </h2>
              {pending.length === 0 ? (
                <EmptyState title={t('none-pending', { defaultValue: 'Nothing waiting for review.' })} />
              ) : (
                pending.map((m) => (
                  <div key={m.id} className="glass-fill flex flex-col gap-3 rounded-site p-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-site-text">{m.title}</h3>
                      {m.description && <p className="mt-1 text-sm text-site-text-muted">{m.description}</p>}
                      <p className="mt-2 text-xs text-site-text-dim">
                        {m.creator ? `@${m.creator.handle ?? m.creator.name ?? t('user-fallback', { defaultValue: 'user' })}` : t('system', { defaultValue: 'system' })}
                        {m.closesAt ? ` · ${t('closes-at', { defaultValue: 'closes {{time}}', time: new Date(m.closesAt).toLocaleString() })}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:shrink-0">
                      <Button size="sm" variant="secondary" loading={busy === m.id} onClick={() => moderate(m.id, 'approve')}>
                        <Check aria-hidden /> {t('approve', { defaultValue: 'Approve' })}
                      </Button>
                      <Button size="sm" variant="danger" loading={busy === m.id} onClick={() => moderate(m.id, 'deny')}>
                        <X aria-hidden /> {t('deny', { defaultValue: 'Deny' })}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Open markets — resolve */}
            <section className="space-y-3">
              <h2 className="site-section-label">
                {t('open-markets', { defaultValue: 'Open markets' })} ({open.length})
              </h2>
              {open.length === 0 ? (
                <EmptyState title={t('none-open', { defaultValue: 'No open markets.' })} />
              ) : (
                open.map((m) => (
                  <div key={m.id} className="glass-fill flex flex-col gap-3 rounded-site p-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 text-base font-semibold text-site-text">
                        {m.title}
                        {m.isAiGenerated && <Sparkles className="size-4 shrink-0 text-site-accent" aria-label={t('ai-generated', { defaultValue: 'AI generated' })} role="img" />}
                      </h3>
                      <p className="mt-1 text-xs text-site-text-dim">
                        {t('market-stats', { defaultValue: '{{percent}}% YES · {{volume}} vol', percent: m.yesPercent, volume: m.volume })}
                        {m.closesAt ? ` · ${t('closes-at', { defaultValue: 'closes {{time}}', time: new Date(m.closesAt).toLocaleString() })}` : ''}
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
      </AdminBody>
    </PageLayout>
  );
}
