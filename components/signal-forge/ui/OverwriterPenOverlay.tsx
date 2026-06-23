/**
 * OverwriterPenOverlay.tsx — Signal Forge
 * ────────────────────────────────────────
 * Full-screen overlay for the Overwriter's Pen relic: lets the player
 * pick a hand card and transform it into any non-glitch card from
 * their collection. One-time use per combat.
 */

'use client';

import React from 'react';
import { useTranslation } from "react-i18next";
import type { Card } from '@/lib/signal-forge';
import { CARD_CATALOG } from '@/lib/signal-forge';

interface Props {
  hand: Card[];
  deckList: Card[];
  overwriterPenTarget: number;
  onActivate: (handIndex: number) => void;
  onConfirm: (cardKey: string) => void;
  onCancel: () => void;
}

export function OverwriterPenOverlay({ hand, deckList, overwriterPenTarget, onActivate, onConfirm, onCancel }: Props) {
  const { t } = useTranslation("c-signal-forge");
  const targetCard = hand[overwriterPenTarget];
  const availableCards = deckList
    .filter(c => !c.isGlitch && c.id !== targetCard?.id)
    .reduce((acc, c) => {
      if (!acc.some(a => a.name === c.name)) acc.push(c);
      return acc;
    }, [] as Card[]);

  return (
    <div className="w-full h-full bg-black bg-opacity-90 flex flex-col items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-purple-400 p-6 rounded-lg max-w-5xl w-full max-h-full overflow-y-auto">
        <h2 className="text-2xl font-bold text-center mb-2 text-purple-300">
          ✏️ Overwriter&apos;s Pen
        </h2>

        {/* Select which hand card to transform */}
        <p className="text-center text-gray-400 mb-3 text-sm">
          {t("select-hand-card", { defaultValue: "Select a card from your hand to transform:" })}
        </p>
        <div className="flex gap-2 justify-center mb-4 flex-wrap">
          {hand.map((card, i) => (
            <button
              key={card.id}
              onClick={() => onActivate(i)}
              className={`px-3 py-2 rounded border text-sm ${
                i === overwriterPenTarget
                  ? 'bg-purple-600 border-purple-300 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {card.name} ({card.cost}⚡)
            </button>
          ))}
        </div>

        {targetCard && (
          <>
            <p className="text-center text-gray-400 mb-3 text-sm">
              {t("transform-into-prefix", { defaultValue: "Transform" })} <span className="text-purple-300 font-bold">{targetCard.name}</span> {t("transform-into-suffix", { defaultValue: "into:" })}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
              {availableCards.map((card) => {
                const typeColorMap: Record<string, string> = { Pulse: '#ff6b6b', Sine: '#6bffb8', Saw: '#ff9f43', Noise: '#a78bfa' };
                return (
                  <button
                    key={card.id}
                    onClick={() => {
                      const matchKey = CARD_CATALOG.find(t => t.name === card.name)?.key;
                      if (matchKey) onConfirm(matchKey);
                    }}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded p-2 text-left"
                  >
                    <div className="text-sm font-bold" style={{ color: typeColorMap[card.type] || '#ccc' }}>{card.name}</div>
                    <div className="text-xs text-gray-400">{card.type} • {card.cost}⚡</div>
                    <div className="text-xs text-gray-500 mt-1">{card.effect}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="text-center">
          <button
            onClick={onCancel}
            className="bg-gray-700 hover:bg-gray-600 border border-gray-500 rounded px-4 py-2 text-gray-300"
          >
            {t("cancel", { defaultValue: "Cancel" })}
          </button>
        </div>
      </div>
    </div>
  );
}
