'use client';

import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { fetchJson } from '@/lib/http';

export default function FortunesPanel() {
  const { t } = useTranslation('f-delight');
  const q = useQuery({
    queryKey: ['delight', 'admin', 'fortunes'],
    queryFn: () =>
      fetchJson<{ pending: { id: string; text: string }[] }>('/api/admin/delight/fortunes'),
  });
  const review = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await fetchJson(`/api/admin/delight/fortunes/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await q.refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('admin-error', { defaultValue: 'Something went wrong' }),
      );
    }
  };
  if (q.data && q.data.pending.length === 0) {
    return (
      <EmptyState title={t('fortunes-empty', { defaultValue: 'Nothing waiting for review' })} />
    );
  }
  return (
    <ul className="space-y-2">
      {q.data?.pending.map((f) => (
        <li key={f.id} className="glass-fill flex items-center gap-3 rounded-site px-4 py-3">
          <span className="min-w-0 flex-1 text-sm text-site-text">{f.text}</span>
          <IconButton
            icon={Check}
            variant="ghost"
            size="icon-sm"
            label={t('fortunes-approve', { defaultValue: 'Approve' })}
            onClick={() => void review(f.id, 'approved')}
          />
          <IconButton
            icon={X}
            variant="ghost"
            size="icon-sm"
            label={t('fortunes-reject', { defaultValue: 'Reject' })}
            onClick={() => void review(f.id, 'rejected')}
          />
        </li>
      ))}
    </ul>
  );
}
