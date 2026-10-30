/**
 * Which stored game assets may be served, as what, and for how long. Pure, so the
 * serving route, the browser helpers and the tests share it.
 *
 * A path is relative to a game's prefix (`tf2-game/`): `<kind>/<file>` where kind is one
 * of GAME_ASSET_KINDS. Files named by a content hash (64 or 40 hex) never change (immutable);
 * everything else (`index.json`, a map's manifest) is a mutable entry point.
 */
import { GAME_ASSET_KINDS } from './versions';

const SAFE = new RegExp(`^(?:${GAME_ASSET_KINDS.join('|')})/[a-z0-9_./-]+$`);
// sha256 (map packages, sounds, particles) or sha1 (the model channel's `tex/` and `mdl/`),
// then the extension — which may have parts, like a map's `<sha>.hulls.bin`.
const CONTENT_ADDRESSED = /(?:^|\/)(?:[a-f0-9]{64}|[a-f0-9]{40})(?:\.[a-z0-9]+)+$/;

export const GAME_ASSET_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.bin': 'application/octet-stream',
  '.bsp': 'application/octet-stream',
  // CS:GO's Panorama icons (`ui/icons/<sha>.svg`), sanitised by scripts/tf2-game/csgo_ui.py and
  // served with a sandboxing CSP (store.server.ts gameAssetHeaders).
  '.svg': 'image/svg+xml',
  // A game's main menu (`menu/…`): the fonts its schemes load and CS:GO's background movie.
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm',
};

const extension = (path: string): string => {
  const dot = path.lastIndexOf('.');
  return dot > path.lastIndexOf('/') ? path.slice(dot).toLowerCase() : '';
};

/**
 * `maps|mdl|tex|snd|particles|ui|menu` + `/` + lowercase name characters; no `..`, no empty,
 * hidden or `_`-prefixed segment (the channels' `_state.json` stays private), and only
 * the file types the game loads.
 */
export function isSafeGameAssetPath(path: string): boolean {
  if (path.length > 512 || !SAFE.test(path) || path.includes('..')) return false;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s.startsWith('.') || s.startsWith('_'))) return false;
  return extension(path) in GAME_ASSET_TYPES;
}

/** Content type for a safe path; null for a type the game does not serve. */
export function gameAssetContentType(path: string): string | null {
  return GAME_ASSET_TYPES[extension(path)] ?? null;
}

export function isContentAddressed(path: string): boolean {
  return CONTENT_ADDRESSED.test(path);
}

/** Content-addressed files are cached for a year; entry points revalidate after five minutes. */
export function gameAssetCacheControl(path: string): string {
  return isContentAddressed(path)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=300, stale-while-revalidate=3600';
}
