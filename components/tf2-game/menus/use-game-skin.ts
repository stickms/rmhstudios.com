/**
 * The look of a game's own dialogs over the running game (the pause menu, its Options): GameUI's for
 * Half-Life 2 and Portal (the game's SourceScheme colours from its menu channel, Source's defaults until
 * it loads), Panorama's for CS:GO, the TF2 Hub's for TF2. A class that re-points the --app-* tokens the
 * dialog's controls read, and the custom properties it draws from.
 */
'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';
import { emptyMenuChannel, gameUiStyle, loadMenuChannel, type MenuChannel } from '@/lib/tf2-game/client/menus/source-gameui';
import { useRemoteAssets } from './remote-assets';
import '../../sp-game/source-menu.css';
import '../../csgo-game/cs-menu.css';

export interface GameSkin {
  className?: string;
  style?: CSSProperties;
}

export function useGameSkin(game: HudGame): GameSkin {
  const [channel, setChannel] = useState<MenuChannel | null>(null);
  const remote = useRemoteAssets();
  const source = remote && (game === 'hl2' || game === 'portal');
  useEffect(() => {
    if (!source) return undefined;
    let alive = true;
    void loadMenuChannel(game).then((c) => alive && c && setChannel(c));
    return () => {
      alive = false;
    };
  }, [game, source]);
  return useMemo<GameSkin>(() => {
    if (game === 'hl2' || game === 'portal')
      return { className: 'gui-skin gui-skin-dialog', style: gameUiStyle(channel ?? emptyMenuChannel(game)).vars as CSSProperties };
    if (game === 'csgo') return { className: 'pano-vars pano-skin' };
    return {};
  }, [game, channel]);
}
