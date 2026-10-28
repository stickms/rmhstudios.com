/**
 * The 3D player and item pieces of the loadout builder, for other parts of the TF2 tools to use (the HUD
 * editor shows them behind and inside HUD panels). One import surface, so the builder's internals can change
 * without breaking its users, and nothing here has the builder's boxed chrome: these are scenery.
 *
 * Everything degrades to nothing (or an item icon) when WebGL, the model list or the catalog is missing, so
 * a page built on them never has to handle those cases.
 */
'use client';

import { Suspense, useMemo } from 'react';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import { modelItemId, type CatalogItem, type TfClass } from '@/lib/tf2-loadout/catalog-types';
import { sampleInventory, type SampleInventory } from '@/lib/tf2-loadout/sample';
import { animUrl } from '@/lib/tf2-loadout/use-anims';
import { useCatalog } from '@/lib/tf2-loadout/use-catalog';
import { modelUrl, pickModel, useModelIds } from '@/lib/tf2-loadout/use-models';
import { supportsWebGL } from '@/lib/shared/platform';
import { cn } from '@/lib/utils';
import ItemModelViewer from './ItemModelViewer';
import { PlayerScene, usePlayerParts, type WornItem } from './PlayerViewer';
import { ItemIcon } from './ItemTile';
import { wornItems } from './worn';

export { ItemIcon, type WornItem };
export { rarityBackground } from '@/lib/tf2-loadout/rarity';
export { qualityAccent } from '@/lib/tf2-loadout/catalog-types';

/** The class with what it is wearing, animated, on a transparent background, with no controls. */
export function PlayerStage({
  cls,
  worn,
  className,
}: {
  cls: string;
  worn: readonly WornItem[];
  className?: string;
}) {
  const { ids, webgl, body, bodygroups, parts, clip } = usePlayerParts({ cls, worn });
  if (!webgl || !ids || !body) return null;
  return (
    <div className={cn('size-full', className)} aria-hidden>
      <SilentErrorBoundary key={cls} label="tf2-stage" fallback={null}>
        <Suspense fallback={null}>
          <PlayerScene
            bare
            body={modelUrl(body)}
            bodygroups={bodygroups}
            parts={parts}
            tauntUrl={clip ? animUrl(cls, clip) : undefined}
          />
        </Suspense>
      </SilentErrorBoundary>
    </div>
  );
}

/** One item in 3D when it has a model, otherwise its icon. */
export function ItemStage({
  item,
  cls,
  className,
}: {
  item: CatalogItem;
  cls?: string;
  className?: string;
}) {
  const ids = useModelIds();
  const webgl = useMemo(() => (typeof window === 'undefined' ? true : supportsWebGL()), []);
  const id = modelItemId(item);
  const model = ids && webgl ? pickModel(ids, id, cls) : null;
  if (!model) return <ItemIcon item={item} className={className} />;
  return (
    <ItemModelViewer
      itemId={id}
      cls={cls}
      className={cn('h-full min-h-0 border-0 bg-transparent', className)}
    />
  );
}

export type SampleResult = SampleInventory & { worn: WornItem[] };

/** A plausible inventory for `cls` (null until the catalog has loaded). */
export function useSampleInventory(cls: TfClass): SampleResult | null {
  const state = useCatalog();
  const index = state.status === 'ready' ? state.index : null;
  const ids = useModelIds();
  return useMemo(() => {
    if (!index) return null;
    const inv = sampleInventory(
      index.catalog,
      cls,
      (id) => !ids || pickModel(ids, id, cls) !== null,
    );
    return { ...inv, worn: wornItems(index, cls, inv.slots, inv.cosmeticKeys) };
  }, [index, ids, cls]);
}
