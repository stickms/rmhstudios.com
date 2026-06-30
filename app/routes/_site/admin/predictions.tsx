/**
 * Admin — Prediction Markets moderation + resolution.
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2, Check, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';

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
    if (!confirm(t('resolve-confirm', { defaultValue: `Resolve this market to ${outcome}? This pays out winners and cannot be undone.`, outcome }))) {
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
    <PageLayout title={t('predictions-title', { defaultValue: 'Prediction Markets' })} wide>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-site-accent" />
          </div>
        ) : (
          <>
            {/* Pending approval */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-site-text">
                {t('pending-approval', { defaultValue: 'Pending approval' })} ({pending.length})
              </h2>
              {pending.length === 0 ? (
                <p className="text-sm text-site-text-dim">{t('none-pending', { defaultValue: 'Nothing waiting for review.' })}</p>
              ) : (
                pending.map((m) => (
                  <div key={m.id} className="rounded-site border border-site-border bg-site-surface p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-site-text">{m.title}</h3>
                      {m.description && <p className="text-sm text-site-text-dim mt-1">{m.description}</p>}
                      <p className="text-xs text-site-text-dim mt-2">
                        {m.creator ? `@${m.creator.handle ?? m.creator.name ?? 'user'}` : 'system'}
                        {m.closesAt ? ` · closes ${new Date(m.closesAt).toLocaleString()}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => moderate(m.id, 'approve')}
                        disabled={busy === m.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-site-sm text-sm font-medium bg-site-success/15 text-site-success border border-site-success/40 hover:bg-site-success/25 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" /> {t('approve', { defaultValue: 'Approve' })}
                      </button>
                      <button
                        onClick={() => moderate(m.id, 'deny')}
                        disabled={busy === m.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-site-sm text-sm font-medium bg-site-danger/15 text-site-danger border border-site-danger/40 hover:bg-site-danger/25 disabled:opacity-50"
                      >
                        <X className="w-4 h-4" /> {t('deny', { defaultValue: 'Deny' })}
                      </button>
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
                <p className="text-sm text-site-text-dim">{t('none-open', { defaultValue: 'No open markets.' })}</p>
              ) : (
                open.map((m) => (
                  <div key={m.id} className="rounded-site border border-site-border bg-site-surface p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-site-text flex items-center gap-2">
                        {m.title}
                        {m.isAiGenerated && <Sparkles className="w-3.5 h-3.5 text-site-accent" />}
                      </h3>
                      <p className="text-xs text-site-text-dim mt-1">
                        {m.yesPercent}% YES · {m.volume} vol
                        {m.closesAt ? ` · closes ${new Date(m.closesAt).toLocaleString()}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => resolve(m.id, 'YES')}
                        disabled={busy === m.id}
                        className="px-3 py-1.5 rounded-site-sm text-sm font-medium bg-site-success/15 text-site-success border border-site-success/40 hover:bg-site-success/25 disabled:opacity-50"
                      >
                        {t('resolve-yes', { defaultValue: 'Resolve YES' })}
                      </button>
                      <button
                        onClick={() => resolve(m.id, 'NO')}
                        disabled={busy === m.id}
                        className="px-3 py-1.5 rounded-site-sm text-sm font-medium bg-site-danger/15 text-site-danger border border-site-danger/40 hover:bg-site-danger/25 disabled:opacity-50"
                      >
                        {t('resolve-no', { defaultValue: 'Resolve NO' })}
                      </button>
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
