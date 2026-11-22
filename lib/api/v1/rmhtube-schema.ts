/**
 * Validation and cursors for `/api/v1/me/rmhtube/*` and `/api/v1/rmhtube/parties*` (s10-14). Pure: no server
 * imports, so the limits are testable on their own. The URL is the site's own `mediaUrlSchema`.
 */
import { z } from 'zod';
import { mediaUrlSchema } from '@/lib/rmhtube/party';

export const WATCH_LATER_PAGE_MAX = 50;
export const WATCH_LATER_PAGE_DEFAULT = 50;

const blankAsAbsent = (v: unknown) => (v === '' || v === null ? undefined : v);

export const watchLaterQuery = z.object({
  limit: z.preprocess(blankAsAbsent, z.coerce.number().int().min(1).max(WATCH_LATER_PAGE_MAX).optional()),
  cursor: z.preprocess(blankAsAbsent, z.string().max(120).optional()),
});

export const addWatchLaterBody = z.object({
  url: mediaUrlSchema,
  title: z.string().trim().max(256).optional(),
});

export const watchLaterIdPath = z.object({ id: z.string().min(1).max(40) });

export const goingBody = z.object({ going: z.boolean() });

/** `createdAt|id` keyset cursor, oldest first. */
export function encodeWatchLaterCursor(c: { at: Date; id: string }): string {
  return `${c.at.toISOString()}|${c.id}`;
}

export function decodeWatchLaterCursor(raw: string): { at: Date; id: string } | null {
  const [iso, id, extra] = raw.split('|');
  if (!iso || !id || extra !== undefined || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : { at, id };
}
