/**
 * Which items have a 3D model. One fetch per page load, shared by every viewer.
 */
'use client';

import { useEffect, useState } from 'react';
import { request } from '@/lib/tf2-hud/api';

let pending: Promise<Set<number>> | null = null;

function loadModelIds(): Promise<Set<number>> {
  pending ??= request<{ ids: number[] }>('/api/tf2-loadout/models').then((r) => new Set(r.ids));
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

export const modelUrl = (id: number): string => `/api/tf2-loadout/models/${id}.glb`;

/** `null` while loading or if the list is unavailable; otherwise the set of defindexes with a model. */
export function useModelIds(): Set<number> | null {
  const [ids, setIds] = useState<Set<number> | null>(null);
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
