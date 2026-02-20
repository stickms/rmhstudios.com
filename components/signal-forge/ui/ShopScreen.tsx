/**
 * ShopScreen.tsx — Signal Forge
 * ─────────────────────────────
 * Full shop interface shown between floors. Lists purchasable cards,
 * relics, and services (card removal / upgrade). Includes a refresh
 * button and a collection viewer trigger.
 */

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import type { Card, Relic } from '@/lib/signal-forge';
import { cardKeywordTags, keywordColor, keywordTooltip, typeColor } from './uiHelpers';
import type { GameState } from '@/lib/signal-forge/GameTypes';

interface Props {
  gameState: GameState;
  onBuyItem?: (itemId: string) => void;
  onProceedFromShop?: () => void;
  onRefreshShop?: () => void;
  onOpenRemoval: () => void;
  onOpenUpgrade: () => void;
  onOpenCollection: () => void;
}

export function ShopScreen({
  gameState,
  onBuyItem,
  onProceedFromShop,
  onRefreshShop,
  onOpenRemoval,
  onOpenUpgrade,
  onOpenCollection,
}: Props) {
  const costScale = 1 + (gameState.floor - 1) * 0.08;
  const removalPrice = Math.round(50 * Math.pow(2, gameState.shopRemovalsUsed) * costScale);
  const upgradePrice = Math.round(50 * Math.pow(2, gameState.shopUpgradesUsed) * costScale);
  const canAffordRemoval = gameState.currency >= removalPrice;
  const canAffordUpgrade = gameState.currency >= upgradePrice;
  const upgradableCards = gameState.deckList.filter(c => !c.upgraded);

  const shopCards = gameState.shopInventory.filter(i => i.type === 'card');
  const shopRelics = gameState.shopInventory.filter(i => i.type === 'relic');

  return (
    <div className="w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-6 rounded-lg max-w-4xl w-full shadow-2xl max-h-full overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-cyan-400">Shop — Floor {gameState.floor}</h2>
          <div className="flex gap-4 items-center">
            <button
              onClick={onOpenCollection}
              className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-1 px-3 rounded text-sm"
            >
              📚 Collection
            </button>
            <div className="text-yellow-400 font-bold text-lg">💰 {gameState.currency}</div>
          </div>
        </div>

        {/* Cards */}
        <div className="mb-4">
          <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider mb-2 border-b border-cyan-800 pb-1">Cards</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {shopCards.map((item) => {
              const card = item.item as Card;
              const tags = cardKeywordTags(card);
              const isAffordable = gameState.currency >= item.price;
              return (
                <div key={item.id} className={`border p-3 rounded-lg ${card.rarity === 'rare' ? 'border-purple-500 bg-purple-900/20' : card.rarity === 'uncommon' ? 'border-blue-500 bg-blue-900/20' : 'border-slate-600 bg-slate-800'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-slate-100 text-sm">{card.name}</h3>
                    <span className={`text-sm font-bold ${isAffordable ? 'text-yellow-400' : 'text-slate-500'}`}>{item.price}💰</span>
                  </div>
                  <p className="text-[10px] text-slate-400 capitalize mb-1">
                    <span className={typeColor(card.type)}>{card.type}</span> · {card.rarity} · {card.cost >= 99 ? '✕' : card.cost}⚡
                  </p>
                  {tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-1">
                      {tags.map(t => (
                        <span key={t} title={keywordTooltip(t)} className={`text-[8px] px-1 py-0.5 rounded font-bold cursor-help ${keywordColor(t)}`}>{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 text-xs mb-1">
                    {card.damage > 0 && <span className="text-red-400">⚔{card.getEffectiveDamage()}{card.aoe ? ' AOE' : ''}</span>}
                    {card.shield > 0 && <span className="text-blue-400">🛡{card.getEffectiveShield()}</span>}
                  </div>
                  <p className="text-[10px] text-slate-400 italic mb-2 line-clamp-2">{card.effect}</p>
                  <Button
                    onClick={() => onBuyItem?.(item.id)}
                    disabled={!isAffordable}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-bold py-1.5 rounded text-xs"
                  >
                    Buy
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Relics */}
        {shopRelics.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-bold text-orange-300 uppercase tracking-wider mb-2 border-b border-orange-800 pb-1">
              Relics {gameState.relicBoughtThisShop && <span className="text-slate-500 text-xs normal-case ml-2">(limit 1 per visit — purchased)</span>}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {shopRelics.map((item) => {
                const relic = item.item as Relic;
                const isAffordable = gameState.currency >= item.price && !gameState.relicBoughtThisShop;
                const relicBorder = relic.rarity === 'rare' ? 'border-purple-500 bg-purple-900/20' : relic.rarity === 'uncommon' ? 'border-orange-500 bg-orange-900/20' : 'border-yellow-600 bg-yellow-900/20';
                return (
                  <div key={item.id} className={`border p-3 rounded-lg ${gameState.relicBoughtThisShop ? 'opacity-50' : ''} ${relicBorder}`}>
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-slate-100 text-sm">🔮 {relic.name}</h3>
                      <span className={`text-sm font-bold ${isAffordable ? 'text-yellow-400' : 'text-slate-500'}`}>{item.price}💰</span>
                    </div>
                    <p className="text-[10px] text-slate-400 capitalize mb-1">{relic.rarity} Relic</p>
                    <p className="text-xs text-slate-300 mb-2">{relic.description}</p>
                    <Button
                      onClick={() => onBuyItem?.(item.id)}
                      disabled={!isAffordable}
                      className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-700 text-white font-bold py-1.5 rounded text-xs"
                    >
                      {gameState.relicBoughtThisShop ? 'Sold Out' : 'Buy'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Services */}
        <div className="mb-4">
          <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wider mb-2 border-b border-emerald-800 pb-1">Services</h3>
          <div className="flex gap-3">
            <Button
              onClick={onOpenRemoval}
              disabled={!canAffordRemoval || gameState.deckList.length === 0}
              className="flex-1 bg-red-800/50 hover:bg-red-700/60 disabled:bg-slate-800 border border-red-500 disabled:border-slate-700 text-white font-bold py-3 rounded-lg text-sm"
            >
              <span className="block">🗑️ Remove Card</span>
              <span className={`text-xs ${canAffordRemoval ? 'text-yellow-400' : 'text-slate-500'}`}>{removalPrice}💰</span>
            </Button>
            <Button
              onClick={onOpenUpgrade}
              disabled={!canAffordUpgrade || upgradableCards.length === 0}
              className="flex-1 bg-yellow-800/50 hover:bg-yellow-700/60 disabled:bg-slate-800 border border-yellow-500 disabled:border-slate-700 text-white font-bold py-3 rounded-lg text-sm"
            >
              <span className="block">⬆️ Upgrade Card</span>
              <span className={`text-xs ${canAffordUpgrade ? 'text-yellow-400' : 'text-slate-500'}`}>{upgradePrice}💰</span>
            </Button>
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex gap-3">
          {onRefreshShop && gameState.shopRefreshesUsed < 2 && (
            <Button
              onClick={onRefreshShop}
              disabled={gameState.currency < Math.round(20 * costScale)}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white font-bold py-3 px-4 rounded-lg text-sm"
            >
              🔄 Refresh ({Math.round(20 * costScale)}💰) [{2 - gameState.shopRefreshesUsed} left]
            </Button>
          )}
          <Button
            onClick={onProceedFromShop}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg"
          >
            Continue (Floor {gameState.floor})
          </Button>
        </div>
      </div>
    </div>
  );
}
