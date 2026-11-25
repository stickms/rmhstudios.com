/**
 * The boards page: "Recently made" and "Most played" (25 at a time, cursor paged) and "Yours" for a signed-in member.
 * Rows on rules, one primary action (Make a board).
 */
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { useSession } from '@/components/Providers';
import { api } from '@/lib/contract/client';
import { listLightsOutBoardsApi } from '@/lib/lights-out/boards.contract';
import { isAllowedShape, shapeName, type BoardSummary, type BoardTab } from '@/lib/lights-out/boards';

function Row({ board, arriving }: { board: BoardSummary; arriving: boolean }) {
  const { t } = useTranslation('lights-out-maker');
  const shape = isAllowedShape(board.shape);
  return (
    <li className={`border-b border-site-border${arriving ? ' arrive' : ''}`}>
      <Link to="/lights-out/b/$id" params={{ id: board.id }} className="flex flex-col gap-1 py-3">
        <span className="t-body font-medium" dir="auto">
          {board.title}
        </span>
        <span className="t-meta">
          {t('row-by', { defaultValue: 'by' })} <bdi dir="auto">{board.author.name || board.author.handle}</bdi>
          {' · '}
          {shape ? shapeName(shape) : ''}
          {' · '}
          {t('row-best', { defaultValue: 'best possible {{count}}', count: board.optimalMoves })}
          {' · '}
          {t('row-plays', {
            defaultValue_one: '{{count}} play',
            defaultValue: '{{count}} plays',
            count: board.plays,
          })}
        </span>
      </Link>
    </li>
  );
}

export function BoardsList() {
  const { t } = useTranslation('lights-out-maker');
  const session = useSession();
  const [tab, setTab] = useState<BoardTab>('recent');
  const query = useInfiniteQuery({
    queryKey: [listLightsOutBoardsApi.path, tab],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      api(listLightsOutBoardsApi, { query: pageParam ? { tab, cursor: pageParam } : { tab }, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const boards = query.data?.pages.flatMap((p) => p.items) ?? [];
  const arrival = useArrival(!query.isPending);
  const isArriving = useArrivingKeys(boards.map((b) => b.id));

  const tabs = [
    { id: 'recent', label: t('tab-recent', { defaultValue: 'Recently made' }) },
    { id: 'played', label: t('tab-played', { defaultValue: 'Most played' }) },
    ...(session.data ? [{ id: 'mine', label: t('tab-mine', { defaultValue: 'Yours' }) }] : []),
  ];

  return (
    <PageLayout
      title={t('boards-title', { defaultValue: 'Lights Out boards' })}
      description={t('boards-description', {
        defaultValue: 'Boards members made. Solve them in the fewest moves.',
      })}
      headerRight={
        <Button asChild variant="primary">
          <Link to="/lights-out/new">{t('make-board', { defaultValue: 'Make a board' })}</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-6">
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(id) => setTab(id as BoardTab)}
          aria-label={t('tabs-label', { defaultValue: 'Which boards' })}
        />
        {query.isPending ? (
          <div
            role="status"
            aria-label={t('boards-loading', { defaultValue: 'Loading boards' })}
            className="flex flex-col gap-3"
          >
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : query.isError ? (
          <p role="alert" className="t-body text-site-text-muted">
            {t('boards-error', { defaultValue: 'Could not load the boards.' })}
          </p>
        ) : boards.length === 0 ? (
          <EmptyState
            title={
              tab === 'mine'
                ? t('empty-mine-title', { defaultValue: 'You have not made a board yet' })
                : t('empty-title', { defaultValue: 'No boards yet' })
            }
            description={t('empty-description', { defaultValue: 'Make the first one and send it to a friend.' })}
          />
        ) : (
          <div className={arrival}>
            <ul>
              {boards.map((b) => (
                <Row key={b.id} board={b} arriving={isArriving(b.id)} />
              ))}
            </ul>
            {query.hasNextPage ? (
              <div className="pt-4">
                <Button type="button" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                  {t('show-more', { defaultValue: 'Show more' })}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
