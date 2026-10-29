/**
 * Read the browser game's converted assets from object storage (`<game>-game/…`,
 * written by the `game-*` channels of .github/workflows/tf2-assets-sync.yml).
 *
 * Same contract as the loadout's particle files (lib/tf2-loadout/particles.server.ts):
 * files go through the shared stored-file cache and are served as stored — still
 * Brotli-encoded for a client that accepts `br`, inflated for one that does not.
 */
import { brotliDecompressSync } from 'node:zlib';
import { readStored } from '@/lib/tf2-loadout/stored-cache.server';
import { gameAssetCacheControl, gameAssetContentType, isSafeGameAssetPath } from './paths';
import { gameRoot, type GameId } from './versions';

export interface GameAssetFile {
  body: Buffer;
  contentType: string;
  contentEncoding?: string;
}

/**
 * The asset routes' rate-limit bucket (per IP, before RATE_LIMIT_MULTIPLIER): a map's first
 * load is several hundred immutable files — HL2's d1_trainstation_01 is ~240 textures, ~200
 * model GLBs and its sounds — so the shared 'read' policy (120/min) throttled a single player
 * mid-load. Shared by the three games' routes, which a level change can hit together.
 */
export const GAME_ASSET_RATE_LIMIT = { limit: 2400, windowMs: 60_000, prefix: 'game-assets' } as const;

const ACCEPTS_BR = /(?:^|,)\s*br(?:\s*;\s*q=(?!0(?:\.0*)?(?:\s|,|$))[\d.]+)?\s*(?:,|$)/i;

export async function readGameAsset(
  path: string,
  acceptEncoding = '',
  game: GameId = 'tf2',
): Promise<GameAssetFile | null> {
  if (!isSafeGameAssetPath(path)) return null;
  const contentType = gameAssetContentType(path);
  if (!contentType) return null;
  const stored = await readStored(gameRoot(game) + path);
  if (!stored) return null;
  if (stored.contentEncoding === 'br' && !ACCEPTS_BR.test(acceptEncoding)) {
    return { body: brotliDecompressSync(stored.body), contentType };
  }
  return { body: stored.body, contentType, contentEncoding: stored.contentEncoding };
}

/** The response headers for a served game asset. */
export function gameAssetHeaders(path: string, file: GameAssetFile): Record<string, string> {
  return {
    'Content-Type': file.contentType,
    ...(file.contentEncoding ? { 'Content-Encoding': file.contentEncoding } : {}),
    Vary: 'Accept-Encoding',
    'Cache-Control': gameAssetCacheControl(path),
    'X-Content-Type-Options': 'nosniff',
  };
}
