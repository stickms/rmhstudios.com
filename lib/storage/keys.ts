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
  return `/api/feed/image/${filename}`;
}
