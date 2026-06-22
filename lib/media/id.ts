import { nanoid } from "nanoid";

export const MEDIA_ID_PREFIX = "media_";

/** Opaque, developer-facing media handle. */
export function newMediaId(): string {
  return `${MEDIA_ID_PREFIX}${nanoid()}`;
}

export function isMediaId(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(MEDIA_ID_PREFIX);
}
