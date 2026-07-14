import { CDN_BASE } from "./asset";

export const FEED_IMAGE_PREFIX = "rmharks/";

const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+$/;

export function isSafeFilename(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  return SAFE_FILENAME_RE.test(name);
}

// A `-<width>x<height>` tag inserted right before the file extension so the
// client can reserve exact layout space before an image loads (no layout shift).
const DIMENSION_RE = /-(\d{1,5})x(\d{1,5})(?=\.[A-Za-z0-9]+$)/;

/**
 * Insert a `-WxH` dimension tag before a filename's extension, e.g.
 * `user-123.webp` → `user-123-1200x800.webp`. Returns the name unchanged if it
 * has no extension or the dimensions are missing/invalid. The tag uses only
 * `[0-9x-]`, so tagged names still pass {@link isSafeFilename}.
 */
export function withImageDimensions(filename: string, width?: number, height?: number): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || !width || !height || width > 99999 || height > 99999) return filename;
  return `${filename.slice(0, dot)}-${width}x${height}${filename.slice(dot)}`;
}

/**
 * Extract intrinsic pixel dimensions from an image URL or filename tagged by
 * {@link withImageDimensions}. Ignores any query string. Returns `null` for
 * legacy/untagged names.
 */
export function parseImageDimensions(urlOrName: string): { width: number; height: number } | null {
  const path = urlOrName.split("?")[0];
  const m = DIMENSION_RE.exec(path);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

export function contentTypeForFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function feedImageKey(filename: string): string {
  return `${FEED_IMAGE_PREFIX}${filename}`;
}

export function feedImageUrl(filename: string): string {
  // With R2 + a public CDN domain configured, serve feed images straight from
  // the edge. Otherwise (local dev / MinIO) fall back to the Node proxy route,
  // which streams the object out of object storage.
  return CDN_BASE
    ? `${CDN_BASE}/${feedImageKey(filename)}`
    : `/api/feed/image/${filename}`;
}

// AI-generated persona avatars live in their own namespace so they're never
// confused with user-posted feed images (different ownership/serving rules).
export const PERSONA_AVATAR_PREFIX = "personas/avatars/";

export function personaAvatarKey(filename: string): string {
  return `${PERSONA_AVATAR_PREFIX}${filename}`;
}

export function personaAvatarUrl(filename: string): string {
  // Same CDN-vs-proxy split as feed images: serve from the edge when a public
  // CDN domain is set, else through the Node proxy route that streams from
  // object storage (see app/routes/api/personas/avatar/$filename.ts).
  return CDN_BASE
    ? `${CDN_BASE}/${personaAvatarKey(filename)}`
    : `/api/personas/avatar/${filename}`;
}

// User-uploaded profile avatars. Migrated off local disk (db/avatars) to object
// storage so the VPS disk can be reclaimed; served from the CDN in prod.
export const USER_AVATAR_PREFIX = "user-avatars/";

export function userAvatarKey(filename: string): string {
  return `${USER_AVATAR_PREFIX}${filename}`;
}

export function userAvatarUrl(filename: string): string {
  // Same CDN-vs-proxy split as feed images / persona avatars. The proxy route
  // (app/routes/api/profile/avatar/$filename.ts) streams from object storage in
  // dev / no-CDN; prod points straight at cdn.rmhstudios.com.
  return CDN_BASE
    ? `${CDN_BASE}/${userAvatarKey(filename)}`
    : `/api/profile/avatar/${filename}`;
}

// User-uploaded profile banners/covers. Same object-storage model as avatars.
export const USER_BANNER_PREFIX = "user-banners/";

export function userBannerKey(filename: string): string {
  return `${USER_BANNER_PREFIX}${filename}`;
}

export function userBannerUrl(filename: string): string {
  // Proxy route app/routes/api/profile/banner/$filename.ts streams from storage
  // in dev / no-CDN; prod points straight at the CDN.
  return CDN_BASE
    ? `${CDN_BASE}/${userBannerKey(filename)}`
    : `/api/profile/banner/${filename}`;
}

/** Extract the safe filename from a stored banner URL (proxy path or CDN), or null. */
export function userBannerFilename(url: string): string | null {
  const localPrefix = "/api/profile/banner/";
  if (url.startsWith(localPrefix)) {
    const f = url.slice(localPrefix.length);
    return isSafeFilename(f) ? f : null;
  }
  if (CDN_BASE) {
    const cdnPrefix = `${CDN_BASE}/${USER_BANNER_PREFIX}`;
    if (url.startsWith(cdnPrefix)) {
      const f = url.slice(cdnPrefix.length);
      return isSafeFilename(f) ? f : null;
    }
  }
  return null;
}

// Vibe-page gallery thumbnails. Rendered by the vibe-worker (Go) / the Node
// screenshot fallback, stored as WebP in object storage so the db/ volume can be
// reclaimed; served from the CDN in prod.
export const VIBE_THUMB_PREFIX = "vibe-thumbs/";

export function vibeThumbKey(slug: string): string {
  return `${VIBE_THUMB_PREFIX}${slug}.webp`;
}

export function vibeThumbUrl(slug: string, version: number | string): string {
  // CDN-vs-proxy split. The `?v=` cache-buster lets us serve immutably while a
  // re-render still busts the edge/browser cache.
  return CDN_BASE
    ? `${CDN_BASE}/${vibeThumbKey(slug)}?v=${version}`
    : `/api/vibe/thumb/${slug}?v=${version}`;
}

// Legacy prefix for the old AI-generated promotional build covers. Custom cover
// generation has been removed — the storefront now uses each build's own
// thumbnail/object image — but the read-only proxy at /api/builds/cover/$file
// still serves any covers left in object storage from before, so the prefix
// stays for that lookup.
export const BUILD_COVER_PREFIX = "build-covers/";

// ─── Library albums ──────────────────────────────────────────────────────────
// Album media (photos + clips) for the library carousel. Heavy originals live in
// object storage keyed by album + slide id — never in the repo / build image —
// served from the CDN in prod, else the Node proxy that streams from storage.
export const ALBUM_PREFIX = "albums/";

const SAFE_KEY_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

/** A path under albums/ is safe if every segment is a plain filename (no traversal). */
export function isSafeAlbumPath(suffix: string): boolean {
  if (!suffix) return false;
  return suffix.split("/").every((seg) => seg && seg !== "." && seg !== ".." && SAFE_KEY_SEGMENT_RE.test(seg));
}

/** Object key for an album asset, namespaced under albums/<albumId>/<name>. */
export function albumAssetKey(albumId: string, name: string): string {
  return `${ALBUM_PREFIX}${albumId}/${name}`;
}

/**
 * Resolve an `albums/...` object key to a browser URL. Same CDN-vs-proxy split as
 * feed images: served from the edge when a public CDN domain is set, else through
 * the Node proxy (app/routes/api/albums/asset/$.ts) that streams from storage.
 */
export function albumAssetUrl(key: string): string {
  const suffix = key.startsWith(ALBUM_PREFIX) ? key.slice(ALBUM_PREFIX.length) : key;
  return CDN_BASE ? `${CDN_BASE}/${ALBUM_PREFIX}${suffix}` : `/api/albums/asset/${suffix}`;
}

/**
 * Extract the safe filename from a stored avatar URL, or null. Accepts every
 * form the app has produced over time:
 *  - the Node proxy path `/api/profile/avatar/<filename>` (dev / no CDN, and the
 *    legacy local-disk form), and
 *  - the public CDN URL `<CDN_BASE>/user-avatars/<filename>` (R2 + CDN).
 */
export function userAvatarFilename(url: string): string | null {
  const localPrefix = "/api/profile/avatar/";
  if (url.startsWith(localPrefix)) {
    const f = url.slice(localPrefix.length);
    return isSafeFilename(f) ? f : null;
  }
  if (CDN_BASE) {
    const cdnPrefix = `${CDN_BASE}/${USER_AVATAR_PREFIX}`;
    if (url.startsWith(cdnPrefix)) {
      const f = url.slice(cdnPrefix.length);
      return isSafeFilename(f) ? f : null;
    }
  }
  return null;
}

/**
 * Extract the safe filename from a stored feed-image URL, or null if it isn't
 * one. Accepts both forms the app produces:
 *  - the local Node proxy path `/api/feed/image/<filename>` (dev / no CDN), and
 *  - the public CDN URL `<CDN_BASE>/rmharks/<filename>` (R2 + cdn.rmhstudios.com).
 */
export function feedImageFilename(url: string): string | null {
  const localPrefix = "/api/feed/image/";
  if (url.startsWith(localPrefix)) {
    const f = url.slice(localPrefix.length);
    return isSafeFilename(f) ? f : null;
  }
  if (CDN_BASE) {
    const cdnPrefix = `${CDN_BASE}/${FEED_IMAGE_PREFIX}`;
    if (url.startsWith(cdnPrefix)) {
      const f = url.slice(cdnPrefix.length);
      return isSafeFilename(f) ? f : null;
    }
  }
  return null;
}

/** True if `url` is a valid feed-image URL (either supported form). */
export function isFeedImageUrl(url: string): boolean {
  return feedImageFilename(url) !== null;
}

/** True if a feed image URL's filename belongs to the given user (filename is `<userId>-<ts>-<rand>.<ext>`). */
export function ownsFeedImageUrl(url: string, userId: string): boolean {
  const filename = feedImageFilename(url);
  return filename !== null && filename.startsWith(`${userId}-`);
}
