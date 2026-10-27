/**
 * Which items have a 3D model. One fetch per page load, shared by every viewer.
 */
'use client';

import { useEffect, useState } from 'react';
import { request } from '@/lib/tf2-hud/api';

let pending: Promise<Set<string>> | null = null;

function loadModelIds(): Promise<Set<string>> {
  pending ??= request<{ ids: string[] }>('/api/tf2-loadout/models').then((r) => new Set(r.ids));
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

export const modelUrl = (name: string): string => `/api/tf2-loadout/models/${name}.glb`;

/**
 * The model to show for an item worn by `cls` in `style`: the style's own file (per-class, then shared)
 * when the sync published one, else the item's per-class variant, else the shared model, else none.
 */
export function pickModel(
  ids: ReadonlySet<string>,
  itemId: number,
  cls?: string,
  style?: number,
): string | null {
  const stem = String(itemId);
  const tries = [
    ...(style !== undefined && style > 0
      ? [...(cls ? [`${stem}_${cls}_s${style}`] : []), `${stem}_s${style}`]
      : []),
    ...(cls ? [`${stem}_${cls}`] : []),
    stem,
  ];
  return tries.find((n) => ids.has(n)) ?? null;
}

/** `null` while loading or if the list is unavailable; otherwise the set of model names that exist. */
export function useModelIds(): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let alive = true;
    loadModelIds().then(
      (s) => alive && setIds(s),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return ids;
}

/** The class body model, once the sync has published it. */
export const classModel = (ids: ReadonlySet<string>, cls: string): string | null =>
  ids.has(`class_${cls}`) ? `class_${cls}` : null;
