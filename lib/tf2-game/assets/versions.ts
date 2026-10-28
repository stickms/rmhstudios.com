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
 * Layout: `<game>-game/<kind>/…` — `tf2-game/` now, `hl2-game/` and `portal-game/` later
 * (same kinds, same serving code, one shared storage budget).
 */

export const GAME_IDS = ['tf2', 'hl2', 'portal'] as const;
export type GameId = (typeof GAME_IDS)[number];

/** The asset kinds a game's prefix may hold — the first path segment under `<game>-game/`. */
export const GAME_ASSET_KINDS = ['maps', 'mdl', 'tex', 'snd', 'particles'] as const;
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
    builder: 1,
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
} as const satisfies Record<string, GameAssetChannel>;

export type GameAssetChannelName = keyof typeof GAME_ASSET_CHANNELS;

export const channelPrefix = (c: GameAssetChannel): string => `${gameRoot(c.game)}${c.kind}/`;
export const channelStateKey = (c: GameAssetChannel): string => `${channelPrefix(c)}_state.json`;

/** Default ceiling for everything under every `<game>-game/` prefix (R2), in GB. */
export const GAME_STORAGE_BUDGET_GB = 12;
