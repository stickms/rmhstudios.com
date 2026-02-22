/**
 * GameShell — Wrapper layout for all minigames.
 *
 * Fixed header with game name, timer ring, and round indicator.
 * Flexible center area for game content (children).
 * Footer with score and player count.
 *
 * Props:
 *   gameName: string — Display name of the current minigame
 *   timeRemaining: number | null — Seconds remaining (null hides timer)
 *   totalDuration: number — Total duration in seconds for timer ring calculation (default 60)
 *   roundNumber: number — Current round number
 *   score: number — Player's current score
 *   playerCount: number — Number of players in the game
 *   children: React.ReactNode — Game content
 */
'use client';

import { Users } from 'lucide-react';

interface GameShellProps {
  gameName: string;
  timeRemaining: number | null;
  totalDuration?: number;
  roundNumber: number;
  score: number;
  playerCount: number;
  children: React.ReactNode;
}

/** SVG ring for the countdown timer. */
function TimerRing({ seconds, total }: { seconds: number; total: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, seconds) / (total || 60);
  const offset = circumference * (1 - ratio);

  return (
    <div className="relative flex items-center justify-center">
      <svg width="48" height="48" className="-rotate-90">
        <circle
          cx="24" cy="24" r={radius}
          fill="none"
          stroke="var(--rmhbox-border)"
          strokeWidth="3"
        />
        <circle
          cx="24" cy="24" r={radius}
          fill="none"
          stroke={seconds <= 10 ? 'var(--rmhbox-danger)' : 'var(--rmhbox-accent)'}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className="absolute text-xs font-bold text-[var(--rmhbox-text)]">
        {Math.ceil(seconds)}
      </span>
    </div>
  );
}

export default function GameShell({
  gameName,
  timeRemaining,
  totalDuration = 60,
  roundNumber,
  score,
  playerCount,
  children,
}: GameShellProps) {
  return (
    <div className="flex h-full min-h-screen flex-col bg-[var(--rmhbox-bg)] text-[var(--rmhbox-text)]">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--rmhbox-border)] px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">{gameName}</h1>
          <span className="rounded-full bg-[var(--rmhbox-surface)] px-2 py-0.5 text-xs font-medium text-[var(--rmhbox-text-muted)]">
            Round {roundNumber}
          </span>
        </div>
        {timeRemaining !== null && <TimerRing seconds={timeRemaining} total={totalDuration} />}
      </header>

      {/* Game content */}
      <main className="flex flex-1 items-center justify-center p-4">{children}</main>

      {/* Footer */}
      <footer className="flex shrink-0 items-center justify-between border-t border-[var(--rmhbox-border)] px-4 py-2 text-sm">
        <span className="font-mono font-semibold">
          Score: <span className="text-[var(--rmhbox-accent)]">{score}</span>
        </span>
        <span className="flex items-center gap-1 text-[var(--rmhbox-text-muted)]">
          <Users className="h-4 w-4" /> {playerCount}
        </span>
      </footer>
    </div>
  );
}
