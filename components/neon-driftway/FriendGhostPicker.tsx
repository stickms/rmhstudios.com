import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useArrival } from '@/components/ui/arrive';
import { apiQuery } from '@/lib/contract/client';
import { friendGhostsApi } from '@/lib/game/replay.contract';
import { formatDurationMs } from '@/lib/core/format';
import type { GhostFriend } from '@/lib/neon-driftway/ghost';
import type { LevelId } from '@/lib/neon-driftway/types';
import { cn } from '@/lib/utils';

/**
 * The friend picker for Neon Driftway's "A friend" ghost: a dialog of rows, one per mutual follow who has a ghost on
 * the level, fastest first. The list carries no trace; the trace is fetched when the run starts.
 *
 * `level` is the level being picked for (null = closed). `current` is the friend remembered for it: when that friend
 * no longer appears the picker says so in one line instead of silently racing nobody.
 */
export function FriendGhostPicker({
  level,
  signedIn,
  current,
  onChoose,
  onClose,
}: {
  level: LevelId | null;
  signedIn: boolean;
  current: GhostFriend | null;
  onChoose: (friend: GhostFriend) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('friend-ghosts');
  const open = level !== null;
  const list = useQuery({
    ...apiQuery(friendGhostsApi, { query: { game: 'neon-driftway', level: level ?? 1 } }),
    enabled: open && signedIn,
    // A friend who unfollows or hides drops out within a minute (the server caches for the same time).
    staleTime: 60_000,
  });
  const friends = list.data?.friends ?? [];
  const arrival = useArrival(list.data !== undefined);
  const missing = current && list.data && !friends.some((f) => f.userId === current.userId) ? current : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { defaultValue: 'Race a friend' })}</DialogTitle>
          <DialogDescription>
            {t('description', {
              defaultValue: 'Friends who follow you back and have a ghost on level {{level}}, fastest first.',
              level: level ?? 1,
            })}
          </DialogDescription>
        </DialogHeader>

        {!signedIn ? (
          <EmptyState title={t('signed-out', { defaultValue: 'Sign in to race friends' })} />
        ) : list.isPending ? (
          <div className="space-y-2" role="status" aria-label={t('loading', { defaultValue: 'Loading friends' })}>
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : list.isError ? (
          <EmptyState
            title={t('error', { defaultValue: 'Friends could not be loaded' })}
            action={<Button onClick={() => void list.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
          />
        ) : (
          <div className={cn('space-y-2', arrival)}>
            {missing ? (
              <p dir="auto" className="t-meta">
                {t('missing', { defaultValue: 'No ghost from {{name}} on this level', name: missing.name })}
              </p>
            ) : null}
            {friends.length === 0 ? (
              <EmptyState
                title={t('empty', { defaultValue: 'No friend has a ghost on this level yet' })}
                description={t('empty-hint', {
                  defaultValue: 'Friends appear here when you follow each other and they have driven this level.',
                })}
              />
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto">
                {friends.map((friend) => {
                  const name = friend.name || friend.handle || '';
                  return (
                    <li key={friend.userId} className="border-b border-site-border">
                      <button
                        type="button"
                        onClick={() => onChoose({ userId: friend.userId, name })}
                        aria-current={current?.userId === friend.userId ? 'true' : undefined}
                        className="flex min-h-9 w-full items-center justify-between gap-3 py-2 text-start pointer-coarse:min-h-11 hover:bg-site-bg-subtle"
                      >
                        <span className="t-body min-w-0 truncate">
                          <bdi>{name}</bdi>
                          {friend.name && friend.handle ? (
                            <span className="t-meta ms-2">
                              <bdi>@{friend.handle}</bdi>
                            </span>
                          ) : null}
                        </span>
                        <span className="t-meta shrink-0">{formatDurationMs(friend.timeMs)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
