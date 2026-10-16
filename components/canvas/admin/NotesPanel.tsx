'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { fetchJson } from '@/lib/http';

type Filter = 'shown' | 'pending' | 'hidden';
interface AdminNote {
  id: string;
  postId: string;
  body: string;
  helpfulCount: number;
  notCount: number;
  hidden: boolean;
  postExcerpt: string;
}

export default function NotesPanel() {
  const { t } = useTranslation('f-canvas');
  const [filter, setFilter] = useState<Filter>('shown');
  const q = useQuery({
    queryKey: ['context-notes', 'admin', filter],
    queryFn: () => fetchJson<{ notes: AdminNote[] }>(`/api/admin/context-notes?filter=${filter}`),
  });
  const setHidden = async (n: AdminNote, hidden: boolean) => {
    try {
      await fetchJson(`/api/admin/context-notes/${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden }),
      });
      await q.refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('admin-error', { defaultValue: 'Something went wrong' }),
      );
    }
  };
  return (
    <div className="space-y-4">
      <LiquidTabs
        aria-label={t('notes-filter', { defaultValue: 'Note filter' })}
        value={filter}
        onChange={(id) => setFilter(id as Filter)}
        tabs={[
          { id: 'shown', label: t('notes-shown', { defaultValue: 'Showing' }) },
          { id: 'pending', label: t('notes-pending', { defaultValue: 'Awaiting ratings' }) },
          { id: 'hidden', label: t('notes-hidden', { defaultValue: 'Hidden' }) },
        ]}
      />
      {q.data && q.data.notes.length === 0 ? (
        <EmptyState title={t('notes-empty', { defaultValue: 'No notes here' })} />
      ) : (
        <ul className="space-y-2">
          {q.data?.notes.map((n) => (
            <li key={n.id} className="glass-fill space-y-2 rounded-site p-3">
              <p className="text-sm text-site-text">{n.body}</p>
              <p className="line-clamp-2 text-xs text-site-text-muted">
                {t('notes-on-post', { defaultValue: 'On: {{post}}', post: n.postExcerpt })}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-site-text-muted">
                  {t('notes-counts', {
                    defaultValue: '{{up}} helpful, {{down}} not helpful',
                    up: n.helpfulCount,
                    down: n.notCount,
                  })}
                </span>
                <Button
                  size="sm"
                  variant={n.hidden ? 'secondary' : 'danger'}
                  onClick={() => void setHidden(n, !n.hidden)}
                >
                  {n.hidden
                    ? t('notes-restore', { defaultValue: 'Restore' })
                    : t('notes-hide', { defaultValue: 'Hide' })}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
