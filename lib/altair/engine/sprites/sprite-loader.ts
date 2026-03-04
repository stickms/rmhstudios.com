// =============================================================================
// ALTAIR ENGINE -- Sprite Loader
// =============================================================================
// Loads sprite sheet PNGs and caches them. All images are loaded once at game
// init and reused for the entire session.
// =============================================================================

import { getGLContext, createTextureFromImage } from '../webgl/webgl-textures';

export interface SpriteSheet {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  loaded: boolean;
  /** GPU texture handle — created automatically when GL context is available. */
  glTexture: WebGLTexture | null;
}

const cache = new Map<string, SpriteSheet>();

/**
 * Load a single sprite sheet. Returns immediately with a SpriteSheet object;
 * the `loaded` flag flips to true once the image finishes downloading.
 */
export function loadSpriteSheet(
  src: string,
  frameWidth: number,
  frameHeight: number,
): SpriteSheet {
  const existing = cache.get(src);
  if (existing) return existing;

  const image = new Image();
  const sheet: SpriteSheet = {
    image,
    frameWidth,
    frameHeight,
    cols: 1,
    rows: 1,
    loaded: false,
    glTexture: null,
  };

  image.onload = () => {
    sheet.cols = Math.floor(image.naturalWidth / frameWidth) || 1;
    sheet.rows = Math.floor(image.naturalHeight / frameHeight) || 1;
    sheet.loaded = true;
    // Auto-create WebGL texture if GL context is ready
    const gl = getGLContext();
    if (gl) {
      sheet.glTexture = createTextureFromImage(gl, image);
    }
  };
  image.onerror = () => {
    // Mark as loaded with a 0x0 so the game can fall back to vector rendering
    sheet.loaded = false;
  };
  image.src = src;
  cache.set(src, sheet);
  return sheet;
}

/**
 * Preload all sprite sheets and return a promise that resolves when every
 * image has loaded (or failed). Calls `onProgress(loaded, total)` as each
 * image settles.
 */
export function preloadAllSprites(
  entries: { src: string; frameWidth: number; frameHeight: number }[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  let settled = 0;
  const total = entries.length;

  return new Promise<void>((resolve) => {
    if (total === 0) {
      resolve();
      return;
    }

    for (const entry of entries) {
      const existing = cache.get(entry.src);
      if (existing?.loaded) {
        settled++;
        onProgress?.(settled, total);
        if (settled >= total) resolve();
        continue;
      }

      const image = new Image();
      const sheet: SpriteSheet = {
        image,
        frameWidth: entry.frameWidth,
        frameHeight: entry.frameHeight,
        cols: 1,
        rows: 1,
        loaded: false,
        glTexture: null,
      };

      const settle = () => {
        settled++;
        onProgress?.(settled, total);
        if (settled >= total) resolve();
      };

      image.onload = () => {
        sheet.cols = Math.floor(image.naturalWidth / entry.frameWidth) || 1;
        sheet.rows = Math.floor(image.naturalHeight / entry.frameHeight) || 1;
        sheet.loaded = true;
        const gl = getGLContext();
        if (gl) {
          sheet.glTexture = createTextureFromImage(gl, image);
        }
        settle();
      };
      image.onerror = settle; // allow game to continue with vector fallback

      cache.set(entry.src, sheet);
      image.src = entry.src;
    }
  });
}

/** Check if all cached sheets have loaded. */
export function allSpritesLoaded(): boolean {
  for (const sheet of cache.values()) {
    if (!sheet.loaded) return false;
  }
  return true;
}

/** Clear the entire cache (useful for hot-reload). */
export function clearSpriteCache(): void {
  cache.clear();
}
