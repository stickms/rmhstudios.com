// =============================================================================
// ALTAIR ENGINE -- WebGL Texture Management
// =============================================================================
// Uploads HTMLImageElement sprite sheets to the GPU as WebGL textures.
// Uses nearest-neighbor filtering for crisp pixel art.
// =============================================================================

const textureCache = new Map<string, WebGLTexture>();

let activeGL: WebGLRenderingContext | null = null;

/**
 * Store the GL context for deferred texture creation.
 */
export function setGLContext(gl: WebGLRenderingContext): void {
  activeGL = gl;
}

/**
 * Get the current GL context (for sprite-loader integration).
 */
export function getGLContext(): WebGLRenderingContext | null {
  return activeGL;
}

/**
 * Create (or retrieve cached) a WebGL texture from an HTMLImageElement.
 * Uses NEAREST filtering for pixel-art crispness.
 */
export function createTextureFromImage(
  gl: WebGLRenderingContext,
  image: HTMLImageElement,
  key?: string,
): WebGLTexture {
  const cacheKey = key || image.src;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const tex = gl.createTexture();
  if (!tex) throw new Error('Failed to create WebGL texture');

  gl.bindTexture(gl.TEXTURE_2D, tex);

  // Upload pixel data — use premultiplied alpha
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // Nearest-neighbor filtering for pixel art
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Clamp to edge to avoid bleeding
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  textureCache.set(cacheKey, tex);
  return tex;
}

/**
 * Get a cached texture by key/src. Returns null if not yet created.
 */
export function getTexture(key: string): WebGLTexture | null {
  return textureCache.get(key) || null;
}

/**
 * Clear all cached textures (e.g. on context loss).
 */
export function clearTextureCache(): void {
  textureCache.clear();
}
