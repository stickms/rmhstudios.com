/**
 * PlayerProgressBar — Shows another player's progress in Wiki-Race.
 *
 * A compact one-line display with the player's name, click count, and
 * a "finished" badge with rank when applicable.
 *
 * Props:
 *   name: string       — Player display name
 *   clickCount: number — Number of clicks (links navigated)
 *   hasFinished: boolean
 *   finishRank: number — Finish position (1 = first)
 */
'use client';

import { Trophy } from 'lucide-react';

interface PlayerProgressBarProps {
  name: string;
  clickCount: number;
  hasFinished: boolean;
  finishRank: number;
}

export default function PlayerProgressBar({
  name,
  clickCount,
  hasFinished,
  finishRank,
}: PlayerProgressBarProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        {hasFinished && (
          <Trophy
            size={12}
            className={finishRank === 1 ? 'text-yellow-400' : 'text-[var(--rmhbox-text-muted)]'}
          />
        )}
        <span className={hasFinished ? 'font-semibold' : ''}>{name}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--rmhbox-text-muted)]">
          {clickCount} click{clickCount !== 1 ? 's' : ''}
        </span>
        {hasFinished && (
          <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">
            #{finishRank}
          </span>
        )}
      </div>
    </div>
  );
}
