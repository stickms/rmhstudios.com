/**
 * CombatHUD.tsx — Signal Forge
 * ────────────────────────────
 * Bottom-left HUD buttons shown during combat: deck/discard viewer,
 * hand-sort toggle, and Overwriter's Pen activation.
 */

'use client';

import React from 'react';
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("c-signal-forge");
  return (
    <div className="fixed bottom-2 left-2 flex gap-2 z-30">
      {onToggleViewPile && (
        <>
          <button
            onClick={() => onToggleViewPile('deck')}
            className="bg-gray-800/80 hover:bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
            title={t("view-draw-pile-title", { defaultValue: "View draw pile (D)" })}
          >
            📚 {t("deck-label", { defaultValue: "Deck" })} ({deckCount})
          </button>
          <button
            onClick={() => onToggleViewPile('discard')}
            className="bg-gray-800/80 hover:bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
            title={t("view-discard-pile-title", { defaultValue: "View discard pile (F)" })}
          >
            🗑️ {t("discard-label", { defaultValue: "Discard" })} ({discardCount})
          </button>
        </>
      )}
      {onCycleSortMode && (
        <button
          onClick={onCycleSortMode}
          className="bg-gray-800/80 hover:bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300"
          title={t("sort-hand-title", { defaultValue: "Sort hand (S)" })}
        >
          ⬇️ {t("sort-label", { defaultValue: "Sort" })}: {handSortMode}
        </button>
      )}
      {onActivateOverwriterPen && ownedRelics.some(r => r.key === 'overwriters_pen') && !overwriterPenUsed && (
        <button
          onClick={() => {
            if (hand.length > 0) onActivateOverwriterPen(0);
          }}
          className="bg-purple-800/80 hover:bg-purple-700 border border-purple-400 rounded px-2 py-1 text-xs text-purple-200"
          title={t("overwriter-pen-title", { defaultValue: "Transform a card in hand (one-time)" })}
        >
          ✏️ {t("overwriter-pen-label", { defaultValue: "Overwriter's Pen" })}
        </button>
      )}
    </div>
  );
}
