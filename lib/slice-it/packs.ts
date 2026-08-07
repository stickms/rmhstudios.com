/**
 * Slice It — packs: the shared client/server contract (L16).
 *
 * A **pack** is an ordered, curated set of songs. `Song.album` was a free-text
 * field that got displayed and nothing else: there was no way to upload an
 * album as a unit, no way to group charts you did not upload, and no authoring
 * surface at all for the grouping that courses (`S2`), shelves (`L2`) and
 * setlists (`S8`) are all specified in terms of.
 *
 * Client-safe — no server imports — for the same reason `library-filters.ts`
 * is: the route, the API handler and the builder component all have to agree on
 * what a position is and what kinds exist, and three copies of that agreement
 * is three chances for two of them to differ.
 */

import { z } from 'zod';

/* ─── Vocabulary ─────────────────────────────────────────────────────────── */

/**
 * `album` is not a user-selectable kind. It is what a multi-track upload
 * creates for you, its curator is by definition the uploader, and letting the
 * builder mint one by hand would produce "albums" that no upload backs.
 */
export const PACK_KINDS = ['pack', 'course', 'album'] as const;
export type PackKind = (typeof PACK_KINDS)[number];

/** The kinds the pack builder offers. See above for why `album` is missing. */
export const AUTHORABLE_PACK_KINDS = ['pack', 'course'] as const;

export const PACK_TITLE_MAX = 120;
export const PACK_DESCRIPTION_MAX = 2000;

/**
 * How many songs one pack may hold.
 *
 * A bound rather than none: the pack read returns every member in one response
 * (a pack is a thing you look at whole, so paging it would be a worse
 * experience for a real pack in order to survive an unreal one), and a response
 * has to have a size somebody chose.
 */
export const PACK_ITEM_MAX = 200;

/* ─── Positions ──────────────────────────────────────────────────────────── */

/**
 * The gap between adjacent positions.
 *
 * Positions are **sparse** — 10, 20, 30 … — so inserting between two items is
 * one UPDATE of one row. Dense positions (0, 1, 2 …) make that N UPDATEs, and
 * a curator dragging one track to the top of a 40-track pack should not write
 * 40 rows.
 */
export const POSITION_STEP = 10;

/** The position for an item appended after `lastPosition` (or the first one). */
export function nextPosition(lastPosition: number | null | undefined): number {
  if (lastPosition == null || !Number.isFinite(lastPosition)) return POSITION_STEP;
  return Math.floor(lastPosition / POSITION_STEP) * POSITION_STEP + POSITION_STEP;
}

/**
 * The position that places an item between two neighbours.
 *
 * Returns `null` when the gap has been used up — adjacent integers have nothing
 * between them — which is the caller's signal to renormalise the pack first.
 * That is the one operation that rewrites more than one row, and it happens
 * only when the sparse gaps have actually been exhausted, which takes
 * `log2(10) ≈ 3` insertions at the same point rather than every insertion.
 *
 * `before == null` means "at the very front", `after == null` means "at the
 * very end".
 */
export function positionBetween(
  before: number | null | undefined,
  after: number | null | undefined,
): number | null {
  if (before == null && after == null) return POSITION_STEP;
  if (before == null) return Math.floor((after as number) - POSITION_STEP);
  if (after == null) return nextPosition(before);
  if (after - before < 2) return null;
  return Math.floor((before + after) / 2);
}

/** `[a, b, c]` -> `[10, 20, 30]`. The renormalisation `positionBetween` asks for. */
export function resequence<T>(items: readonly T[]): { item: T; position: number }[] {
  return items.map((item, index) => ({ item, position: (index + 1) * POSITION_STEP }));
}

/* ─── Wire schemas ───────────────────────────────────────────────────────── */

export const PackCreateZ = z.object({
  title: z.string().trim().min(1).max(PACK_TITLE_MAX),
  description: z.string().trim().max(PACK_DESCRIPTION_MAX).optional(),
  kind: z.enum(AUTHORABLE_PACK_KINDS).default('pack'),
  isPublic: z.boolean().default(false),
  /**
   * Song ids to seed the pack with, in order. Optional: the builder creates an
   * empty pack and adds to it, but the "make a pack from this selection" path
   * wants to do both in one request — and one request is one transaction, so a
   * failure half way cannot leave a titled empty pack behind.
   */
  songIds: z.array(z.string().min(1).max(64)).max(PACK_ITEM_MAX).optional(),
});
export type PackCreate = z.infer<typeof PackCreateZ>;

export const PackUpdateZ = z
  .object({
    title: z.string().trim().min(1).max(PACK_TITLE_MAX).optional(),
    description: z.string().trim().max(PACK_DESCRIPTION_MAX).nullable().optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });
export type PackUpdate = z.infer<typeof PackUpdateZ>;

/**
 * Adding, removing and reordering, on one schema.
 *
 * `order` is the full desired id order rather than a `{from, to}` pair. A drag
 * handle produces the whole list anyway, and a positional diff sent by a client
 * whose copy of the pack is one edit stale reorders the wrong row — silently,
 * and in a way neither side can detect. Sending the order you can see means the
 * server can reject an order that does not match the pack it holds.
 */
export const PackItemsZ = z
  .object({
    add: z.array(z.string().min(1).max(64)).max(PACK_ITEM_MAX).optional(),
    remove: z.array(z.string().min(1).max(64)).max(PACK_ITEM_MAX).optional(),
    order: z.array(z.string().min(1).max(64)).max(PACK_ITEM_MAX).optional(),
  })
  .refine((v) => Boolean(v.add?.length || v.remove?.length || v.order?.length), {
    message: 'Nothing to change.',
  });
export type PackItemsPatch = z.infer<typeof PackItemsZ>;

export const PackListQueryZ = z.object({
  /** `mine` includes unpublished drafts; the default browse cannot. */
  scope: z.enum(['public', 'mine']).default('public'),
  kind: z.enum(PACK_KINDS).optional(),
  artist: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().max(64).optional(),
});
export type PackListQuery = z.infer<typeof PackListQueryZ>;

/* ─── The client DTO ─────────────────────────────────────────────────────── */

export interface PackSummary {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  kind: PackKind;
  isPublic: boolean;
  artistKey: string | null;
  songCount: number;
  createdAt: string;
  curator: { id: string; name: string; image: string | null };
  /** True when the viewer may edit this pack — i.e. they curate it. */
  isOwner: boolean;
}

/** `/slice-it/?packId=…` — the library filtered to one pack, in pack order. */
export function packLibraryPath(packId: string): string {
  return `/slice-it?packId=${encodeURIComponent(packId)}`;
}
