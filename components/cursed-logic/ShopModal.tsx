'use client';

import { X } from 'lucide-react';
import {
  useShopStore,
  RUN_MODIFIERS,
  VARIANT_UNLOCKS,
  type RunModifierId,
  type VariantUnlockId,
} from '@/lib/cursed-logic/shopState';

interface ShopModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShopModal({ open, onClose }: ShopModalProps) {
  const {
    fragments,
    pendingRunModifier,
    unlockedVariants,
    purchaseRunModifier,
    purchaseVariantUnlock,
    getRunModifiers,
  } = useShopStore();

  if (!open) return null;

  const mods = getRunModifiers();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Shop"
    >
      <div
        className="bg-[#0f0f14] border border-amber-500/30 rounded-xl max-w-sm w-full max-h-[85vh] overflow-y-auto shadow-2xl shadow-amber-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex justify-between items-center p-4 border-b border-white/10 bg-[#0f0f14]/95">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-amber-400 font-mono">Shop</h2>
            <span className="text-amber-200/90 font-mono text-sm">({fragments} F)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-white/60 text-xs">
            Run modifiers apply to your next run only. Unlocks add Protocol types to the random pool.
          </p>
          {pendingRunModifier && (
            <p className="text-cyan-400/90 text-xs font-mono">
              Next run: {RUN_MODIFIERS[pendingRunModifier as RunModifierId]?.label ?? pendingRunModifier}
            </p>
          )}

          <div>
            <h3 className="text-amber-400/90 font-mono text-xs font-bold mb-2">Run modifiers (next run)</h3>
            <div className="space-y-2">
              {(Object.keys(RUN_MODIFIERS) as RunModifierId[]).map((id) => {
                const meta = RUN_MODIFIERS[id];
                const isPending = pendingRunModifier === id;
                return (
                  <div
                    key={id}
                    className={`rounded-lg border p-3 ${isPending ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-white/5'}`}
                  >
                    <div className="font-mono font-bold text-white text-sm">{meta.label}</div>
                    <div className="text-white/60 text-xs mt-1">{meta.description}</div>
                    <button
                      type="button"
                      disabled={fragments < meta.cost || isPending}
                      onClick={() => purchaseRunModifier(id)}
                      className="mt-2 text-sm font-mono px-3 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-500/30"
                    >
                      {isPending ? 'Active' : `Buy (${meta.cost} F)`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-amber-400/90 font-mono text-xs font-bold mb-2">Unlock Protocol types</h3>
            <p className="text-white/50 text-xs mb-2">Unlocked types can appear randomly in runs.</p>
            <div className="space-y-2">
              {(Object.keys(VARIANT_UNLOCKS) as VariantUnlockId[]).map((id) => {
                const meta = VARIANT_UNLOCKS[id];
                const owned = unlockedVariants.includes(meta.variant);
                return (
                  <div
                    key={id}
                    className={`rounded-lg border p-3 ${owned ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-white/5'}`}
                  >
                    <div className="font-mono font-bold text-white text-sm">{meta.label}</div>
                    <div className="text-white/60 text-xs mt-1">{meta.description}</div>
                    {owned ? (
                      <span className="text-cyan-400 text-xs font-mono mt-2 inline-block">Unlocked</span>
                    ) : (
                      <button
                        type="button"
                        disabled={fragments < meta.cost}
                        onClick={() => purchaseVariantUnlock(id)}
                        className="mt-2 text-sm font-mono px-3 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-500/30"
                      >
                        Buy ({meta.cost} F)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
