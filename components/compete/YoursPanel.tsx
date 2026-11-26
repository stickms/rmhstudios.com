/**
 * Compete > Tournaments > Yours: the signed-in member's tournaments, entered or hosted, with their place and prize,
 * 20 a page. A record, not a way to stake: it offers no entry or join action.
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { YoursList } from '@/components/compete/YoursList';
import { cn } from '@/lib/utils';
import { fetchMyTournamentsPage, myTournamentsKey } from '@/lib/tournaments/mine.queries';

export function YoursPanel() {
  const { t } = useTranslation('tournament-prizes');
  const list = useInfiniteQuery({
    queryKey: myTournamentsKey,
    queryFn: ({ pageParam }) => fetchMyTournamentsPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
  const rows = list.data?.pages.flatMap((p) => p.tournaments) ?? [];
  const arrival = useArrival(!list.isPending);
  const arriving = useArrivingKeys(rows.map((r) => r.id));

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-site" />
        ))}
      </div>
    );
  }
  if (list.isError) {
    return (
      <EmptyState
        className={arrival}
        icon={Trophy}
        title={t('yours-error', { defaultValue: 'Could not load your tournaments.' })}
        action={<Button onClick={() => void list.refetch()}>{t('yours-retry', { defaultValue: 'Try again' })}</Button>}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        className={arrival}
        icon={Trophy}
        title={t('yours-empty', { defaultValue: 'You have not entered or hosted a tournament yet.' })}
      />
    );
  }
  return (
    <div className={cn('flex flex-col', arrival)}>
      <YoursList rows={rows} isArriving={(id) => arriving(id)} />
      {list.hasNextPage ? (
        <div className="py-3">
          <Button variant="default" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            {t('yours-more', { defaultValue: 'Show more' })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
