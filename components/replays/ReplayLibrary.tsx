/**
 * /settings/replays: the member's own saved replays, newest first, twenty at a time, with a game filter. Each row
 * links to the viewer and carries the owner's controls (`ReplayOwnerActions`).
 */
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { myReplaysApi } from '@/lib/game/replay-library.contract';
import { replayGameTitle, type LibraryReplay, type MyReplaysPage } from '@/lib/game/replay-library';
import { formatDurationMs } from '@/lib/core/format';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ReplayOwnerActions, useReplayName } from '@/components/replays/ReplayOwnerActions';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival, useArrivingKeys, ARRIVE } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

const ALL_GAMES = '';

function ReplayRow({
  replay,
  arriving,
  onChanged,
  onDeleted,
}: {
  replay: LibraryReplay;
  arriving: boolean;
  onChanged: (row: LibraryReplay) => void;
  onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation('replay-library');
  const replayName = useReplayName();
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(replay.createdAt));
  const score = replay.score == null ? null : new Intl.NumberFormat(i18n.language).format(replay.score);
  return (
    <li
      className={cn(
        'flex flex-col gap-3 border-b border-site-border py-3 sm:flex-row sm:items-center sm:justify-between',
        arriving && ARRIVE,
      )}
    >
      <div className="min-w-0">
        <Link
          to="/replays/$id"
          params={{ id: replay.id }}
          className="t-body font-medium underline-offset-2 hover:underline"
          aria-label={t('view-aria', { defaultValue: 'Watch replay of {{name}}', name: replayName(replay) })}
        >
          {replayGameTitle(replay.game)}
        </Link>
        <p className="t-meta mt-1">
          {score == null
            ? t('unscored', { defaultValue: 'Unscored' })
            : t('score', { defaultValue: 'Score {{score}}', score })}
          {' · '}
          {formatDurationMs(replay.durationMs)}
          {' · '}
          {when}
          {replay.visibility === 'unlisted' ? ` · ${t('unlisted', { defaultValue: 'Unlisted' })}` : ''}
          {replay.kind === 'ghost' ? ` · ${t('marker-ghost', { defaultValue: 'Ghost' })}` : ''}
          {replay.kind === 'speedrun' ? ` · ${t('marker-speedrun', { defaultValue: 'Speedrun proof' })}` : ''}
        </p>
      </div>
      <ReplayOwnerActions replay={replay} onVisibilityChanged={onChanged} onDeleted={onDeleted} />
    </li>
  );
}

export function ReplayLibrary() {
  const { t } = useTranslation('replay-library');
  const queryClient = useQueryClient();
  const [game, setGame] = useState(ALL_GAMES);
  const queryKey = ['replays-mine', game] as const;
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(myReplaysApi, {
        query: { ...(game ? { game } : {}), ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  // The filter lists every game the member has replays for, as of the first page.
  const games = pages[0]?.games ?? [];
  const arrival = useArrival(!query.isPending);
  const isArriving = useArrivingKeys(items.map((r) => r.id));

  function replaceRow(row: LibraryReplay) {
    queryClient.setQueryData<InfiniteData<MyReplaysPage, string | undefined>>(queryKey, (old) =>
      old
        ? { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((r) => (r.id === row.id ? row : r)) })) }
        : old,
    );
  }

  // A deleted row can leave the filter's game with no replays, or shift every later page: read the list again.
  const reload = () => queryClient.invalidateQueries({ queryKey: ['replays-mine'] });

  return (
    <SettingsSection
      title={t('title', { defaultValue: 'Your replays' })}
      description={t('description', {
        defaultValue: 'Public replays appear on their game’s page. An unlisted replay opens only for you.',
      })}
      action={
        games.length > 1 || game ? (
          <Select
            value={game}
            onChange={(e) => setGame(e.target.value)}
            aria-label={t('filter-aria', { defaultValue: 'Show replays of' })}
            controlSize="sm"
            containerClassName="w-44 shrink-0"
          >
            <option value={ALL_GAMES}>{t('filter-all', { defaultValue: 'All games' })}</option>
            {games.map((g) => (
              <option key={g} value={g}>
                {replayGameTitle(g)}
              </option>
            ))}
          </Select>
        ) : undefined
      }
    >
      {query.isPending ? (
        <div role="status" aria-label={t('loading', { defaultValue: 'Loading your replays' })}>
          {[0, 1, 2].map((n) => (
            <div key={n} className="flex items-center gap-3 border-b border-site-border py-3">
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          title={t('error-title', { defaultValue: 'Could not load your replays.' })}
          description={t('error-description', { defaultValue: 'Check your connection and try again.' })}
          action={<Button onClick={() => void query.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('empty-title', { defaultValue: 'No saved replays yet.' })}
          description={t('empty-description', {
            defaultValue: 'Finish a run in a game that records replays and choose Save replay.',
          })}
        />
      ) : (
        <>
          <ul className={cn(arrival)}>
            {items.map((replay) => (
              <ReplayRow
                key={replay.id}
                replay={replay}
                arriving={isArriving(replay.id)}
                onChanged={replaceRow}
                onDeleted={() => void reload()}
              />
            ))}
          </ul>
          {query.hasNextPage ? (
            <div className="py-4">
              <Button onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
                {t('load-more', { defaultValue: 'Load more' })}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </SettingsSection>
  );
}
