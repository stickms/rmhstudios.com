/**
 * One scene per editor: the preview, outline, inspector and test tools all read
 * the same build instead of each rebuilding it.
 */
'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useScene, type SceneResult } from '@/lib/tf2-hud/use-scene';
import { EMPTY_SCHEME } from '@/lib/tf2-hud/scheme/scheme';

const Ctx = createContext<SceneResult>({
  scene: null,
  scheme: EMPTY_SCHEME,
  page: undefined,
  loading: true,
});

export function SceneProvider({ children }: { children: ReactNode }) {
  const value = useScene();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSceneContext = (): SceneResult => useContext(Ctx);
