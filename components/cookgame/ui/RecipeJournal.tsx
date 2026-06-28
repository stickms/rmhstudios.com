"use client";
import { useEffect } from 'react';
import { useCookgameStore } from '@/lib/cookgame/store';
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { EFFECTS } from '@/lib/cookgame/content';
import { effectCatalog } from '@/lib/cookgame/journal';
import type { EffectId } from '@/lib/cookgame/types';

function EffectChip({ id }: { id: EffectId }) {
  const effect = EFFECTS[id];
  if (!effect) {
    return (
      <span className="rounded-full bg-neutral-700 px-2 py-0.5 font-mono text-[11px] text-neutral-300">
        {id}
      </span>
    );
  }
  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold text-black"
      style={{ backgroundColor: effect.color }}
    >
      {effect.name}
    </span>
  );
}

export function RecipeJournal() {
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const discoveredRecipes = useCookgameStore((s) => s.discoveredRecipes);
  const discoveredEffects = useCookgameStore((s) => s.discoveredEffects);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'j') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const current = useCookgameStore.getState().activeOverlay;
      if (current === null) useCookgameStore.getState().setActiveOverlay('journal');
      else if (current === 'journal') useCookgameStore.getState().setActiveOverlay(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (activeOverlay !== 'journal') return null;

  const catalog = effectCatalog(discoveredEffects);
  const discoveredCount = catalog.filter((e) => e.discovered).length;

  return (
    <OverlayFrame title="Recipe Journal">
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-neutral-400">
          <span>Effect Catalog</span>
          <span className="text-neutral-500">{discoveredCount}/{catalog.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {catalog.map((e) =>
            e.discovered ? (
              <div
                key={e.id}
                className="flex items-center justify-between gap-2 rounded px-2 py-1 text-black"
                style={{ backgroundColor: e.color }}
              >
                <span className="font-mono text-[11px] font-semibold">{e.name}</span>
                <span className="font-mono text-[10px] opacity-80">T{e.tier} ×{e.multiplier}</span>
              </div>
            ) : (
              <div
                key={e.id}
                className="flex items-center justify-between gap-2 rounded border border-neutral-700 bg-neutral-800/60 px-2 py-1"
              >
                <span className="font-mono text-[11px] text-neutral-600">???</span>
                <span className="font-mono text-[10px] text-neutral-700">T{e.tier}</span>
              </div>
            ),
          )}
        </div>
      </section>
      {discoveredRecipes.length === 0 ? (
        <p className="font-mono text-sm text-neutral-400">
          No recipes discovered yet — start mixing.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {discoveredRecipes.map((key) => {
            const ids = key.split('+').filter(Boolean) as EffectId[];
            return (
              <li
                key={key}
                className="flex flex-wrap items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
              >
                {ids.map((id, i) => (
                  <EffectChip key={`${id}-${i}`} id={id} />
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </OverlayFrame>
  );
}
