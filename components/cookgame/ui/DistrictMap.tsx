"use client";
import { useEffect } from 'react';
import { useCookgameStore } from '@/lib/cookgame/store';
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { DISTRICTS, isDistrictUnlocked } from '@/lib/cookgame/districts';
import { rankForXp, RANKS } from '@/lib/cookgame/progression';

function gateLabel(gate: { type: 'rank'; rank: number } | { type: 'key'; keyId: string } | null): string {
  if (!gate) return 'Always open';
  if (gate.type === 'rank') return `Requires rank: ${RANKS[gate.rank]?.name ?? gate.rank}`;
  return 'Requires key';
}

export function DistrictMap() {
  // All selectors unconditionally before any early-return gate.
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const xp = useCookgameStore((s) => s.xp);
  const keys = useCookgameStore((s) => s.keys);
  const currentDistrict = useCookgameStore((s) => s.currentDistrict);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const current = useCookgameStore.getState().activeOverlay;
      if (current === null) useCookgameStore.getState().setActiveOverlay('map');
      else if (current === 'map') useCookgameStore.getState().setActiveOverlay(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (activeOverlay !== 'map') return null;

  const rank = rankForXp(xp).rank;

  return (
    <OverlayFrame title="District Map">
      <ul className="flex flex-col gap-3">
        {Object.values(DISTRICTS).map((d) => {
          const unlocked = isDistrictUnlocked(d.id, rank, keys);
          const isCurrent = d.id === currentDistrict;
          return (
            <li
              key={d.id}
              className={`flex items-center justify-between rounded border px-4 py-3 font-mono text-sm transition-colors ${
                isCurrent
                  ? 'border-lime-500 bg-lime-900/40 text-lime-300'
                  : 'border-neutral-700 bg-neutral-800 text-neutral-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={isCurrent ? 'text-lime-400 font-bold' : 'text-neutral-200'}>
                  {d.name}
                </span>
                {isCurrent && (
                  <span className="rounded bg-lime-600/60 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-lime-200">
                    You are here
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[12px]">
                {unlocked ? (
                  <span className="text-lime-400">✓ Unlocked</span>
                ) : (
                  <>
                    <span className="text-neutral-500">🔒</span>
                    <span className="text-neutral-400">{gateLabel(d.gate)}</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </OverlayFrame>
  );
}
