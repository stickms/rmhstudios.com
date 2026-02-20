/**
 * CombatHUD.tsx — Signal Forge
 * ────────────────────────────
 * Bottom-left HUD buttons shown during combat: deck/discard viewer,
 * hand-sort toggle, and Overwriter's Pen activation.
 */

'use client';

import React from 'react';
import type { Relic } from '@/lib/signal-forge';

interface Props {
  deckCount: number;
  discardCount: number;
  handSortMode: string;
  hand: { length: number };
  ownedRelics: Relic[];
  overwriterPenUsed: boolean;
  onToggleViewPile?: (pile: 'deck' | 'discard' | null) => void;
  onCycleSortMode?: () => void;
  onActivateOverwriterPen?: (handIndex: number) => void;
}

export function CombatHUD({
  deckCount,
  discardCount,
  handSortMode,
  hand,
  ownedRelics,
  overwriterPenUsed,
  onToggleViewPile,
  onCycleSortMode,
  onActivateOverwriterPen,
}: Props) {
  return (
    <div className="fixed bottom-2 left-2 flex gap-2 z-30">
      {onToggleViewPile && (
        <>
          <button
            onClick={() => onToggleViewPile('deck')}
            className="bg-gray-800/80 hover:bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
            title="View draw pile (D)"
          >
            📚 Deck ({deckCount})
          </button>
          <button
            onClick={() => onToggleViewPile('discard')}
            className="bg-gray-800/80 hover:bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
            title="View discard pile (F)"
          >
            🗑️ Discard ({discardCount})
          </button>
        </>
      )}
      {onCycleSortMode && (
        <button
          onClick={onCycleSortMode}
          className="bg-gray-800/80 hover:bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
          title="Sort hand (S)"
        >
          ⬇️ Sort: {handSortMode}
        </button>
      )}
      {onActivateOverwriterPen && ownedRelics.some(r => r.key === 'overwriters_pen') && !overwriterPenUsed && (
        <button
          onClick={() => {
            if (hand.length > 0) onActivateOverwriterPen(0);
          }}
          className="bg-purple-800/80 hover:bg-purple-700 border border-purple-400 rounded px-2 py-1 text-xs text-purple-200"
          title="Transform a card in hand (one-time)"
        >
          ✏️ Overwriter&apos;s Pen
        </button>
      )}
    </div>
  );
}
