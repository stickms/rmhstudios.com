/**
 * CardRewardScreen.tsx — Signal Forge
 * ────────────────────────────────────
 * Post-combat card reward selection. Shows 3 card choices generated
 * from the card pool. The player can pick one or skip (+20 currency).
 */

'use client';

import React from 'react';
import type { Card } from '@/lib/signal-forge';
import { cardKeywordTags } from './uiHelpers';

interface Props {
  choices: Card[];
  onSelect: (card: Card) => void;
  onSkip: () => void;
}

export function CardRewardScreen({ choices, onSelect, onSkip }: Props) {
  return (
    <div className="w-full h-full bg-black bg-opacity-90 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-yellow-400 p-8 rounded-lg max-w-4xl w-full shadow-2xl">
        <h2 className="text-3xl font-bold text-center mb-6 text-yellow-400">
          ⭐ Choose Your Reward ⭐
        </h2>
        <div className="flex gap-6 justify-center mb-6">
          {choices.map((card, i) => {
            const keywords = cardKeywordTags(card);
            return (
              <button
                key={i}
                onClick={() => onSelect(card)}
                className="bg-slate-800 border-2 border-cyan-500 hover:border-yellow-400 hover:scale-105 transition-all rounded-lg p-4 w-64"
              >
                <div className="text-lg font-bold text-cyan-400">{card.name}</div>
                <div className="text-xs text-slate-400 mb-2">
                  {card.type} • {card.rarity}
                </div>
                <div className="text-sm text-slate-300 mb-3 min-h-12">
                  {card.effect}
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div>
                    {card.damage > 0 && <span className="text-red-400">⚔️ {card.damage} </span>}
                    {card.shield > 0 && <span className="text-blue-400">🛡️ {card.shield} </span>}
                  </div>
                  <div className="text-yellow-400 font-bold">
                    Cost: {card.cost}
                  </div>
                </div>
                {keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {keywords.map(kw => (
                      <span key={kw} className="text-xs bg-slate-700 px-2 py-1 rounded text-cyan-300">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={onSkip}
          className="block mx-auto text-slate-400 hover:text-yellow-400 font-bold text-lg"
        >
          Skip (+20 💰)
        </button>
      </div>
    </div>
  );
}
