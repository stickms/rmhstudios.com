'use client';

import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useFocusReturn } from '@/components/shared/useFocusReturn';
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
  const { t } = useTranslation("c-cursed-logic");
  const returnFocus = useFocusReturn(open);
  const {
    fragments,
    pendingRunModifier,
    unlockedVariants,
    purchaseRunModifier,
    purchaseVariantUnlock,
  } = useShopStore();

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent onCloseAutoFocus={returnFocus} overlayClassName="bg-black/80" data-jelly="off" data-liquid-material="off" data-dialog-shell="bare" className="max-w-sm gap-0 rounded-none border-0 bg-transparent p-0 shadow-none [&>button]:hidden">
       <div className="space-y-4 rounded-xl border border-amber-500/30 bg-[#0f0f14] p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DialogTitle className="font-mono text-lg font-bold text-amber-400">{t("shop", { defaultValue: "Shop" })}</DialogTitle>
            <span className="text-amber-200/90 font-mono text-sm">({fragments} F)</span>
          </div>
          <DialogClose className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label={t("close", { defaultValue: "Close" })}>
            <X className="h-5 w-5" aria-hidden />
          </DialogClose>
        </div>
        <DialogDescription className="text-xs text-white/60">{t("shop-description", { defaultValue: "Run modifiers apply to your next run only. Unlocks add Protocol types to the random pool." })}</DialogDescription>
        <div className="space-y-4">
          {pendingRunModifier && (
            <p className="text-cyan-400/90 text-xs font-mono">
              {t("next-run", { defaultValue: "Next run:" })} {RUN_MODIFIERS[pendingRunModifier as RunModifierId]?.label ?? pendingRunModifier}
            </p>
          )}

          <div>
            <h3 className="text-amber-400/90 font-mono text-xs font-bold mb-2">{t("run-modifiers-heading", { defaultValue: "Run modifiers (next run)" })}</h3>
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
                      {isPending ? t("active", { defaultValue: "Active" }) : t("buy-cost", { defaultValue: "Buy ({{cost}} F)", cost: meta.cost })}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-amber-400/90 font-mono text-xs font-bold mb-2">{t("unlock-protocol-heading", { defaultValue: "Unlock Protocol types" })}</h3>
            <p className="text-white/50 text-xs mb-2">{t("unlock-protocol-description", { defaultValue: "Unlocked types can appear randomly in runs." })}</p>
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
                      <span className="text-cyan-400 text-xs font-mono mt-2 inline-block">{t("unlocked", { defaultValue: "Unlocked" })}</span>
                    ) : (
                      <button
                        type="button"
                        disabled={fragments < meta.cost}
                        onClick={() => purchaseVariantUnlock(id)}
                        className="mt-2 text-sm font-mono px-3 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-500/30"
                      >
                        {t("buy-cost", { defaultValue: "Buy ({{cost}} F)", cost: meta.cost })}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
       </div>
      </DialogContent>
    </Dialog>
  );
}
