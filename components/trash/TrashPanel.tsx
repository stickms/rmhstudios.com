'use client';

/**
 * The recycle bin (plan I1).
 *
 * Lists the caller's soft-deleted posts and comments with the days each has
 * left, restores them, and destroys them early on request. Every rule that
 * decides whether Restore is even offered is evaluated **server-side** in
 * `lib/trash/` — this component only renders the answer the API already gave
 * it, so a disabled button here is a decoration on top of a real refusal, not
 * the enforcement.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { TrashRow } from '@/components/trash/TrashRow';
import { refusalCopy } from '@/components/trash/copy';
import type { RestoreRefusal, TrashItem, TrashPage } from '@/lib/trash/types';

type Filter = 'all' | 'post' | 'comment';

interface RefusalError extends Error {
  reason?: RestoreRefusal;
}

async function readError(res: Response): Promise<RefusalError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: RestoreRefusal };
  const error: RefusalError = new Error(body.error ?? 'Request failed');
  error.reason = body.reason;
  return error;
}

export function TrashPanel() {
  const { t } = useTranslation('settings-content');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const reasons = refusalCopy(t);

  const query = useInfiniteQuery({
    queryKey: ['trash', filter],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<TrashPage> => {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('kind', filter);
      if (pageParam) params.set('cursor', pageParam);
      const res = await fetch(`/api/trash?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw await readError(res);
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const windowDays = query.data?.pages[0]?.windowDays ?? 30;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['trash'] });
  };

  const restore = useMutation({
    mutationFn: async (item: TrashItem) => {
      const res = await fetch('/api/trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kind: item.kind, id: item.id }),
      });
      if (!res.ok) throw await readError(res);
    },
    onSuccess: () => {
      toast.success(t('trash-restored-toast', { defaultValue: 'Restored' }));
      invalidate();
    },
    onError: (error: RefusalError) => {
      toast.error(
        error.reason
          ? reasons[error.reason]
          : t('trash-restore-failed', { defaultValue: 'Could not restore that.' }),
      );
      invalidate();
    },
    onSettled: () => setBusyId(null),
  });

  const purge = useMutation({
    mutationFn: async (item: TrashItem) => {
      const res = await fetch(`/api/trash/${item.kind}/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw await readError(res);
    },
    onSuccess: () => {
      toast.success(t('trash-purged-toast', { defaultValue: 'Deleted permanently' }));
      invalidate();
    },
    onError: (error: RefusalError) => {
      toast.error(
        error.reason
          ? reasons[error.reason]
          : t('trash-purge-failed', { defaultValue: 'Could not delete that.' }),
      );
      invalidate();
    },
    onSettled: () => setBusyId(null),
  });

  const handleRestore = (item: TrashItem) => {
    setBusyId(item.id);
    restore.mutate(item);
  };

  const handlePurge = async (item: TrashItem) => {
    const ok = await confirm({
      title: t('trash-purge-confirm-title', { defaultValue: 'Delete this forever?' }),
      description: t('trash-purge-confirm-body', {
        defaultValue:
          'This removes it from the database along with any attached images. It cannot be undone.',
      }),
      confirmLabel: t('trash-purge', { defaultValue: 'Delete forever' }),
      danger: true,
    });
    if (!ok) return;
    setBusyId(item.id);
    purge.mutate(item);
  };

  return (
    <section aria-labelledby="trash-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="trash-heading" className="font-display text-lg font-semibold text-site-text">
          {t('trash-heading', { defaultValue: 'Recently deleted' })}
        </h2>
        <p className="mt-1 text-sm text-site-text-muted">
          {t('trash-window-note', {
            count: windowDays,
            defaultValue:
              'Posts and comments you delete stay here for {{count}} days, then go for good.',
          })}
        </p>
      </div>

      <LiquidTabs
        aria-label={t('trash-filter-label', { defaultValue: 'Filter deleted content' })}
        value={filter}
        onChange={(id) => setFilter(id as Filter)}
        tabs={[
          { id: 'all', label: t('trash-filter-all', { defaultValue: 'All' }) },
          { id: 'post', label: t('trash-filter-posts', { defaultValue: 'Posts' }) },
          { id: 'comment', label: t('trash-filter-comments', { defaultValue: 'Comments' }) },
        ]}
      />

      {query.isPending ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={Trash2}
          title={t('trash-error-title', { defaultValue: 'Could not load the bin' })}
          description={t('trash-error-body', {
            defaultValue: 'Something went wrong on our side. Try again in a moment.',
          })}
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              {t('trash-retry', { defaultValue: 'Try again' })}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title={t('trash-empty-title', { defaultValue: 'Nothing deleted' })}
          description={t('trash-empty-body', {
            defaultValue: 'Posts and comments you delete will show up here so you can undo it.',
          })}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <TrashRow
                key={`${item.kind}:${item.id}`}
                item={item}
                busy={busyId === item.id}
                onRestore={handleRestore}
                onPurge={(row) => void handlePurge(row)}
              />
            ))}
          </ul>
          {query.hasNextPage ? (
            <Button
              variant="secondary"
              className="self-center"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t('trash-load-more', { defaultValue: 'Load more' })}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
