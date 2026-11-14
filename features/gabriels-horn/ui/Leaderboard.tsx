/**
 * Gabriel's Horn — the record board.
 *
 * Ranked on games won rather than on the smallest hand anyone has ever held:
 * a two-card finish in a three-player game is not the same achievement as one
 * in a six-player game, and a board that rewarded it would reward finding the
 * smallest table. Wins survive that.
 */

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { hornLeaderboardApi } from '@features/gabriels-horn/engine/gabriels-horn.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

interface Row {
  username: string;
  wins: number;
  gamesPlayed: number;
  bestHand: number | null;
  hornsSounded: number;
  hornsWon: number;
}

async function fetchBoard(): Promise<Row[]> {
  const data = await api(hornLeaderboardApi, { query: { limit: 8 } });
  return Array.isArray(data.rows) ? data.rows : [];
}

export function HornLeaderboard() {
  const { t } = useTranslation('c-gabriels-horn');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['gabriels-horn', 'leaderboard'],
    queryFn: fetchBoard,
    staleTime: 60_000,
  });
  const arrival = useArrival(!isLoading);

  if (isLoading) {
    return (
      <p className="text-sm text-app-text-dim">
        {t('leaderboard-loading', { defaultValue: 'Reading the record…' })}
      </p>
    );
  }

  if (isError) {
    return (
      <p className={cn('text-sm text-app-text-dim', arrival)}>
        {t('leaderboard-error', { defaultValue: 'The record is unavailable right now.' })}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className={cn('text-sm text-app-text-dim', arrival)}>
        {t('leaderboard-empty', { defaultValue: 'Nobody has finished a game yet. Go first.' })}
      </p>
    );
  }

  return (
    <ol className={cn('space-y-1', arrival)}>
      {data.map((row, index) => (
        <li
          key={row.username}
          className="flex items-baseline justify-between gap-3 text-sm tabular-nums"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="w-4 shrink-0 text-end font-mono text-xs text-app-text-dim">
              {index + 1}
            </span>
            <span className="truncate text-app-text">{row.username}</span>
          </span>
          <span className="shrink-0 text-app-text-muted">
            {t('leaderboard-wins', {
              defaultValue: '{{wins}} of {{played}}',
              wins: row.wins,
              played: row.gamesPlayed,
            })}
          </span>
        </li>
      ))}
    </ol>
  );
}
