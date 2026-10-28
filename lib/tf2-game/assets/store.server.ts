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
