/**
 * GameShell — Wrapper layout for all minigames.
 *
 * Flexible center area for game content (children).
 * Footer with score, round counter (centered), and player count.
 * Header is handled by RMHboxHeader in the parent page.
 *
 * Props:
 *   roundNumber: number — Current round number
 *   score: number — Player's current score
 *   playerCount: number — Number of players in the game
 *   children: React.ReactNode — Game content
 */
'use client';

import { Users } from 'lucide-react';

interface GameShellProps {
  roundNumber: number;
  score: number;
  playerCount: number;
  children: React.ReactNode;
}

export default function GameShell({
  roundNumber,
  score,
  playerCount,
  children,
}: GameShellProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-(--rmhbox-bg) text-(--rmhbox-text)">
      {/* Game content */}
      <main className="flex flex-1 items-center justify-center p-4">{children}</main>

      {/* Footer */}
      <footer className="relative flex shrink-0 items-center border-t border-(--rmhbox-border) px-4 py-1.5 text-sm">
        <span className="font-mono font-semibold">
          Score: <span className="text-(--rmhbox-accent)">{score}</span>
        </span>
        {/* Round counter — absolutely centered to screen */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="rounded-full bg-(--rmhbox-surface) px-2 py-0.5 text-xs font-medium text-(--rmhbox-text-muted)">
            Round {roundNumber}
          </span>
        </div>
        <span className="ml-auto flex items-center gap-1 text-(--rmhbox-text-muted)">
          <Users className="h-4 w-4" /> {playerCount}
        </span>
      </footer>
    </div>
  );
}
