/**
 * MetaShopScreen — Persistent upgrade shop using coins.
 */
'use client';

import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { META_UPGRADES } from '@/lib/altair/data/meta-upgrades';
import { useAltairToastStore } from '@/lib/altair/stores/toast-store';
import { Coins, Lock, Check } from 'lucide-react';

interface MetaShopScreenProps {
  onBack: () => void;
}

export default function MetaShopScreen({ onBack }: MetaShopScreenProps) {
  const coins = useAltairMetaStore((s) => s.coins);
  const upgrades = useAltairMetaStore((s) => s.upgrades);
  const purchaseUpgrade = useAltairMetaStore((s) => s.purchaseUpgrade);
  const addToast = useAltairToastStore((s) => s.addToast);

  const handlePurchase = (id: string, name: string) => {
    const success = purchaseUpgrade(id);
    if (success) {
      addToast(`Upgraded ${name}!`, 'success');
    } else {
      addToast('Not enough coins!', 'error');
    }
  };

  return (
    <div className="altair-parchment flex flex-col min-h-[calc(100vh-56px)] px-4 py-6 max-w-2xl mx-auto">
      {/* Coin balance */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-(--altair-text)">Meta Shop</h2>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-(--altair-surface) border border-(--altair-warning)/30">
          <Coins size={18} className="text-(--altair-warning)" />
          <span className="text-lg font-bold text-(--altair-warning)">{coins}</span>
        </div>
      </div>

      {/* Upgrade grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {META_UPGRADES.map((def) => {
          const currentLevel = upgrades[def.id] || 0;
          const isMaxed = currentLevel >= def.maxLevel;
          const nextCost = isMaxed ? 0 : def.costs[currentLevel];
          const canAfford = coins >= nextCost;

          return (
            <div
              key={def.id}
              className={`p-4 rounded-xl border transition-colors ${
                isMaxed
                  ? 'border-(--altair-success)/30 bg-(--altair-success-dim)'
                  : 'border-(--altair-border) bg-(--altair-surface) hover:bg-(--altair-surface-hover)'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-sm text-(--altair-text)">{def.name}</h3>
                  <p className="text-xs text-(--altair-text-muted) mt-0.5">{def.description}</p>
                </div>
                {isMaxed && <Check size={16} className="text-(--altair-success) shrink-0" />}
              </div>

              {/* Level dots */}
              <div className="flex gap-1 mb-3">
                {Array.from({ length: def.maxLevel }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${
                      i < currentLevel ? 'bg-(--altair-accent)' : 'bg-(--altair-border)'
                    }`}
                  />
                ))}
              </div>

              {!isMaxed && (
                <button
                  onClick={() => handlePurchase(def.id, def.name)}
                  disabled={!canAfford}
                  className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
                    canAfford
                      ? 'bg-(--altair-accent) hover:bg-(--altair-accent-hover) text-white'
                      : 'bg-(--altair-surface-active) text-(--altair-text-dim) cursor-not-allowed'
                  }`}
                >
                  {nextCost} coins
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Back button */}
      <button
        onClick={onBack}
        className="mt-auto py-3 rounded-xl font-semibold text-(--altair-text) bg-(--altair-surface) border border-(--altair-border) hover:bg-(--altair-surface-hover) transition-colors"
      >
        Back
      </button>
    </div>
  );
}
