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
 * The model to show for an item worn by `cls`: its per-class variant when one
 * was uploaded, otherwise the shared model, otherwise none.
 */
export function pickModel(ids: ReadonlySet<string>, itemId: number, cls?: string): string | null {
  if (cls && ids.has(`${itemId}_${cls}`)) return `${itemId}_${cls}`;
  return ids.has(String(itemId)) ? String(itemId) : null;
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
