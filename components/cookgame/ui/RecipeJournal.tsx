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
  const recipeMeta = useCookgameStore((s) => s.recipeMeta);

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

  const sortedRecipes = [...discoveredRecipes].sort((a, b) => {
    const ma = recipeMeta[a] ?? {}, mb = recipeMeta[b] ?? {};
    if (!!mb.favorite !== !!ma.favorite) return mb.favorite ? 1 : -1;
    return (mb.bestValue ?? 0) - (ma.bestValue ?? 0) || a.localeCompare(b);
  });

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
          {sortedRecipes.map((key) => {
            const ids = key.split('+').filter(Boolean) as EffectId[];
            const meta = recipeMeta[key] ?? {};
            return (
              <li
                key={key}
                className="flex flex-col gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => useCookgameStore.getState().toggleRecipeFavorite(key)}
                    className={`shrink-0 text-base leading-none ${meta.favorite ? 'text-amber-400' : 'text-neutral-600 hover:text-neutral-400'}`}
                    title={meta.favorite ? 'Unfavorite' : 'Favorite'}
                    aria-label={meta.favorite ? 'Unfavorite recipe' : 'Favorite recipe'}
                  >
                    {meta.favorite ? '★' : '☆'}
                  </button>
                  <input
                    defaultValue={meta.name ?? ''}
                    placeholder="Name this recipe…"
                    onBlur={(e) => useCookgameStore.getState().setRecipeName(key, e.target.value)}
                    className="min-w-0 flex-1 rounded bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-lime-500"
                  />
                  {meta.bestValue != null && (
                    <span className="shrink-0 font-mono text-[11px] text-lime-400">${meta.bestValue}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ids.map((id, i) => (
                    <EffectChip key={`${id}-${i}`} id={id} />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </OverlayFrame>
  );
}
