import { CDN_BASE } from "./asset";

export const FEED_IMAGE_PREFIX = "rmharks/";

const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+$/;

export function isSafeFilename(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  return SAFE_FILENAME_RE.test(name);
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
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
