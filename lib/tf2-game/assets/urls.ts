/**
 * Browser-side addresses of the game's converted assets, and the index files that map
 * game names (sound script entries, particle systems, models) to content-addressed files.
 * Served by app/routes/api/tf2-game/assets/$.ts. No React here: the game loop, its
 * workers and the renderer all use these directly.
 */
import { isSafeGameAssetPath } from './paths';
import type { GameId } from './versions';

export const GAME_ASSET_API = '/api/tf2-game/assets/';

/** The API root of a game's assets (`/api/tf2-game/assets/`; `hl2` and `portal` later). */
export const gameAssetApi = (game: GameId = 'tf2'): string => `/api/${game}-game/assets/`;

export function gameAssetUrl(path: string, game: GameId = 'tf2'): string {
  if (!isSafeGameAssetPath(path)) throw new Error(`Invalid game asset path: ${path}`);
  return gameAssetApi(game) + path;
}

/** `snd/index.json` — written by scripts/tf2-game/sounds.py. */
export interface SoundEntry {
  /** Content hashes; the file is `snd/<sha>.mp3`. One is picked at random per play (rndwave). */
  waves: string[];
  volume: [number, number];
  /** Percent, 100 = normal. */
  pitch: [number, number];
  /** dB (SNDLVL); 0 = everywhere at full volume. */
  soundlevel: number;
  /** Source channel enum: 0 auto, 1 weapon, 2 voice, 3 item, 4 body, 5 stream, 6 static, 7 voice2. */
  channel: number;
  /** Source sound characters of the waves (`)` spatial stereo, `^` distance variant, `#` dry mix, `*` stream …). */
  flags?: string;
}
export interface SoundIndex {
  v: 1;
  entries: Record<string, SoundEntry>;
  /** `sound/<path>.wav|mp3` (lowercase, forward slashes) → `<sha>.mp3`. */
  files: Record<string, string>;
  /** `<sha>.mp3` → loop region in seconds of the source; `end: null` loops to the end. */
  loops: Record<string, { start: number; end: number | null }>;
}

/** `particles/index.json` — written by scripts/tf2-game/game_particles.py. */
export interface GameParticleIndex {
  v: 1;
  /** System name → `effects/<sha>.json`, a lib/tf2-loadout/particles ParticleBundle. */
  systems: Record<string, string>;
  /** Textures the exporting install lacked (empty on CI). */
  missingTextures: Record<string, string>;
}

export const soundUrl = (sha: string, game: GameId = 'tf2'): string =>
  gameAssetUrl(`snd/${sha.endsWith('.mp3') ? sha : sha + '.mp3'}`, game);

/** A particle bundle path or one of its texture frames (`effects/…`, `tex/…`). */
export const particleAssetUrl = (path: string, game: GameId = 'tf2'): string =>
  gameAssetUrl(`particles/${path}`, game);

const cache = new Map<string, Promise<unknown>>();

/**
 * Fetch a JSON asset once per page (an index or a bundle). Missing → null (the
 * channel has not been published yet); a failed request is not cached, so the next
 * call retries.
 */
export function fetchGameJson<T>(path: string, game: GameId = 'tf2'): Promise<T | null> {
  const url = gameAssetUrl(path, game);
  let pending = cache.get(url) as Promise<T | null> | undefined;
  if (!pending) {
    pending = fetch(url).then((res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Game asset ${path}: HTTP ${res.status}`);
      return res.json() as Promise<T>;
    });
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
}

export const loadSoundIndex = (game: GameId = 'tf2') =>
  fetchGameJson<SoundIndex>('snd/index.json', game);

export const loadParticleIndex = (game: GameId = 'tf2') =>
  fetchGameJson<GameParticleIndex>('particles/index.json', game);

/** Forget cached JSON (tests; or after a long session to pick up a new sync). */
export function clearGameAssetCache(): void {
  cache.clear();
}
