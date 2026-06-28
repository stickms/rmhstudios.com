"use client";

import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { useCookgameStore } from '@/lib/cookgame/store';
import { ADDITIVES, BASES, EFFECTS, INPUTS } from '@/lib/cookgame/content';
import { SHOPS, shopItemPrice, visibleItems, BASE_PRICE } from '@/lib/cookgame/shops';
import { rankForXp } from '@/lib/cookgame/progression';
import type { AdditiveId, BaseId, InputId } from '@/lib/cookgame/types';

export function ShopOverlay() {
  // All selectors unconditionally before any early return.
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const cash = useCookgameStore((s) => s.cash);
  const xp = useCookgameStore((s) => s.xp);
  const additivesOwned = useCookgameStore((s) => s.inventory.additives);
  const inputsOwned = useCookgameStore((s) => s.inventory.inputs);
  const clock = useCookgameStore((s) => s.clock);

  const shop = activeOverlay ? SHOPS[activeOverlay] : undefined;
  if (!shop) return null;

  const rank = rankForXp(xp).rank;
  const items = visibleItems(shop, rank, clock);
  const rankItems = visibleItems(shop, rank); // rank-eligible, ignoring time
  const hasLocked = items.length < shop.items.length;
  const timeClosed = items.length === 0 && rankItems.length > 0; // hidden purely by time-of-day

  const baseItems = items.filter((i) => i.kind === 'base');
  const inputItems = items.filter((i) => i.kind === 'input');
  const additiveItems = items.filter((i) => i.kind === 'additive');

  return (
    <OverlayFrame title={shop.name}>
      {timeClosed && (
        <p className="mb-4 rounded bg-indigo-950/60 px-3 py-2 text-sm text-indigo-200">
          Closed for now — this stall only opens after dark.
        </p>
      )}
      <div className="mb-4 font-mono text-2xl text-lime-400">${cash}</div>

      {baseItems.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">Bases</h3>
          <div className="space-y-2">
            {baseItems.map((item) => {
              const base = BASES[item.refId as BaseId];
              const price = shopItemPrice(item);
              return (
                <div
                  key={item.refId}
                  className="flex items-center justify-between rounded bg-neutral-800 px-3 py-2"
                >
                  <span className="text-sm font-medium">{base.name}</span>
                  <button
                    onClick={() => useCookgameStore.getState().buyBase(item.refId as BaseId, BASE_PRICE)}
                    disabled={cash < price}
                    className="px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Buy (${price})
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {inputItems.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">Inputs</h3>
          <div className="space-y-2">
            {inputItems.map((item) => {
              const input = INPUTS[item.refId as InputId];
              const price = shopItemPrice(item);
              const owned = inputsOwned[item.refId] ?? 0;
              return (
                <div
                  key={item.refId}
                  className="flex items-center justify-between gap-3 rounded bg-neutral-800 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{input.name}</span>
                    <span className="font-mono text-xs text-neutral-500">×{owned}</span>
                  </div>
                  <button
                    onClick={() => useCookgameStore.getState().buyInput(item.refId as InputId)}
                    disabled={cash < price}
                    className="px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Buy (${price})
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {additiveItems.length > 0 && (
        <section>
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">Additives</h3>
          <div className="space-y-2">
            {additiveItems.map((item) => {
              const additive = ADDITIVES[item.refId as AdditiveId];
              const effect = EFFECTS[additive.baseEffect];
              const price = shopItemPrice(item);
              const owned = additivesOwned[item.refId] ?? 0;
              return (
                <div
                  key={item.refId}
                  className="flex items-center justify-between gap-3 rounded bg-neutral-800 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: effect.color }}
                      title={effect.name}
                    />
                    <span className="text-sm font-medium truncate">{additive.name}</span>
                    <span className="font-mono text-xs text-neutral-500">{effect.name}</span>
                    <span className="font-mono text-xs text-neutral-500">×{owned}</span>
                  </div>
                  <button
                    onClick={() => useCookgameStore.getState().buyAdditive(item.refId as AdditiveId)}
                    disabled={cash < price}
                    className="px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Buy (${price})
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {hasLocked && !timeClosed && (
        <p className="mt-4 text-xs italic text-neutral-500">
          More items unlock at higher ranks.
        </p>
      )}
    </OverlayFrame>
  );
}
