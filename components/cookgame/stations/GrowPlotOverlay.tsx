"use client";
import { useState, useEffect } from 'react';
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { useCookgameStore } from '@/lib/cookgame/store';
import { GROWABLE, BASES } from '@/lib/cookgame/content';
import { canTend, TEND_COOLDOWN_MS } from '@/lib/cookgame/cultivation';

export function GrowPlotOverlay() {
  // All hooks called unconditionally before any early return.
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const plots = useCookgameStore((s) => s.inventory.plots);
  const inputs = useCookgameStore((s) => s.inventory.inputs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeOverlay?.match(/^plot:(\d+)$/)) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [activeOverlay]);

  const match = activeOverlay?.match(/^plot:(\d+)$/);
  if (!match) return null;

  const plotIndex = Number(match[1]);
  const plot = plots[plotIndex];
  if (!plot) return null;

  return (
    <OverlayFrame title={`Grow Plot ${plotIndex + 1}`}>
      {plot.stage === 'empty' && (
        <div className="space-y-3">
          <p className="font-mono text-xs text-neutral-400 uppercase tracking-widest">
            Select a strain — requires 1 seed + 1 nutrient
          </p>
          <div className="space-y-2">
            {Object.entries(GROWABLE).map(([key, g]) => {
              const hasSeed = (inputs[g.seedId] ?? 0) > 0;
              const hasNutrient = (inputs.nutrient ?? 0) > 0;
              const disabled = !hasSeed || !hasNutrient;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded bg-neutral-800 px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{BASES[g.baseId].name}</span>
                    {!hasSeed && (
                      <span className="ml-2 font-mono text-xs text-red-400">no seeds</span>
                    )}
                    {!hasNutrient && (
                      <span className="ml-2 font-mono text-xs text-red-400">no nutrient</span>
                    )}
                  </div>
                  <button
                    disabled={disabled}
                    onClick={() =>
                      useCookgameStore.getState().plantPlot(plotIndex, key, Date.now())
                    }
                    className="shrink-0 px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Plant
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(plot.stage === 'seedling' || plot.stage === 'vegetative') && (
        <div className="space-y-4">
          <div className="rounded bg-neutral-800 px-3 py-2">
            <span className="font-mono text-xs uppercase tracking-widest text-neutral-400">
              Stage:{' '}
            </span>
            <span className="font-mono text-sm text-lime-400 capitalize">{plot.stage}</span>
            {plot.baseId && (
              <span className="ml-3 font-mono text-xs text-neutral-500">
                {BASES[plot.baseId].name}
              </span>
            )}
          </div>
          {(() => {
            const ready = canTend(plot, now);
            const msLeft =
              plot.lastAdvancedAt !== null
                ? Math.max(0, TEND_COOLDOWN_MS - (now - plot.lastAdvancedAt))
                : 0;
            const countdown = Math.ceil(msLeft / 1000);
            return (
              <button
                disabled={!ready}
                onClick={() => useCookgameStore.getState().tendPlot(plotIndex, Date.now())}
                className="w-full px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
              >
                {ready ? 'Tend (Water/Light)' : `Tend cooldown — ${countdown}s`}
              </button>
            );
          })()}
        </div>
      )}

      {plot.stage === 'flowering' && (
        <div className="space-y-4">
          <div className="rounded bg-neutral-800 px-3 py-2">
            <span className="font-mono text-xs uppercase tracking-widest text-neutral-400">
              Stage:{' '}
            </span>
            <span className="font-mono text-sm text-lime-400 capitalize">flowering</span>
            {plot.baseId && (
              <span className="ml-3 font-mono text-xs text-neutral-500">
                {BASES[plot.baseId].name}
              </span>
            )}
          </div>
          <button
            onClick={() => useCookgameStore.getState().harvestPlot(plotIndex, Date.now())}
            className="w-full px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 text-sm font-medium"
          >
            Harvest
          </button>
        </div>
      )}
    </OverlayFrame>
  );
}
