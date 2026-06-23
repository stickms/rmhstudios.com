/**
 * CardModals.tsx — Signal Forge
 * ─────────────────────────────
 * Card-removal and card-upgrade selection modals used from the shop.
 * Shows the full deck list with keyword tags, stats, and action buttons.
 */

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Card } from '@/lib/signal-forge';
import { cardKeywordTags, keywordColor, typeColor, rarityBorder } from './uiHelpers';

/* ────────────────────────── Card Removal ────────────────────────── */

interface RemoveProps {
  deckList: Card[];
  removalCurrency: number;
  canRemove: boolean;
  onRemove: (cardId: number) => void;
  onClose: () => void;
}

export function CardRemovalModal({ deckList, removalCurrency, canRemove, onRemove, onClose }: RemoveProps) {
  const { t } = useTranslation("c-signal-forge");
  return (
    <div className="w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-red-500 p-8 rounded-lg max-w-2xl w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-red-400">{t("select-card-to-remove", { defaultValue: "Select Card to Remove" })}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-red-400 text-2xl font-bold">✕</button>
        </div>

        <p className="text-slate-300 mb-4">{t("choose-card-to-remove", { defaultValue: "Choose a card to remove from your deck (Cost: {{cost}})", cost: removalCurrency })}</p>

        <div className="max-h-96 overflow-y-auto space-y-2 bg-black bg-opacity-50 p-4 rounded border border-slate-700 mb-6">
          {deckList.map((card) => {
            const tags = cardKeywordTags(card);
            return (
              <div key={card.id} className={`border-l-4 p-3 rounded hover:brightness-110 transition ${rarityBorder(card.rarity)}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-100">{card.name}</h4>
                      {tags.map(t => (
                        <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${keywordColor(t)}`}>{t}</span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 capitalize mt-0.5">
                      <span className={typeColor(card.type)}>{card.type}</span> · {card.rarity} · Cost {card.cost >= 99 ? '✕' : card.cost}
                    </p>
                    <div className="flex gap-3 text-xs mt-1">
                      {card.damage > 0 && <span className="text-red-400">⚔️ {card.getEffectiveDamage()}{card.echo ? ' (Echo)' : ''}{card.aoe ? ' AOE' : ''}</span>}
                      {card.shield > 0 && <span className="text-blue-400">🛡️ {card.getEffectiveShield()}{card.echo ? ' (Echo)' : ''}</span>}
                      {card.draw ? <span className="text-cyan-400">+{card.draw} draw</span> : null}
                      {card.leech ? <span className="text-emerald-400">Leech {card.leech}%</span> : null}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 italic">{card.effect}</p>
                  </div>
                  <Button
                    onClick={() => onRemove(card.id)}
                    disabled={!canRemove}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-slate-700 text-white font-bold px-4 py-2 rounded ml-3 shrink-0"
                  >
                    {t("remove", { defaultValue: "Remove" })}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <Button onClick={onClose} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg">
          {t("cancel", { defaultValue: "Cancel" })}
        </Button>
      </div>
    </div>
  );
}

/* ────────────────────────── Card Upgrade ────────────────────────── */

interface UpgradeProps {
  deckList: Card[];
  upgradeCurrency: number;
  canUpgrade: boolean;
  onUpgrade: (cardId: number) => void;
  onClose: () => void;
}

export function CardUpgradeModal({ deckList, upgradeCurrency, canUpgrade, onUpgrade, onClose }: UpgradeProps) {
  const { t } = useTranslation("c-signal-forge");
  const upgradableCards = deckList.filter(c => !c.upgraded);

  return (
    <div className="w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-yellow-500 p-8 rounded-lg max-w-2xl w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-yellow-400">{t("select-card-to-upgrade", { defaultValue: "Select Card to Upgrade" })}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-yellow-400 text-2xl font-bold">✕</button>
        </div>

        <p className="text-slate-300 mb-4">{t("choose-card-to-upgrade", { defaultValue: "Choose a card to upgrade: +25% damage/shield (Cost: {{cost}})", cost: upgradeCurrency })}</p>

        <div className="max-h-96 overflow-y-auto space-y-2 bg-black bg-opacity-50 p-4 rounded border border-slate-700 mb-6">
          {upgradableCards.map((card) => {
            const tags = cardKeywordTags(card);
            const newDamage = Math.ceil(card.damage * 1.25);
            const newShield = Math.ceil(card.shield * 1.25);

            return (
              <div key={card.id} className={`border-l-4 p-3 rounded hover:brightness-110 transition ${rarityBorder(card.rarity)}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-100">{card.name}</h4>
                      {tags.map(t => (
                        <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${keywordColor(t)}`}>{t}</span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 capitalize mt-0.5">
                      <span className={typeColor(card.type)}>{card.type}</span> · {card.rarity} · Cost {card.cost >= 99 ? '✕' : card.cost}
                    </p>
                    <div className="flex gap-3 text-xs mt-1">
                      {card.damage > 0 && (
                        <span className="text-red-400">
                          ⚔️ {card.damage} → <span className="text-yellow-400 font-bold">{newDamage}</span>
                        </span>
                      )}
                      {card.shield > 0 && (
                        <span className="text-blue-400">
                          🛡️ {card.shield} → <span className="text-yellow-400 font-bold">{newShield}</span>
                        </span>
                      )}
                      {card.draw ? <span className="text-cyan-400">+{card.draw} draw</span> : null}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 italic">{card.effect}</p>
                  </div>
                  <Button
                    onClick={() => onUpgrade(card.id)}
                    disabled={!canUpgrade}
                    className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-700 text-white font-bold px-4 py-2 rounded ml-3 shrink-0"
                  >
                    {t("upgrade", { defaultValue: "Upgrade" })}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <Button onClick={onClose} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg">
          {t("cancel", { defaultValue: "Cancel" })}
        </Button>
      </div>
    </div>
  );
}
