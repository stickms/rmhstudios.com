/**
 * DeckViewer.tsx — Signal Forge
 * ─────────────────────────────
 * Modal overlay to browse the draw pile or discard pile during combat.
 * Cards are sorted by type then cost. Keyboard shortcut: D / F.
 */

'use client';

import React, { useEffect } from 'react';
import type { Card } from '@/lib/signal-forge';
import { cardKeywordTags, keywordColor, keywordTooltip, typeColor } from './uiHelpers';

interface Props {
  cards: Card[];
  pileLabel: string;
  onClose: () => void;
}

export function DeckViewer({ cards, pileLabel, onClose }: Props) {
  const typeOrder: Record<string, number> = { Pulse: 0, Sine: 1, Saw: 2, Noise: 3 };
  const sorted = [...cards].sort((a, b) => {
    const tA = typeOrder[a.type] ?? 4;
    const tB = typeOrder[b.type] ?? 4;
    if (tA !== tB) return tA - tB;
    return a.cost - b.cost;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="w-full h-full bg-black bg-opacity-80 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-3xl w-full max-h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-cyan-400">{pileLabel} ({cards.length} cards)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {sorted.map((card, i) => {
            const tags = cardKeywordTags(card);
            const border = card.rarity === 'rare' ? 'border-purple-500 bg-purple-900/20'
              : card.rarity === 'uncommon' ? 'border-blue-500 bg-blue-900/20'
              : 'border-slate-600 bg-slate-800';
            return (
              <div key={i} className={`border p-3 rounded-lg ${border}`}>
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-slate-100 text-sm">{card.name}{card.upgraded ? '+' : ''}</h3>
                  <span className="text-sm font-bold text-cyan-400">{card.cost >= 99 ? '✕' : card.cost}⚡</span>
                </div>
                <p className="text-[10px] text-slate-400 capitalize mb-1">
                  <span className={typeColor(card.type)}>{card.type}</span> · {card.rarity}
                </p>
                {tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap mb-1">
                    {tags.map(t => (
                      <span key={t} title={keywordTooltip(t)} className={`text-[8px] px-1 py-0.5 rounded font-bold cursor-help ${keywordColor(t)}`}>{t}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 text-xs mb-1">
                  {card.damage > 0 && <span className="text-red-400">⚔{card.getEffectiveDamage()}{card.echo ? ' ×2' : ''}{card.aoe ? ' AOE' : ''}</span>}
                  {card.shield > 0 && <span className="text-blue-400">🛡{card.getEffectiveShield()}{card.echo ? ' ×2' : ''}</span>}
                  {card.draw ? <span className="text-cyan-400">+{card.draw} draw</span> : null}
                  {card.leech ? <span className="text-emerald-400">Leech {card.leech}%</span> : null}
                </div>
                <p className="text-[10px] text-slate-400 italic line-clamp-2">{card.effect}</p>
              </div>
            );
          })}
        </div>
        <p className="text-gray-500 text-xs mt-3 text-center">Press D for draw pile, F for discard, or click outside to close</p>
      </div>
    </div>
  );
}
