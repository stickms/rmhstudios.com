/**
 * The 3D content of a HUD preview: the game draws models into some panels (a class in the class menu, an item
 * in a backpack cell, the store's preview) and the HUD files only say where. This puts the loadout builder's
 * own 3D player and items there, over the preview canvas, and optionally a player behind the whole HUD.
 *
 * Decoration only: it takes no pointer events (the canvas underneath stays the thing you click), and a
 * handful of live WebGL views are shown at a time, the rest being item icons, because each is a GL context.
 */
'use client';

import { useMemo } from 'react';
import { backpackGrid } from '@/lib/tf2-hud/scene/inventory';
import {
  classHint,
  isModelPanel,
  ITEM_PANELS,
  PLAYER_PANELS,
} from '@/lib/tf2-hud/scene/model-panels';
import type { PanelNode, Scene } from '@/lib/tf2-hud/scene/types';
import { COND_ENVS } from '@/lib/tf2-hud/scheme/cond';
import { useEditor } from '@/lib/tf2-hud/store';
import type { TfClass } from '@/lib/tf2-loadout/catalog-types';
import { cn } from '@/lib/utils';
import {
  ItemIcon,
  ItemStage,
  PlayerStage,
  qualityAccent,
  rarityBackground,
  useSampleInventory,
} from './loadout/embed';

const BACKPACK_NODE = /(^|\/)backpackpanel\.res$/i;

/** At most this many live WebGL views at once; everything beyond shows an icon or nothing. */
export const MAX_LIVE_VIEWS = 4;
/** A panel smaller than this (scene pixels) is too small to be worth a 3D view. */
const MIN_LIVE_PX = 56;

const place = (r: PanelNode['rect'], k: number): React.CSSProperties => ({
  position: 'absolute',
  left: r.x * k,
  top: r.y * k,
  width: r.w * k,
  height: r.h * k,
});

function ModelContent({
  scene,
  zoom,
  front,
}: {
  scene: Scene;
  /** CSS pixels per scene pixel. */
  zoom: number;
  /** `true` draws over the HUD canvas (model panels); `false` behind it (the world player). */
  front: boolean;
}) {
  const test = useEditor((s) => s.test);
  const view = useEditor((s) => s.view);
  const readText = useEditor((s) => s.readText);
  const cls = test.playerClass as TfClass;
  const sample = useSampleInventory(cls);

  const panels = useMemo(
    () =>
      scene && view.models3d ? scene.nodes.filter((n) => n.shown && isModelPanel(n.control)) : [],
    [scene, view.models3d],
  );
  const cells = useMemo(
    () => (scene && view.models3d ? backpackGrid(scene, readText, COND_ENVS[view.env]) : []),
    [scene, view.models3d, readText, view.env],
  );

  if (!scene) return null;

  if (!front) {
    // The world player: behind everything, bottom-left of the screen like a third-person camera.
    if (!view.player3d) return null;
    return (
      <div className="pointer-events-none absolute inset-y-0 start-[8%] w-[34%]" aria-hidden>
        <PlayerStage cls={cls} worn={sample?.worn ?? []} />
      </div>
    );
  }

  let live = 0;
  const budget = () => live++ < MAX_LIVE_VIEWS;
  const items = sample?.backpack ?? [];
  let itemIndex = 0;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {panels.map((n) => {
        const big = n.rect.w >= MIN_LIVE_PX && n.rect.h >= MIN_LIVE_PX;
        if (PLAYER_PANELS.test(n.control)) {
          return big && budget() ? (
            <div key={n.id} style={place(n.rect, zoom)}>
              <PlayerStage
                cls={classHint(n.name, test.playerClass)}
                worn={
                  classHint(n.name, test.playerClass) === test.playerClass
                    ? (sample?.worn ?? [])
                    : []
                }
              />
            </div>
          ) : null;
        }
        const item = items[itemIndex++ % Math.max(1, items.length)];
        if (!item) return null;
        const live3d = ITEM_PANELS.test(n.control) && big && budget();
        return (
          <div key={n.id} style={place(n.rect, zoom)} className="p-0.5">
            {live3d ? <ItemStage item={item} cls={cls} /> : <ItemIcon item={item} />}
          </div>
        );
      })}
      {cells.map((c) => {
        const item = items[c.index];
        return (
          <div
            key={`cell-${c.index}`}
            style={{
              ...place(c.rect, zoom),
              ...(item
                ? {
                    borderColor: qualityAccent(item.q) ?? undefined,
                    backgroundColor: item.rt ? rarityBackground(item.rt) : undefined,
                  }
                : {}),
            }}
            className={cn(
              'overflow-hidden rounded-(--app-radius-sm) border-2 border-(--app-border) bg-(--app-bg)/60 p-0.5',
            )}
          >
            {item ? <ItemIcon item={item} /> : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Mounts the 3D content only where there is some: a page with no model panels, no backpack and no world
 * player does not even fetch the item catalog.
 */
export default function ModelLayer({
  scene,
  zoom,
  front,
  enabled = true,
}: {
  scene: Scene | null;
  /** CSS pixels per scene pixel. */
  zoom: number;
  /** `true` draws over the HUD canvas (model panels); `false` behind it (the world player). */
  front: boolean;
  /** Whether model panels are drawn at all on this page. */
  enabled?: boolean;
}) {
  const player3d = useEditor((s) => s.view.player3d);
  const hasContent = useMemo(
    () =>
      !!scene &&
      scene.nodes.some((n) => n.shown && (isModelPanel(n.control) || BACKPACK_NODE.test(n.file))),
    [scene],
  );
  if (!scene) return null;
  if (front ? !(enabled && hasContent) : !player3d) return null;
  return <ModelContent scene={scene} zoom={zoom} front={front} />;
}
