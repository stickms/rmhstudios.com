/**
 * Minigames List Page
 *
 * Displays all registered minigames as cards with icon, name, description,
 * and action buttons for Leaderboard and History.
 *
 * Reference: docs/rmhbox/design-spec/core.md §14A.2
 */

import { useState } from 'react';
import { Trophy, History } from 'lucide-react';
import RMHboxHeader from '@/components/rmhbox/RMHboxHeader';
import MinigameLeaderboardModal from '@/components/rmhbox/MinigameLeaderboardModal';
import LucideAwardIcon from '@/components/rmhbox/LucideAwardIcon';
import { getAllMinigames } from '@/lib/rmhbox/minigame-registry';
import type { MinigameDefinition } from '@/lib/rmhbox/types';
import { useRouter } from '@tanstack/react-router';

const CATEGORY_COLORS: Record<string, string> = {
  word: 'bg-emerald-500/20 text-emerald-400',
  trivia: 'bg-blue-500/20 text-blue-400',
  action: 'bg-orange-500/20 text-orange-400',
  creative: 'bg-purple-500/20 text-purple-400',
};

export default function MinigamesPage() {
  const router = useRouter();
  const minigames = getAllMinigames();
  const [leaderboardGame, setLeaderboardGame] = useState<MinigameDefinition | null>(null);

  return (
    <div className="flex h-screen flex-col">
      <RMHboxHeader context="minigames" backHref="/rmhbox" backLabel="Home" />

      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-(--rmhbox-text)">Minigames</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {minigames.map((game) => (
              <div
                key={game.id}
                className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-5 flex flex-col"
                data-testid={`minigame-card-${game.id}`}
              >
                {/* Icon + name + category */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-(--rmhbox-accent)/10 flex items-center justify-center">
                    <LucideAwardIcon name={game.icon} className="h-5 w-5 text-(--rmhbox-accent)" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-(--rmhbox-text)">{game.displayName}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[game.category] ?? ''}`}>
                        {game.category}
                      </span>
                      <span className="text-xs text-(--rmhbox-text-muted)">
                        {game.minPlayers}–{game.maxPlayers} players
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-(--rmhbox-text-muted) mb-4 flex-1">{game.description}</p>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setLeaderboardGame(game)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors bg-(--rmhbox-surface-hover) text-(--rmhbox-text-muted) hover:text-(--rmhbox-text) hover:bg-(--rmhbox-border)"
                    data-testid={`leaderboard-btn-${game.id}`}
                  >
                    <Trophy className="h-4 w-4" />
                    Leaderboard
                  </button>
                  <button
                    onClick={() => router.navigate({ to: `/rmhbox/minigames/${game.id}/history` })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors bg-(--rmhbox-accent) text-white hover:bg-(--rmhbox-accent-hover)"
                    data-testid={`history-btn-${game.id}`}
                  >
                    <History className="h-4 w-4" />
                    History
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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
