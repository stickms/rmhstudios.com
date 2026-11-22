/**
 * Zod schemas and cursor encoding for `/api/v1/me/feeds*` and `/api/v1/feeds/{id}/posts` (s09-08). Pure (no server
 * imports) so the limits are testable on their own.
 */
import { z } from 'zod';
import { MAX_MEMBERS } from '@/lib/lists/constants';

export const FEEDS_PAGE_MAX = 50;
export const FEEDS_PAGE_DEFAULT = 20;
export const FEED_KINDS = ['feed', 'list', 'search', 'alert'] as const;
/** The kinds that are timelines; a search and an alert are queries. */
export const TIMELINE_KINDS: readonly string[] = ['feed', 'list'];

const ID_MAX = 64;
/** An empty parameter reads as absent, as the other v1 list routes treat `?cursor=`. */
const blankAsAbsent = (v: unknown) => (v === '' || v === null ? undefined : v);

const pageLimit = z.preprocess(
  blankAsAbsent,
  z.coerce.number().int().min(1).max(FEEDS_PAGE_MAX).default(FEEDS_PAGE_DEFAULT),
);

export const feedPath = z.object({
  id: z.string().min(1).max(ID_MAX),
});

export const myFeedsQuery = z.object({
  limit: pageLimit,
  cursor: z.preprocess(blankAsAbsent, z.string().max(120).optional()),
  kind: z.preprocess(blankAsAbsent, z.enum(FEED_KINDS).optional()),
});

export const feedPostsQuery = z.object({
  limit: pageLimit,
  cursor: z.preprocess(blankAsAbsent, z.string().max(120).optional()),
});

export const replaceMembersBody = z
  .object({
    handles: z
      .array(z.string().trim().min(1, 'A handle cannot be empty.').max(50))
      .max(MAX_MEMBERS, `A list holds at most ${MAX_MEMBERS} members.`),
  })
  .strict();

export type MyFeedsQuery = z.infer<typeof myFeedsQuery>;

/** `createdAt|id` keyset cursor for the feed list, newest first. */
export function encodeFeedsCursor(c: { at: Date; id: string }): string {
  return `${c.at.toISOString()}|${c.id}`;
}

export function decodeFeedsCursor(raw: string): { at: Date; id: string } | null {
  const [iso, id, extra] = raw.split('|');
  if (!iso || !id || extra !== undefined) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : { at, id };
}
