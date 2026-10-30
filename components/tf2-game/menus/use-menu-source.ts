/**
 * The files the Source-style menus draw from (lib/tf2-game/client/menus/source.ts), for a game: the
 * selected custom HUD's own copies where it ships them (TF2), else the game's from the HUD base. Loaded
 * once per HUD and game and shared by every menu on the page; null while loading.
 */
'use client';

import { useEffect, useState } from 'react';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';
import type { LoadedHud } from '@/lib/tf2-game/client/custom-hud/source';
import { prepareMenus, type MenuSource } from '@/lib/tf2-game/client/menus/source';
import { useHudChoice } from '../custom-hud/hud-choice';

const byHud = new WeakMap<LoadedHud, Map<HudGame, Promise<MenuSource>>>();
const byGame = new Map<HudGame, Promise<MenuSource>>();

function load(hud: LoadedHud | null, game: HudGame): Promise<MenuSource> {
  if (!hud) {
    let p = byGame.get(game);
    if (!p) byGame.set(game, (p = prepareMenus(null, game)));
    return p;
  }
  let m = byHud.get(hud);
  if (!m) byHud.set(hud, (m = new Map()));
  let p = m.get(game);
  if (!p) m.set(game, (p = prepareMenus(hud, game)));
  return p;
}

export function useMenuSource(game: HudGame): MenuSource | null {
  // TF2 follows the HUD the player picked (pause menu → HUD); the other games have only the base.
  const hud = useHudChoice((s) => (game === 'tf2' ? (s.active?.hud ?? null) : null));
  useEffect(() => {
    if (game === 'tf2') useHudChoice.getState().init();
  }, [game]);
  const [source, setSource] = useState<MenuSource | null>(null);
  useEffect(() => {
    let alive = true;
    void load(hud, game).then((s) => {
      if (alive) setSource(s);
    });
    return () => {
      alive = false;
    };
  }, [hud, game]);
  return source;
}

/** The game's text for a `#Token` (or plain text), or `fallback` when the localisation has no such token. */
export function gameText(source: MenuSource | null, raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith('#')) return raw;
  return source?.source.strings.get(raw.slice(1).toLowerCase()) ?? fallback;
}
