/**
 * Whether the game's HUD and menus may fetch a game's published asset channels over HTTP
 * (the menu channel, the HUD base). True for TF2, Half-Life 2 and Portal; a game that ships no
 * channels (Harmonic) turns it off on its GameCanvas, and its menus draw their own plain layout
 * without a request that can only 404.
 */
'use client';

import { createContext, useContext } from 'react';

export const RemoteAssetsContext = createContext(true);

export function useRemoteAssets(): boolean {
  return useContext(RemoteAssetsContext);
}
