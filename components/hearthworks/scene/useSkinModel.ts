'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SkinId } from '@/lib/hearthworks/skins';
import { getManifest, loadManifest, subscribeManifest, type ModelEntry } from '@/lib/hearthworks/skins/model-manifest';
import {
  isModelBad,
  loadSkinModel,
  loadedModel,
  modelsEnabled,
  type LoadedModel,
} from '@/lib/hearthworks/skins/model-loader';

export interface SkinModelState {
  /** `none`: this skin has no model (or models are off); `loading`: coming; `ready`: `model` is set. */
  status: 'none' | 'loading' | 'ready';
  model: LoadedModel | null;
  entry: ModelEntry | undefined;
}

const NONE: SkinModelState = { status: 'none', model: null, entry: undefined };

/** The manifest entry for a skin, or undefined. Starts the manifest download on first use. */
export function useModelEntry(skin: SkinId): ModelEntry | undefined {
  const manifest = useSyncExternalStore(subscribeManifest, getManifest, getManifest);
  useEffect(() => {
    void loadManifest();
  }, []);
  return manifest.models[skin];
}

/**
 * The loaded model for a skin. `wanted` false keeps it from downloading (a figure too far away to deserve a model).
 * `eager` is for the player's own skin and the wardrobe preview: they jump the download queue.
 */
export function useSkinModel(skin: SkinId, wanted = true, eager = false): SkinModelState {
  const entry = useModelEntry(skin);
  const [fetched, setFetched] = useState<LoadedModel | null>(null);
  const usable = wanted && !!entry && !isModelBad(skin) && modelsEnabled();

  useEffect(() => {
    if (!usable || !entry) return;
    let live = true;
    void loadSkinModel(skin, entry, { eager }).then((m) => {
      if (live && m) setFetched(m);
    });
    return () => {
      live = false;
    };
  }, [usable, skin, entry, eager]);

  if (!usable) return NONE;
  const model = fetched?.skin === skin ? fetched : loadedModel(skin);
  return model ? { status: 'ready', model, entry } : { status: 'loading', model: null, entry };
}
