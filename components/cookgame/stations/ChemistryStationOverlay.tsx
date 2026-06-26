"use client";
import { useState } from 'react';
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { useCookgameStore } from '@/lib/cookgame/store';
import { BASES, COOKABLE_BASES } from '@/lib/cookgame/content';
import { feedbackBand } from '@/lib/cookgame/chemistry';
import type { BaseId } from '@/lib/cookgame/types';

const BAND_STYLES: Record<'hot' | 'warm' | 'cold', string> = {
  hot:  'bg-red-600 text-white',
  warm: 'bg-amber-500 text-black',
  cold: 'bg-blue-600 text-white',
};

const BAND_LABELS: Record<'hot' | 'warm' | 'cold', string> = {
  hot:  'HOT',
  warm: 'WARM',
  cold: 'COLD',
};

export function ChemistryStationOverlay() {
  // ALL hooks unconditionally before any early return
  const [lastQuality, setLastQuality] = useState<number | null>(null);
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const cookSession   = useCookgameStore((s) => s.cookSession);
  const inputs        = useCookgameStore((s) => s.inventory.inputs);

  if (activeOverlay !== 'chem') return null;

  const reagentCount = inputs.reagent ?? 0;

  const handleStart = (baseId: BaseId) => {
    setLastQuality(null);
    useCookgameStore.getState().startCook(baseId);
  };

  const handleSetDial = (i: number, value: number) => {
    setLastQuality(null);
    useCookgameStore.getState().setDial(i, value);
  };

  const handleSubmit = () => {
    const q = useCookgameStore.getState().submitCook();
    setLastQuality(q);
  };

  return (
    <OverlayFrame title="Chemistry Station">
      {!cookSession ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-neutral-400">Reagent Packs:</span>
            <span className="font-mono text-sm text-lime-400">{reagentCount}</span>
          </div>
          {reagentCount <= 0 && (
            <p className="font-mono text-xs text-neutral-500">
              Needs 1 Reagent Pack — buy one at the Supplier.
            </p>
          )}
          <div className="space-y-2">
            {COOKABLE_BASES.map((id) => (
              <button
                key={id}
                onClick={() => handleStart(id)}
                disabled={reagentCount <= 0}
                className="w-full rounded bg-lime-600 px-3 py-2 text-sm font-medium hover:bg-lime-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start Cook — {BASES[id].name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Feedback chip */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-neutral-400">
              Signal
            </span>
            {(() => {
              const band = feedbackBand(cookSession.dials, cookSession.target);
              return (
                <span
                  className={`rounded-full px-3 py-0.5 font-mono text-xs font-bold ${BAND_STYLES[band]}`}
                >
                  {BAND_LABELS[band]}
                </span>
              );
            })()}
          </div>

          {/* Three ratio dials */}
          <div className="space-y-3">
            {cookSession.dials.map((val, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-xs text-neutral-400">
                    Dial {i + 1}
                  </label>
                  <span className="font-mono text-xs text-neutral-300">
                    {Math.round(val * 100)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={val}
                  onChange={(e) => handleSetDial(i, Number(e.target.value))}
                  className="w-full accent-lime-500"
                />
              </div>
            ))}
          </div>

          {/* Cook button + transient result */}
          <div className="space-y-2">
            <button
              onClick={handleSubmit}
              className="w-full rounded bg-lime-600 px-3 py-2 text-sm font-medium hover:bg-lime-500"
            >
              Cook!
            </button>
            {lastQuality !== null && (
              <p className="font-mono text-center text-sm text-lime-400">
                Quality {Math.round(lastQuality * 100)}%
              </p>
            )}
          </div>
        </div>
      )}
    </OverlayFrame>
  );
}
