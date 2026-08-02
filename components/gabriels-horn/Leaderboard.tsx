'use client';

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

interface Row {
  username: string;
  wins: number;
  gamesPlayed: number;
  bestHand: number | null;
  hornsSounded: number;
  hornsWon: number;
}

async function fetchBoard(): Promise<Row[]> {
  const response = await fetch('/api/gabriels-horn/leaderboard?limit=8');
  if (!response.ok) throw new Error(String(response.status));
  const data = (await response.json()) as { rows?: Row[] };
  return Array.isArray(data.rows) ? data.rows : [];
}

export function HornLeaderboard() {
  const { t } = useTranslation('c-gabriels-horn');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['gabriels-horn', 'leaderboard'],
    queryFn: fetchBoard,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <p className="text-sm text-(--app-text-dim)">
        {t('leaderboard-loading', { defaultValue: 'Reading the record…' })}
      </p>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-(--app-text-dim)">
        {t('leaderboard-error', { defaultValue: 'The record is unavailable right now.' })}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-(--app-text-dim)">
        {t('leaderboard-empty', { defaultValue: 'Nobody has finished a game yet. Go first.' })}
      </p>
    );
  }

  return (
    <ol className="space-y-1">
      {data.map((row, index) => (
        <li
          key={row.username}
          className="flex items-baseline justify-between gap-3 text-sm tabular-nums"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="w-4 shrink-0 text-end font-mono text-xs text-(--app-text-dim)">
              {index + 1}
            </span>
            <span className="truncate text-(--app-text)">{row.username}</span>
          </span>
          <span className="shrink-0 text-(--app-text-muted)">
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
