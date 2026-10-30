/**
 * The files the menus are drawn from, loaded at run time: the selected custom HUD's own copies where it
 * ships them (HUD authors restyle mainmenuoverride.res and gamemenu.res in real TF2), else the game's
 * from the HUD base channel (`/api/tf2-hud/base`, published from the game install by
 * scripts/tf2-assets/hud.py — or the copy in public/tf2-hud/base before a sync). Fetches only what the
 * menus read: the scheme, the menu and dialog files, the key list, the advanced options script, the
 * background lists, and the game's language files for the site's language (with English under it).
 * Textures load on demand as the menus paint them.
 *
 *   const menus = await prepareMenus(useHudChoice.getState().active?.hud ?? null, 'tf2');
 *   buildGameMenu({ source: menus.source, … }); paintScene(g, scene, { images: menus.images });
 */

import { ensureBundledFonts } from '@/lib/tf2-hud/assets/fonts';
import { syncCustomFonts } from '@/lib/tf2-hud/assets/font-sync';
import { ImageStore } from '@/lib/tf2-hud/assets/images';
import { DEFAULT_LANGUAGE, gameLanguageFiles, languageForSite } from '@/lib/tf2-hud/localisation';
import { baseCache } from '@/lib/tf2-hud/project/base-cache';
import { PC_ENV } from '@/lib/tf2-hud/scheme/cond';
import { EMPTY_SCHEME, parseScheme } from '@/lib/tf2-hud/scheme/scheme';
import type { HudGame } from '../hud-state';
import { hudStrings } from '../custom-hud/renderer';
import type { SceneSource } from '../custom-hud/scene';
import { DEFAULT_HUD_META, HudFiles, type LoadedHud } from '../custom-hud/source';
import { DEFAULT_SELECTION } from '../custom-hud/selection';
import { USER_SCR_FILE } from './advanced-options';
import { GAME_MENU_FILES } from './game-menu';
import { kbActFile } from './kb-act';
import { CLASS_LOADOUT_FILE } from './loadout-layout';
import { OPTIONS_FILES } from './options';

const SCHEME_FILE = 'resource/clientscheme.res';

/** Every file the menus read for a game (tests, the asset pipeline's list). */
export function menuFiles(game: HudGame): string[] {
  return [
    SCHEME_FILE,
    'resource/sourcescheme.res',
    ...GAME_MENU_FILES,
    ...Object.values(OPTIONS_FILES),
    kbActFile(game),
    USER_SCR_FILE,
    CLASS_LOADOUT_FILE,
  ];
}

export interface MenuSource {
  hud: LoadedHud;
  files: HudFiles;
  source: SceneSource;
  images: ImageStore;
  /** Told when a texture arrives (the menus repaint). */
  imageListeners: Set<() => void>;
  /** The TF2 language the `#Token`s read. */
  language: string;
}

const siteLocale = (): string =>
  typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en';

const DEFAULT_HUD: LoadedHud = { selection: DEFAULT_SELECTION, meta: DEFAULT_HUD_META, overlay: new Map() };

/** Loads the menus' files for a HUD (null: the TF2 Default) and a game. Never throws for a missing file. */
export async function prepareMenus(hud: LoadedHud | null, game: HudGame): Promise<MenuSource> {
  const loaded = hud ?? DEFAULT_HUD;
  const files = new HudFiles(loaded.overlay);
  let language = DEFAULT_LANGUAGE;
  try {
    await baseCache.loadIndex();
    language = languageForSite(siteLocale(), (p) => baseCache.has(p));
    await baseCache.ensure([...gameLanguageFiles(DEFAULT_LANGUAGE), ...gameLanguageFiles(language)]);
    await files.ensure(menuFiles(game));
  } catch {
    /* no base at all: the menus fall back to their own layout and words */
  }
  const schemeText = files.readText(SCHEME_FILE);
  const scheme = schemeText === undefined ? EMPTY_SCHEME : parseScheme(schemeText, PC_ENV);
  const source: SceneSource = {
    readText: files.readText,
    scheme,
    env: PC_ENV,
    minmode: false,
    strings: hudStrings(loaded, language),
  };
  const imageListeners = new Set<() => void>();
  const images = new ImageStore(
    files.readBytes,
    () => {
      for (const l of imageListeners) l();
    },
    (paths) => baseCache.ensure(paths),
  );
  images.setLookup(files.readBytes);
  await ensureBundledFonts().catch(() => undefined);
  await syncCustomFonts(files.fontFiles(), scheme).catch(() => false);
  return { hud: loaded, files, source, images, imageListeners, language };
}
