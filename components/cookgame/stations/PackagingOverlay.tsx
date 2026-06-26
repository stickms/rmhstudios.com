"use client";
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { useCookgameStore } from '@/lib/cookgame/store';
import { EFFECTS } from '@/lib/cookgame/content';
import { productValue } from '@/lib/cookgame/effects';
import type { EffectId } from '@/lib/cookgame/types';

function EffectChips({ effects }: { effects: EffectId[] }) {
  if (effects.length === 0) {
    return <span className="font-mono text-xs text-neutral-500">no effects</span>;
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

export function PackagingOverlay() {
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const workProduct = useCookgameStore((s) => s.inventory.workProduct);
  const packaged = useCookgameStore((s) => s.inventory.packaged);

  if (activeOverlay !== 'packaging') return null;

  const packageBench = useCookgameStore.getState().packageBench;

  return (
    <OverlayFrame title="Packaging">
      <section className="mb-5">
        {workProduct ? (
          <div className="space-y-3 rounded bg-neutral-800 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-widest text-neutral-400">
                On the bench
              </span>
              <div className="flex items-center gap-2">
                {workProduct.qualityMult !== undefined && workProduct.qualityMult !== 1 && (
                  <span className="font-mono text-xs text-lime-400">
                    Q {Math.round(workProduct.qualityMult * 100)}%
                  </span>
                )}
                <span className="font-mono text-lg text-lime-400">${productValue(workProduct)}</span>
              </div>
            </div>
            <EffectChips effects={workProduct.effects} />
            <button
              onClick={() => packageBench()}
              className="px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 text-sm font-medium"
            >
              Package (×5 units)
            </button>
          </div>
        ) : (
          <p className="font-mono text-xs text-neutral-500">
            No batch on the bench — mix a product first.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">
          Packaged stock
        </h3>
        {packaged.length === 0 ? (
          <p className="font-mono text-xs text-neutral-500">No packaged stacks yet.</p>
        ) : (
          <div className="space-y-2">
            {packaged.map((stack, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded bg-neutral-800 px-3 py-2"
              >
                <EffectChips effects={stack.product.effects} />
                <div className="flex shrink-0 items-center gap-3">
                  {stack.product.qualityMult !== undefined && stack.product.qualityMult !== 1 && (
                    <span className="font-mono text-xs text-lime-400">
                      Q {Math.round(stack.product.qualityMult * 100)}%
                    </span>
                  )}
                  <span className="font-mono text-sm text-lime-400">
                    ${productValue(stack.product)}
                  </span>
                  <span className="font-mono text-sm text-neutral-400">×{stack.units}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </OverlayFrame>
  );
}
