"use client";
import { useCookgameStore } from '@/lib/cookgame/store';
import { BUYERS, EFFECTS } from '@/lib/cookgame/content';
import { buyerOffer } from '@/lib/cookgame/economy';
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import type { EffectId } from '@/lib/cookgame/types';
import { isOpenAt } from '@/lib/cookgame/timeOfDay';

function EffectChips({ effects }: { effects: EffectId[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {effects.map((e, i) => (
        <span
          key={`${e}-${i}`}
          className="rounded-full px-2 py-0.5 text-xs font-medium text-black"
          style={{ backgroundColor: EFFECTS[e].color }}
        >
          {EFFECTS[e].name}
        </span>
      ))}
    </div>
  );
}

export function SellOverlay() {
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const packaged = useCookgameStore((s) => s.inventory.packaged);
  const heat = useCookgameStore((s) => s.heat);
  // Quantize to whole-second granularity — closed/open gate doesn't need
  // sub-second precision, drops re-renders from every frame to ~1 Hz.
  const clockSec = useCookgameStore((s) => Math.floor(s.clock / 1000));
  const clock = clockSec * 1000;

  const buyer = BUYERS.find((b) => b.id === activeOverlay);
  if (!buyer) return null;

  const closed = buyer.timeWindow ? !isOpenAt(buyer.timeWindow, clock) : false;

  const prefEffect = EFFECTS[buyer.preferredEffect];

  return (
    <OverlayFrame title={buyer.name}>
      <div className="mb-4 flex items-center gap-2 text-sm text-neutral-300">
        <span className="font-mono text-xs uppercase tracking-widest text-neutral-400">Prefers:</span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium text-black"
          style={{ backgroundColor: prefEffect.color }}
        >
          {prefEffect.name}
        </span>
      </div>

      {closed ? (
        <p className="text-sm text-indigo-300">{buyer.name} only deals after dark. Come back at night.</p>
      ) : packaged.length === 0 ? (
        <p className="text-sm text-neutral-400">Nothing packaged to sell.</p>
      ) : (
        <div className="space-y-2">
          {packaged.map((stack, i) => {
            const offer = buyerOffer(stack.product, buyer, heat, 1);
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded bg-neutral-800 px-3 py-2"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <EffectChips effects={stack.product.effects} />
                  <div className="flex items-center gap-2 font-mono text-xs text-neutral-500">
                    <span>${offer}/unit</span>
                    <span>×{stack.units}</span>
                  </div>
                </div>
                <button
                  onClick={() => useCookgameStore.getState().sellUnit(buyer.id, i, 1)}
                  className="px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 text-sm font-medium"
                >
                  Sell 1 unit (${offer})
                </button>
              </div>
            );
          })}
        </div>
      )}
    </OverlayFrame>
  );
}
