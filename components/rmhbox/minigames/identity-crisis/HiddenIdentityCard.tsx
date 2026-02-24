/**
 * HiddenIdentityCard — Shows the player's own hidden identity as "???".
 *
 * Displays a pulsing "???" card for the player's own unknown identity,
 * along with remaining questions count and a success indicator.
 *
 * Props:
 *   userName: string — Player's display name
 *   questionsRemaining: number — How many questions the player can still ask
 *   hasGuessedCorrectly?: boolean — Whether the player has already guessed correctly
 */
'use client';

import { HelpCircle, CheckCircle } from 'lucide-react';

interface HiddenIdentityCardProps {
  userName: string;
  questionsRemaining: number;
  hasGuessedCorrectly?: boolean;
}

export default function HiddenIdentityCard({ userName, questionsRemaining, hasGuessedCorrectly = false }: HiddenIdentityCardProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-(--rmhbox-warning) bg-(--rmhbox-warning)/5 px-4 py-3">
      <div className="flex items-center gap-1.5">
        <HelpCircle className="h-3.5 w-3.5 text-(--rmhbox-warning)" />
        <span className="text-xs font-medium text-(--rmhbox-text-muted)">{userName} (You)</span>
      </div>

      {hasGuessedCorrectly ? (
        <div className="flex items-center gap-1 text-sm font-bold text-(--rmhbox-success)">
          <CheckCircle className="h-4 w-4" />
          <span>Guessed!</span>
        </div>
      ) : (
        <span className="animate-pulse text-lg font-extrabold text-(--rmhbox-warning)">???</span>
      )}

      <span className="text-[10px] text-(--rmhbox-text-muted)">
        {questionsRemaining} question{questionsRemaining !== 1 ? 's' : ''} left
      </span>
    </div>
  );
}
