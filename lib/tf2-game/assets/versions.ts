/**
 * The game's asset channels in object storage and their builder versions.
 *
 * Every channel is one prefix with its own `_state.json` (written by
 * `scripts/tf2-assets/publish.ts push`), gated by the Steam build id and its builder
 * version: bump a channel's `builder` when its converter's output changes for the same
 * game files, and the next `tf2-assets-sync` run rebuilds that channel once. The workflow
 * reads these numbers (`scripts/tf2-game/storage-report.ts builders`), so they live here
 * only.
 *
 * Layout: `<game>-game/<kind>/…` — `tf2-game/`, `hl2-game/` (Half-Life 2 demo),
 * `portal-game/` (Portal: First Slice) and `csgo-game/` (CS:GO's de_dust2, built by its own
 * workflow, .github/workflows/csgo-assets-sync.yml): same kinds, same serving code, one shared
 * storage budget. The model and map channels publish at the game root (`mdl/…`, `maps/…` and the
 * `tex/…` they share); the others under their own kind.
 */

export const GAME_IDS = ['tf2', 'hl2', 'portal', 'csgo'] as const;
export type GameId = (typeof GAME_IDS)[number];

/**
 * The asset kinds a game's prefix may hold — the first path segment under `<game>-game/`. `ui` is
 * CS:GO's HUD and buy-menu data (sanitised Panorama SVG icons, localisation, default-weapon data);
 * `menu` a game's main menu (scripts/tf2-game/menu_ui.py: the GameUI files, backgrounds and fonts of
 * Half-Life 2 and Portal, CS:GO's Panorama movie, fonts and icons).
 */
export const GAME_ASSET_KINDS = ['maps', 'mdl', 'tex', 'snd', 'particles', 'ui', 'menu'] as const;
export type GameAssetKind = (typeof GAME_ASSET_KINDS)[number];

export const gameRoot = (game: GameId): string => `${game}-game/`;

export interface GameAssetChannel {
  game: GameId;
  kind: GameAssetKind;
  /** Bump when the converter's output changes: the channel is rebuilt once. */
  builder: number;
  /** Environment variable the workflow reads the builder version from. */
  env: string;
  /** Converter that produces it (documentation; the workflow runs it). */
  script: string;
}

export const GAME_ASSET_CHANNELS = {
  'game-models': {
    game: 'tf2',
    kind: 'mdl',
    // 2: textures with an alpha channel above the size cap scale colour and alpha apart (models.py `fit`).
    builder: 2,
    env: 'TF2_GAME_BUILDER_MODELS',
    script: 'scripts/tf2-game/models.py',
  },
  'game-sounds': {
    game: 'tf2',
    kind: 'snd',
    builder: 1,
    env: 'TF2_GAME_BUILDER_SOUNDS',
    script: 'scripts/tf2-game/sounds.py',
  },
  'game-particles': {
    game: 'tf2',
    kind: 'particles',
    builder: 1,
    env: 'TF2_GAME_BUILDER_PARTICLES',
    script: 'scripts/tf2-game/game_particles.py',
  },
  'game-maps': {
    game: 'tf2',
    kind: 'maps',
    builder: 1,
    env: 'TF2_GAME_BUILDER_MAPS',
    script: 'scripts/tf2-game/build-maps.ts',
  },
  // Half-Life 2 demo (Steam app 219): its six maps and their props.
  'hl2-maps': {
    game: 'hl2',
    kind: 'maps',
    builder: 1,
    env: 'HL2_GAME_BUILDER_MAPS',
    script: 'scripts/tf2-game/build-maps.ts',
  },
  'hl2-models': {
    game: 'hl2',
    kind: 'mdl',
    // 2: textures with an alpha channel above the size cap scale colour and alpha apart (models.py `fit`).
    builder: 2,
    env: 'HL2_GAME_BUILDER_MODELS',
    script: 'scripts/tf2-game/models.py',
  },
  // Its maps' sounds (`sound-list.py --game hl2`), soundscapes, scenes and captions.
  'hl2-sounds': {
    game: 'hl2',
    kind: 'snd',
    builder: 1,
    env: 'HL2_GAME_BUILDER_SOUNDS',
    script: 'scripts/tf2-game/sounds.py',
  },
  // Portal: First Slice (Steam app 410): its seven maps and their props.
  'portal-maps': {
    game: 'portal',
    kind: 'maps',
    builder: 1,
    env: 'PORTAL_GAME_BUILDER_MAPS',
    script: 'scripts/tf2-game/build-maps.ts',
  },
  'portal-models': {
    game: 'portal',
    kind: 'mdl',
    // 2: textures with an alpha channel above the size cap scale colour and alpha apart (models.py `fit`).
    builder: 2,
    env: 'PORTAL_GAME_BUILDER_MODELS',
    script: 'scripts/tf2-game/models.py',
  },
  'portal-sounds': {
    game: 'portal',
    kind: 'snd',
    builder: 1,
    env: 'PORTAL_GAME_BUILDER_SOUNDS',
    script: 'scripts/tf2-game/sounds.py',
  },
  // Counter-Strike: Global Offensive (dedicated server, Steam app 740, anonymous): de_dust2 only,
  // default loadouts, no weapon finishes / stickers / agents. Its own workflow
  // (.github/workflows/csgo-assets-sync.yml) gates these on app 740's build.
  'csgo-maps': {
    game: 'csgo',
    kind: 'maps',
    builder: 1,
    env: 'CSGO_GAME_BUILDER_MAPS',
    script: 'scripts/tf2-game/build-maps.ts',
  },
  // The default player models (one per team) and their arms, every default weapon's view and world
  // models, C4, the defuse kit, grenades, shells and Dust II's props (csgo-model-list.py).
  'csgo-models': {
    game: 'csgo',
    kind: 'mdl',
    // 2: CS:GO's frame animations decode (every weapon view model's sequences were dropped before).
    // 3: Quaternion48S counts its dropped component from w, constants read rotation, position, raw (srcanim
    //    FRAMEANIM_VERSION 2 rebuilds the models with frame animations); the sync runs probe-frameanim.py.
    // 4: the frame-animated ref sets the clips' basis, recorded as source.clipFrame (FRAMEANIM_VERSION 3).
    // 5: the sync's probe dumps the bare-arm textures' VTF headers (outputs unchanged).
    // 6: the probe also checks those textures' archive CRCs and decoded colour (outputs unchanged).
    // 7: textures with an alpha channel above the size cap scale colour and alpha apart (models.py `fit`):
    //    the bare forearms were blackened by Pillow's premultiplied resize.
    builder: 7,
    env: 'CSGO_GAME_BUILDER_MODELS',
    script: 'scripts/tf2-game/models.py',
  },
  'csgo-sounds': {
    game: 'csgo',
    kind: 'snd',
    builder: 1,
    env: 'CSGO_GAME_BUILDER_SOUNDS',
    script: 'scripts/tf2-game/sounds.py',
  },
  'csgo-particles': {
    game: 'csgo',
    kind: 'particles',
    builder: 1,
    env: 'CSGO_GAME_BUILDER_PARTICLES',
    script: 'scripts/tf2-game/game_particles.py',
  },
  // HUD / buy-menu icons (sanitised SVG), localisation (resource/csgo_<language>.txt, filtered to the
  // HUD's tokens) and the default weapons' data (items_game.txt prefabs resolved) as JSON.
  'csgo-ui': {
    game: 'csgo',
    kind: 'ui',
    builder: 1,
    env: 'CSGO_GAME_BUILDER_UI',
    script: 'scripts/tf2-game/csgo_ui.py',
  },
  // Each game's main menu (menu_ui.py): Source GameUI's files, console backgrounds, chapter pictures,
  // fonts and words for Half-Life 2 and Portal; Panorama's background movie, fonts and icons for CS:GO.
  'hl2-menu': {
    game: 'hl2',
    kind: 'menu',
    builder: 1,
    env: 'HL2_GAME_BUILDER_MENU',
    script: 'scripts/tf2-game/menu_ui.py',
  },
  'portal-menu': {
    game: 'portal',
    kind: 'menu',
    builder: 1,
    env: 'PORTAL_GAME_BUILDER_MENU',
    script: 'scripts/tf2-game/menu_ui.py',
  },
  'csgo-menu': {
    game: 'csgo',
    kind: 'menu',
    // 2: a map's background movie (not a preview), Panorama's fonts wherever kept, the logo textures.
    // 3: Panorama's fonts decoded from .vfont (Stratum2, Noto Sans); the movie's 720p cut.
    builder: 3,
    env: 'CSGO_GAME_BUILDER_MENU',
    script: 'scripts/tf2-game/menu_ui.py',
  },
} as const satisfies Record<string, GameAssetChannel>;

export type GameAssetChannelName = keyof typeof GAME_ASSET_CHANNELS;

export const channelPrefix = (c: GameAssetChannel): string => `${gameRoot(c.game)}${c.kind}/`;
export const channelStateKey = (c: GameAssetChannel): string => `${channelPrefix(c)}_state.json`;

/**
 * Where a channel's files are pushed (the names in its state file are relative to this):
 * the game root for the model and map channels, which share `tex/`; the kind's prefix
 * for the others.
 */
export const channelPublishPrefix = (c: GameAssetChannel): string =>
  c.kind === 'mdl' || c.kind === 'maps' ? gameRoot(c.game) : channelPrefix(c);

/**
 * Channels outside `<game>-game/` that the game also reads at run time, counted against the same
 * budget by the storage guard: the HUD base (`tf2-hud-base/`: panels, schemes, textures and the game's
 * localisation, `resource/tf_<language>.txt`, which custom HUDs and the HUD editor draw `#Token`s
 * from). Each is a prefix whose state file sits at `<prefix>_state.json`, published by
 * scripts/tf2-assets/publish.ts like the game channels.
 */
export const COUNTED_CHANNELS = ['tf2-hud-base/'] as const;

/** Default ceiling for everything under every `<game>-game/` prefix (R2), in GB. */
export const GAME_STORAGE_BUDGET_GB = 12;
