'use client';

/**
 * Gabriel's Horn — standings.
 *
 * The one thing this screen has to make unmistakable is the backfire: a player
 * who sounded the horn without being strictly lowest finishes LAST holding
 * three cards, which looks like a bug unless the screen says why. So the
 * backfired row is called out in its own line rather than left to be inferred
 * from a placement that contradicts the count beside it.
 */

import { useTranslation } from 'react-i18next';
import { Megaphone, Trophy } from 'lucide-react';
import type { GameResults } from '@/lib/gabriels-horn/net/events';
import { HornButton, Panel, SeatAvatar } from './ui';

export function ResultsPanel({
  results,
  selfSocketId,
  onRematch,
  onLeave,
}: {
  results: GameResults;
  selfSocketId: string | null;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation('c-gabriels-horn');
  const winner = results.standings.find((row) => row.place === 1);
  const backfired = results.standings.find((row) => row.endBackfired);

  return (
    <div className="gh-scene app-page app-safe-x text-(--app-text)">
      <main className="mx-auto flex w-full max-w-md grow flex-col justify-center-safe gap-4 px-4 py-8">
        <div className="text-center">
          <Trophy className="mx-auto size-8 text-(--app-accent)" aria-hidden="true" />
          <h1 className="mt-2 text-2xl font-black">
            {results.abandoned
              ? t('results-abandoned', { defaultValue: 'The table broke up' })
              : winner
                ? t('results-winner', { defaultValue: '{{name}} wins', name: winner.name })
                : t('results-none', { defaultValue: 'No winner' })}
          </h1>
          {winner && !results.abandoned ? (
            <p className="mt-1 text-sm text-(--app-text-muted)">
              {t('results-with', {
                defaultValue: 'Holding {{count}} cards after {{rounds}} rounds.',
                count: winner.handCount,
                rounds: results.rounds,
              })}
            </p>
          ) : null}
        </div>

        {backfired ? (
          <p className="flex items-start gap-2 rounded-[var(--app-radius-sm)] border border-(--app-danger) bg-(--app-danger-dim) p-3 text-sm text-(--app-text)">
            <Megaphone className="mt-0.5 size-4 shrink-0 text-(--app-danger)" aria-hidden="true" />
            <span>
              {t('results-backfired', {
                defaultValue:
                  '{{name}} sounded the horn without being strictly lowest, so the call backfired and drops them to last.',
                name: backfired.name,
              })}
            </span>
          </p>
        ) : null}

        <Panel>
          <ol className="space-y-2">
            {results.standings.map((row) => (
              <li key={row.socketId} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-end font-mono text-sm text-(--app-text-dim)">
                  {row.place}
                </span>
                <SeatAvatar name={row.name} avatarUrl={row.avatarUrl} size={28} />
                <span className="min-w-0 grow truncate text-sm">
                  {row.name}
                  {row.socketId === selfSocketId ? (
                    <span className="ms-1 text-(--app-text-dim)">
                      {t('you-suffix', { defaultValue: '(you)' })}
                    </span>
                  ) : null}
                  {row.calledEnd ? (
                    <Megaphone
                      className="ms-1 inline size-3 align-baseline text-(--app-accent)"
                      aria-label={t('sounded-the-horn', { defaultValue: 'Sounded the horn' })}
                    />
                  ) : null}
                </span>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                  {t('card-count', { defaultValue: '{{count}} cards', count: row.handCount })}
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="grid gap-2">
          <HornButton variant="primary" onClick={onRematch}>
            {t('rematch', { defaultValue: 'Again' })}
          </HornButton>
          <HornButton variant="ghost" onClick={onLeave}>
            {t('leave-table', { defaultValue: 'Leave' })}
          </HornButton>
        </div>
      </main>
    </div>
  );
}
