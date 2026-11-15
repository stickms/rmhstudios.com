// =============================================================================
// ALTAIR ENGINE -- CORS image loading
// =============================================================================
// Sprite sheets are served from the CDN (cdn.rmhstudios.com, see lib/storage/asset.ts), which is a
// different origin from the page. A plain `new Image()` loads those in no-cors mode and the browser
// marks the pixels tainted: drawing them to a 2D canvas still works, but uploading them as a WebGL
// texture throws `SecurityError: The operation is insecure`, and then nothing is drawn (the HUD is
// DOM, so it keeps working over a flat, empty playfield).
//
// The CDN answers CORS requests (`access-control-allow-origin` for the site), so every image whose URL
// comes from `asset()` must be requested with `crossOrigin = 'anonymous'`. All of Altair's sprite
// images go through here, including the ones only drawn to 2D canvases, so one URL is always
// requested one way and a cached response from one mode never serves the other.
//
// One retry with a cache-busting query covers a stale cached copy of the sheet that was stored without
// CORS headers (from before this loader asked for them): without it those visitors would get no
// sprites until the cache entry expired.
// =============================================================================

/**
 * Start loading `src` into `image` in CORS mode.
 * `onLoad` runs when the pixels are ready and readable by WebGL; `onFail` runs only after the retry has
 * also failed.
 */
export function loadCorsImage(
  image: HTMLImageElement,
  src: string,
  onLoad: () => void,
  onFail: () => void = () => {},
): void {
  image.crossOrigin =
    'anonymous';
  let retried = false;
  image.onload =
    onLoad;
  image.onerror =
    () => {
      if (
        retried
      ) {
        onFail();
        return;
      }
      retried = true;
      image.src = `${src}${src.includes('?') ? '&' : '?'}cors=1`;
    };
  image.src =
    src;
}
