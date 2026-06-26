"use client";
import { useState, useEffect } from 'react';
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { useCookgameStore } from '@/lib/cookgame/store';
import { BASES } from '@/lib/cookgame/content';
import { canCollect, DRY_COOLDOWN_MS } from '@/lib/cookgame/cultivation';

export function DryingRackOverlay() {
  // All hooks called unconditionally before any early return.
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const dryingRack = useCookgameStore((s) => s.inventory.dryingRack);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (activeOverlay !== 'drying') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [activeOverlay]);

  if (activeOverlay !== 'drying') return null;

  return (
    <OverlayFrame title="Drying Rack">
      {dryingRack.length === 0 ? (
        <p className="font-mono text-xs text-neutral-500">Nothing drying.</p>
      ) : (
        <div className="space-y-2">
          {dryingRack.map((batch, index) => {
            const ready = canCollect(batch, now);
            const msLeft = Math.max(0, DRY_COOLDOWN_MS - (now - batch.dryStartedAt));
            const countdown = Math.ceil(msLeft / 1000);
            const qualityPct = Math.round(batch.quality * 100);
            return (
              <div
                key={index}
                className="flex items-center justify-between gap-3 rounded bg-neutral-800 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium">{BASES[batch.baseId].name}</span>
                  <span className="ml-2 font-mono text-xs text-lime-400">Q {qualityPct}%</span>
                  {!ready && (
                    <span className="ml-2 font-mono text-xs text-neutral-500">
                      {countdown}s
                    </span>
                  )}
                </div>
                <button
                  disabled={!ready}
                  onClick={() => useCookgameStore.getState().collectDried(index, Date.now())}
                  className="shrink-0 px-3 py-1.5 rounded bg-lime-600 hover:bg-lime-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {ready ? 'Collect' : 'Drying…'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </OverlayFrame>
  );
}
