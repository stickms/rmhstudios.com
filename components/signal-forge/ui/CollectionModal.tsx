/**
 * CollectionModal.tsx — Signal Forge
 * ───────────────────────────────────
 * Full collection viewer showing the player's current deck list with
 * location tags and their owned relics with rarity badges.
 */

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { GameState } from '@/lib/signal-forge/GameTypes';
import { cardKeywordTags, keywordColor, typeColor, rarityBorder, relicRarityBorder } from './uiHelpers';

interface Props {
  gameState: GameState;
  onClose: () => void;
}

export function CollectionModal({ gameState, onClose }: Props) {
  const { t } = useTranslation("c-signal-forge");
  return (
    <div className="w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-4xl w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-cyan-400">{t("collection", { defaultValue: "Collection" })}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-cyan-400 text-2xl font-bold">✕</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Cards Section */}
          <div>
            <h3 className="text-2xl font-bold text-green-400 mb-4">{t("deck-collection", { defaultValue: "Deck Collection ({{count}})", count: gameState.deckList.length })}</h3>
            <p className="text-xs text-slate-400 mb-3">
              {t("pile-summary", { defaultValue: "Draw pile: {{draw}} | Hand: {{hand}} | Discard: {{discard}}", draw: gameState.deck.length, hand: gameState.hand.length, discard: gameState.discard.length })}
            </p>
            <div className="max-h-96 overflow-y-auto space-y-2 bg-black bg-opacity-50 p-4 rounded border border-slate-700">
              {gameState.deckList.length === 0 ? (
                <p className="text-slate-400 text-sm">{t("no-cards", { defaultValue: "No cards yet. Build your deck in the shop!" })}</p>
              ) : (
                gameState.deckList.map((card) => {
                  const inHand = gameState.hand.some(c => c.id === card.id);
                  const inDiscard = gameState.discard.some(c => c.id === card.id);
                  const inDeck = gameState.deck.some(c => c.id === card.id);
                  const statusLabel = inHand ? '🖐️ Hand' : inDiscard ? '💨 Discard' : inDeck ? '📚 Deck' : '?';
                  const tags = cardKeywordTags(card);

                  return (
                    <div key={card.id} className={`border-l-4 p-3 rounded ${rarityBorder(card.rarity)}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-slate-100">{card.name}</h4>
                            {tags.map(t => (
                              <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${keywordColor(t)}`}>{t}</span>
                            ))}
                          </div>
                          <p className="text-xs text-slate-400 capitalize mt-0.5">
                            <span className={typeColor(card.type)}>{card.type}</span> · {card.rarity} · {t("cost-label", { defaultValue: "Cost" })} {card.cost >= 99 ? '✕' : card.cost}
                          </p>
                        </div>
                        <span className="text-xs text-slate-500 ml-2 whitespace-nowrap">{statusLabel}</span>
                      </div>
                      <div className="flex gap-3 text-xs mt-2 flex-wrap">
                        {card.damage > 0 && <span className="text-red-400">⚔️ {card.getEffectiveDamage()}{card.echo ? t("echo-suffix", { defaultValue: " (Echo +50%)" }) : ''}{card.aoe ? t("aoe-suffix", { defaultValue: " [AOE]" }) : ''}</span>}
                        {card.shield > 0 && <span className="text-blue-400">🛡️ {card.getEffectiveShield()}{card.echo ? t("echo-suffix", { defaultValue: " (Echo +50%)" }) : ''}</span>}
                        {card.draw ? <span className="text-cyan-400">📥 +{card.draw} {t("draw-label", { defaultValue: "draw" })}</span> : null}
                        {card.tempoGain ? <span className="text-purple-400">🎵 +{card.tempoGain} {t("tempo-label", { defaultValue: "tempo" })}</span> : null}
                        {card.leech ? <span className="text-emerald-400">🧛 {t("leech-label", { defaultValue: "Leech {{pct}}%", pct: card.leech })}</span> : null}
                        {card.selfDamage ? <span className="text-red-300">💔 {t("self-dmg-label", { defaultValue: "Self-dmg {{val}}", val: card.selfDamage })}</span> : null}
                        {card.stabilize ? <span className="text-sky-400">🧹 {t("purge-glitch-label", { defaultValue: "Purge {{val}} Glitch", val: card.stabilize })}</span> : null}
                        {card.staticReduce ? <span className="text-sky-300">📉 -{card.staticReduce} {t("static-label", { defaultValue: "Static" })}</span> : null}
                        {card.staticGain ? <span className="text-red-300">📈 +{card.staticGain} {t("static-label", { defaultValue: "Static" })}</span> : null}
                        {card.glitchGen ? <span className="text-red-400">⚡ +{card.glitchGen} {t("glitch-label", { defaultValue: "Glitch" })}</span> : null}
                        {card.bleed ? <span className="text-red-400">🩸 {t("bleed-label", { defaultValue: "Bleed {{val}}", val: card.bleed })}</span> : null}
                        {card.freeze ? <span className="text-blue-300">❄️ {t("freeze-label", { defaultValue: "Freeze" })}</span> : null}
                        {card.vulnerable ? <span className="text-orange-400">💥 {t("vulnerable-label", { defaultValue: "Vulnerable {{val}}t", val: card.vulnerable })}</span> : null}
                        {card.weak ? <span className="text-yellow-400">😵 {t("weak-label", { defaultValue: "Weak {{val}}t", val: card.weak })}</span> : null}
                        {card.siphon ? <span className="text-teal-400">🔄 {t("siphon-label", { defaultValue: "Siphon {{val}}", val: card.siphon })}</span> : null}
                        {card.multihit && card.multihit > 1 ? <span className="text-red-400">✕{card.multihit} {t("hits-label", { defaultValue: "hits" })}</span> : null}
                      </div>
                      <p className="text-xs text-slate-300 mt-1 italic">{card.effect}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Relics Section */}
          <div>
            <h3 className="text-2xl font-bold text-yellow-400 mb-4">{t("relics-upgrades", { defaultValue: "Relics & Upgrades ({{count}})", count: gameState.ownedRelics.length })}</h3>
            <div className="max-h-96 overflow-y-auto space-y-2 bg-black bg-opacity-50 p-4 rounded border border-slate-700">
              {gameState.ownedRelics.length === 0 ? (
                <p className="text-slate-400 text-sm">{t("no-relics", { defaultValue: "No relics yet. Purchase them in the shop!" })}</p>
              ) : (
                gameState.ownedRelics.map((relic) => (
                  <div key={relic.id} className={`border-l-4 p-3 rounded ${relicRarityBorder(relic.rarity)}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-100">🔮 {relic.name}</h4>
                        <p className="text-xs text-slate-400 capitalize">
                          {relic.rarity} {t("relic-word", { defaultValue: "Relic" })}{relic.key ? ` · ${relic.key}` : ''}
                        </p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        relic.rarity === 'rare' ? 'bg-purple-700 text-purple-200'
                        : relic.rarity === 'uncommon' ? 'bg-orange-700 text-orange-200'
                        : 'bg-yellow-700 text-yellow-200'
                      }`}>{relic.rarity.toUpperCase()}</span>
                    </div>
                    <p className="text-sm text-slate-300 mt-2">{relic.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <Button onClick={onClose} className="w-full mt-6 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg">
          {t("close", { defaultValue: "Close" })}
        </Button>
      </div>
    </div>
  );
}
