/**
 * Minigames List Page
 *
 * Displays all registered minigames as cards with icon, name, description,
 * and action buttons for Leaderboard and History.
 *
 * Reference: docs/rmhbox/design-spec/core.md §14A.2
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, History } from 'lucide-react';
import RMHboxHeader from '@/components/rmhbox/RMHboxHeader';
import MinigameLeaderboardModal from '@/components/rmhbox/MinigameLeaderboardModal';
import LucideAwardIcon from '@/components/rmhbox/LucideAwardIcon';
import { getAllMinigames } from '@/lib/rmhbox/minigame-registry';
import { buildCanonical, buildMeta } from '@/lib/seo';
import type { MinigameDefinition } from '@/lib/rmhbox/types';

const CATEGORY_COLORS: Record<string, string> = {
  word: 'bg-(--app-success)/20 text-(--app-success)',
  trivia: 'bg-(--app-info)/20 text-(--app-info)',
  action: 'bg-(--app-warning)/20 text-(--app-warning)',
  creative: 'bg-(--app-rare)/20 text-(--app-rare)',
};

function MinigamesPage() {
  const { t } = useTranslation('r-rmhbox');
  const navigate = useNavigate();
  const minigames = getAllMinigames();
  const [leaderboardGame, setLeaderboardGame] = useState<MinigameDefinition | null>(null);

  return (
    <div className="app-page">
      <RMHboxHeader
        context="minigames"
        backHref="/rmhbox"
        backLabel={t('home', { defaultValue: 'Home' })}
      />

      <main className="mx-auto w-full max-w-4xl px-4 pt-4 pb-12 md:px-8 md:pt-8">
          <h2 className="mb-4 text-2xl font-bold text-(--app-text) md:mb-6">
            {t('minigames', { defaultValue: 'Minigames' })}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 md:gap-6">
            {minigames.map((game) => (
              <div
                key={game.id}
                className="glass-fill flex flex-col rounded-(--app-radius) px-4 py-4 md:px-6 md:py-5"
                data-testid={`minigame-card-${game.id}`}
              >
                {/* Icon + name + category */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-(--app-radius-sm) bg-(--app-accent)/10">
                    <LucideAwardIcon name={game.icon} className="h-5 w-5 text-(--app-accent)" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-(--app-text)">{game.displayName}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[game.category] ?? ''}`}
                      >
                        {game.category}
                      </span>
                      <span className="text-xs text-(--app-text-muted)">
                        {t('player-range', {
                          minPlayers: game.minPlayers,
                          maxPlayers: game.maxPlayers,
                          defaultValue: '{{minPlayers}}–{{maxPlayers}} players',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-(--app-text-muted) mb-4 flex-1">{game.description}</p>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLeaderboardGame(game)}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-(--app-radius-sm) py-2 text-sm font-medium transition-colors bg-(--app-surface-hover) text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-border)"
                    data-testid={`leaderboard-btn-${game.id}`}
                  >
                    <Trophy className="h-4 w-4" aria-hidden />
                    {t('leaderboard', { defaultValue: 'Leaderboard' })}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: '/rmhbox/minigames/$minigameId/history',
                        params: { minigameId: game.id },
                      })
                    }
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-(--app-radius-sm) py-2 text-sm font-medium transition-colors bg-(--app-accent) text-(--app-accent-fg) hover:bg-(--app-accent-hover)"
                    data-testid={`history-btn-${game.id}`}
                  >
                    <History className="h-4 w-4" aria-hidden />
                    {t('history', { defaultValue: 'History' })}
                  </button>
                </div>
              </div>
            ))}
          </div>
      </main>

      {/* Leaderboard Modal */}
      {leaderboardGame && (
        <MinigameLeaderboardModal
          minigameId={leaderboardGame.id}
          displayName={leaderboardGame.displayName}
          isOpen={true}
          onClose={() => setLeaderboardGame(null)}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute('/rmhbox/minigames/')({
  // Its own head rather than the one inherited from the `/rmhbox` shell: this
  // is a catalogue of every minigame, and "what games are in it" is the
  // question someone asks before deciding to open a party game at all.
  head: () => ({
    meta: buildMeta({
      title: 'RMHbox minigames — the full list | RMH Studios',
      // No count here: reading it from the registry put the whole registry in
      // every page's entry chunk, because head() is part of the route definition.
      description:
        'Every RMHbox minigame: word, trivia, action and creative rounds, with leaderboards and match history for each.',
      path: '/rmhbox/minigames',
    }),
    links: [buildCanonical('/rmhbox/minigames')],
  }),
  component: MinigamesPage,
});
