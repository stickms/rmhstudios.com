import { validateImageBuffer, detectImageExt } from "@/lib/slice-it/upload-validation";

export const MEDIA_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_MEDIA_PER_POST = 4;

export type ImageExt = ".png" | ".jpg" | ".webp" | ".gif";

export function validateUpload(
  buffer: Buffer
): { ok: true; ext: ImageExt } | { ok: false; error: string } {
  if (buffer.length > MEDIA_MAX_BYTES) {
    return { ok: false, error: `Image too large. Maximum size is ${MEDIA_MAX_BYTES / 1024 / 1024} MB.` };
  }
  const valid = validateImageBuffer(buffer);
  if (!valid.ok) return valid;
  const ext = detectImageExt(buffer);
  if (!ext) return { ok: false, error: "Unsupported image format." };
  return { ok: true, ext };
}

/** Returns an error message if this media can't be attached by `ownerId`, else null. */
export function attachError(
  media: { userId: string; status: string } | null,
  ownerId: string
): string | null {
  // Treat foreign-owned the same as missing — don't leak existence.
  if (!media || media.userId !== ownerId) return "Media not found.";
  if (media.status !== "PENDING") return "Media already attached to a post.";
  return null;
}
