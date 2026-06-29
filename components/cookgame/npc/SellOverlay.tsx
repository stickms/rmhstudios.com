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
  const buyerState = useCookgameStore((s) => s.buyerState);
  // Quantize to whole-second granularity — closed/open gate doesn't need
  // sub-second precision, drops re-renders from every frame to ~1 Hz.
  const clockSec = useCookgameStore((s) => Math.floor(s.clock / 1000));
  const clock = clockSec * 1000;

  const buyer = BUYERS.find((b) => b.id === activeOverlay);
  if (!buyer) return null;

  const closed = buyer.timeWindow ? !isOpenAt(buyer.timeWindow, clock) : false;

  const bs = buyerState[buyer.id] ?? { demand: 1, reputation: 0, preferredEffect: buyer.preferredEffect };
  const demandPct = Math.round(bs.demand * 100);
  const stars = Math.round(bs.reputation * 5);
  const wanted = EFFECTS[bs.preferredEffect];

  return (
    <OverlayFrame title={buyer.name}>
      <div className="mb-3 grid grid-cols-3 gap-2 rounded bg-neutral-800/60 px-3 py-2 font-mono text-[11px]">
        <div>
          <div className="uppercase tracking-widest text-neutral-500">Wants</div>
          <div className="mt-0.5">
            <span className="rounded-full px-2 py-0.5 text-black" style={{ backgroundColor: wanted.color }}>
              {wanted.name}
            </span>
          </div>
        </div>
        <div>
          <div className="uppercase tracking-widest text-neutral-500">Demand</div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
            <div className="h-full rounded-full bg-lime-400" style={{ width: `${demandPct}%` }} />
          </div>
          <div className="mt-0.5 text-neutral-500">{demandPct}%</div>
        </div>
        <div>
          <div className="uppercase tracking-widest text-neutral-500">Rep</div>
          <div className="mt-0.5 text-amber-400">{'★'.repeat(stars)}<span className="text-neutral-700">{'★'.repeat(5 - stars)}</span></div>
        </div>
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
