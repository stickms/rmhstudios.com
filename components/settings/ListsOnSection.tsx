import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { formatDateShort } from '@/lib/core/format';
import { api } from '@/lib/contract/client';
import { leaveListApi, listsOnApi } from '@/lib/lists/lists-on.contract';
import type { ListOnRow, ListsOnPage } from '@/lib/lists/lists-on';
import { toast } from '@/lib/toast';

const QUERY_KEY = ['lists', 'on'] as const;

/**
 * Settings > Lists: the public and unlisted lists other members have put the member on, newest first, each with
 * "Leave". Leaving takes the member off the list and keeps them off: the owner cannot add them back and is not told.
 * A private list never shows here, even to someone on it.
 */
export function ListsOnSection() {
  const { t } = useTranslation('lists-on');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const refusalText = useRefusalText();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const query = useInfiniteQuery({
    queryKey: QUERY_KEY,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api(listsOnApi, { query: { cursor: pageParam } }),
    getNextPageParam: (last: ListsOnPage) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.lists) ?? [];
  const arrival = useArrival(!query.isPending);

  const leave = async (row: ListOnRow) => {
    const ok = await confirm({
      title: t('confirm-title', { name: row.name, defaultValue: 'Leave {{name}}?' }),
      description: t('confirm-description', {
        defaultValue: 'You come off the list and stay off it: the owner cannot add you again, and is not told.',
      }),
      confirmLabel: t('confirm-action', { defaultValue: 'Leave this list' }),
      danger: true,
    });
    if (!ok) return;
    setBusy((b) => new Set(b).add(row.id));
    try {
      await api(leaveListApi, { params: { id: row.id } });
      queryClient.setQueryData<InfiniteData<ListsOnPage, string | undefined>>(
        QUERY_KEY,
        (old) =>
          old && { ...old, pages: old.pages.map((p) => ({ ...p, lists: p.lists.filter((l) => l.id !== row.id) })) },
      );
      toast.success(t('left', { defaultValue: 'You left the list' }));
    } catch (e) {
      toast.error(refusalText.maybe(e) || t('leave-failed', { defaultValue: 'Could not leave this list' }));
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(row.id);
        return next;
      });
    }
  };

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  } else if (query.isError && rows.length === 0) {
    body = (
      <div className={arrival}>
        <p role="alert" className="t-body py-3 text-site-danger">
          {t('load-failed', { defaultValue: 'Could not load your lists.' })}
        </p>
        <Button onClick={() => void query.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        className={arrival}
        title={t('empty-title', { defaultValue: 'You are not on any public lists' })}
        description={t('empty', {
          defaultValue: 'Lists that other members make public or share by link, and that include you, appear here.',
        })}
      />
    );
  } else {
    body = (
      <div className={arrival}>
        <ListsOnRows rows={rows} busy={busy} onLeave={(row) => void leave(row)} />
        {query.isFetchNextPageError && (
          <p role="alert" className="t-meta py-2 text-site-danger">
            {t('load-more-failed', { defaultValue: "Couldn't load more." })}
          </p>
        )}
        {query.hasNextPage && (
          <div className="py-4">
            <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              {t('load-more', { defaultValue: 'Load more' })}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <SettingsSection
      description={t('description', {
        defaultValue:
          'Public and unlisted lists that include you. Leave one and the owner cannot add you again. Private lists are never shown.',
      })}
    >
      {body}
    </SettingsSection>
  );
}

/** The rows: list name, owner and when added, with one text action each that names the list. */
export function ListsOnRows({
  rows,
  busy,
  onLeave,
}: {
  rows: readonly ListOnRow[];
  busy: ReadonlySet<string>;
  onLeave: (row: ListOnRow) => void;
}) {
  const { t, i18n } = useTranslation('lists-on');
  return (
    <ul>
      {rows.map((row) => {
        const owner = row.owner.name || row.owner.handle || t('someone', { defaultValue: 'a member' });
        return (
          <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-site-border py-3">
            <div className="min-w-0 flex-1 basis-48">
              <Link
                to="/lists/$id"
                params={{ id: row.id }}
                className="t-body block truncate font-semibold text-site-text"
              >
                <span dir="auto">{row.name}</span>
              </Link>
              <span className="t-meta block truncate">
                {t('by', { defaultValue: 'By' })} <bdi>{owner}</bdi>
              </span>
            </div>
            <span className="t-meta shrink-0">
              {t('added', { date: formatDateShort(row.addedAt, i18n.language), defaultValue: 'Added {{date}}' })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy.has(row.id)}
              aria-label={t('leave-named', { name: row.name, defaultValue: 'Leave {{name}}' })}
              onClick={() => onLeave(row)}
            >
              {t('leave', { defaultValue: 'Leave this list' })}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
