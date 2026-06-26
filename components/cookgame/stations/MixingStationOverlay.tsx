"use client";
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { useCookgameStore } from '@/lib/cookgame/store';
import { ADDITIVES, EFFECTS } from '@/lib/cookgame/content';
import { mix, productValue } from '@/lib/cookgame/effects';
import type { AdditiveId, EffectId, Product } from '@/lib/cookgame/types';

function EffectChips({ effects }: { effects: EffectId[] }) {
  if (effects.length === 0) {
    return <span className="font-mono text-xs text-neutral-500">no effects yet</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {effects.map((e) => (
        <span
          key={e}
          className="rounded-full px-2 py-0.5 font-mono text-xs text-black"
          style={{ backgroundColor: EFFECTS[e].color }}
        >
          {EFFECTS[e].name}
        </span>
      ))}
    </div>
  );
}

export function MixingStationOverlay() {
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const workProduct = useCookgameStore((s) => s.inventory.workProduct);
  const additives = useCookgameStore((s) => s.inventory.additives);
  const rawBases = useCookgameStore((s) => s.inventory.rawBases);

  if (activeOverlay !== 'mixing') return null;

  const loadBaseToBench = useCookgameStore.getState().loadBaseToBench;
  const mixIn = useCookgameStore.getState().mixIn;
  const packageBench = useCookgameStore.getState().packageBench;

  const ownedAdditives = (Object.entries(additives) as [AdditiveId, number][]).filter(
    ([, count]) => count > 0,
  );
  const greenStartOwned = rawBases['greenstart'] ?? 0;

  return (
    <OverlayFrame title="Mixing Bench">
      {!workProduct ? (
        <div className="space-y-3">
          <button
            onClick={() => loadBaseToBench('greenstart')}
            disabled={greenStartOwned <= 0}
            className="px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
          >
            Load Green Start
          </button>
          {greenStartOwned <= 0 && (
            <p className="font-mono text-xs text-neutral-500">Buy a base at the Supplier first</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded bg-neutral-800 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-widest text-neutral-400">
                Bench
              </span>
              <span className="font-mono text-lg text-lime-400">${productValue(workProduct)}</span>
            </div>
            <EffectChips effects={workProduct.effects} />
          </div>

          <section>
            <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">
              Additives
            </h3>
            {ownedAdditives.length === 0 ? (
              <p className="font-mono text-xs text-neutral-500">
                No additives owned — buy some at the Supplier.
              </p>
            ) : (
              <div className="space-y-2">
                {ownedAdditives.map(([id, count]) => {
                  const preview: Product = mix(workProduct, id);
                  const delta = productValue(preview) - productValue(workProduct);
                  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
                  const deltaClass = delta > 0 ? 'text-lime-400' : 'text-neutral-400';
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-3 rounded bg-neutral-800 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: EFFECTS[ADDITIVES[id].baseEffect].color }}
                        />
                        <span className="text-sm font-medium truncate">{ADDITIVES[id].name}</span>
                        <span className="font-mono text-xs text-neutral-500">×{count}</span>
                        <span className={`font-mono text-xs ${deltaClass}`}>{deltaLabel}</span>
                      </div>
                      <button
                        onClick={() => mixIn(id)}
                        disabled={count <= 0}
                        className="px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        Mix
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <button
            onClick={() => packageBench()}
            disabled={!workProduct}
            className="w-full px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
          >
            Package this batch (×5)
          </button>
        </div>
      )}
    </OverlayFrame>
  );
}
