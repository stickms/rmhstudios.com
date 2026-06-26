"use client";
import { useEffect } from 'react';
import { useCookgameStore } from '@/lib/cookgame/store';
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';
import { EFFECTS } from '@/lib/cookgame/content';
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

  return (
    <OverlayFrame title="Recipe Journal">
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
