"use client";
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { useCookgameStore } from '@/lib/cookgame/store';
import { ADDITIVES, BASES, EFFECTS, INPUTS } from '@/lib/cookgame/content';

const BASE_PRICE = 10;

export function SupplierShopOverlay() {
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const cash = useCookgameStore((s) => s.cash);
  const additivesOwned = useCookgameStore((s) => s.inventory.additives);
  const inputsOwned = useCookgameStore((s) => s.inventory.inputs);

  if (activeOverlay !== 'supplier') return null;

  const buyBase = useCookgameStore.getState().buyBase;
  const buyAdditive = useCookgameStore.getState().buyAdditive;
  const buyInput = useCookgameStore.getState().buyInput;

  return (
    <OverlayFrame title="Supplier">
      <div className="mb-4 font-mono text-2xl text-lime-400">${cash}</div>

      <section className="mb-5">
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">Bases</h3>
        <div className="space-y-2">
          {Object.values(BASES).map((base) => (
            <div
              key={base.id}
              className="flex items-center justify-between rounded bg-neutral-800 px-3 py-2"
            >
              <span className="text-sm font-medium">{base.name}</span>
              <button
                onClick={() => buyBase(base.id, BASE_PRICE)}
                disabled={cash < BASE_PRICE}
                className="px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
              >
                Buy (${BASE_PRICE})
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-5">
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">Inputs</h3>
        <div className="space-y-2">
          {Object.values(INPUTS).map((i) => {
            const owned = inputsOwned[i.id] ?? 0;
            return (
              <div
                key={i.id}
                className="flex items-center justify-between gap-3 rounded bg-neutral-800 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{i.name}</span>
                  <span className="font-mono text-xs text-neutral-500">×{owned}</span>
                </div>
                <button
                  onClick={() => buyInput(i.id)}
                  disabled={cash < i.cost}
                  className="px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Buy (${i.cost})
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">Additives</h3>
        <div className="space-y-2">
          {Object.values(ADDITIVES).map((a) => {
            const effect = EFFECTS[a.baseEffect];
            const owned = additivesOwned[a.id] ?? 0;
            return (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded bg-neutral-800 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: effect.color }}
                    title={effect.name}
                  />
                  <span className="text-sm font-medium truncate">{a.name}</span>
                  <span className="font-mono text-xs text-neutral-500">{effect.name}</span>
                  <span className="font-mono text-xs text-neutral-500">×{owned}</span>
                </div>
                <button
                  onClick={() => buyAdditive(a.id)}
                  disabled={cash < a.cost}
                  className="px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Buy (${a.cost})
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </OverlayFrame>
  );
}
